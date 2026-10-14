"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BusFront, FileSpreadsheet, Printer, Users } from "lucide-react";
import {
  DEFAULT_BUS_CAPACITY,
  VIOLATION_KIND_LABEL,
  VIOLATION_KIND_ORDER,
  addDaysIso,
  dayOfValue,
  daysInRange,
  firstBoardedTripMap,
  passengerStatus,
  plannedHeadcountForDay,
  plannedTripsForDay,
  reportTripDate,
  reportType,
  routeMatchesHousing,
  todayIso,
  violationKindId,
  type ViolationKind,
} from "@/lib/analytics";
import { reportTripOf, printReportSections, downloadSectionsXls, type ReportSection } from "@/lib/export";
import { employeeCycle } from "@/lib/cycle";
import { currentUser } from "@/lib/authGuard";
import { getCachedSnapshot, loadSnapshot, syncSnapshotFromServer } from "@/lib/offlineStore";

const LINES = ["الصليف", "الحديدة"];
const NUM = (v: number) => new Intl.NumberFormat("ar-EG").format(v);
const PCT = (v: number) => `${new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 1 }).format(Math.round(v * 10) / 10)}%`;

function norm(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

function lineMatches(value: unknown, line: string): boolean {
  const v = norm(value);
  const l = norm(line);
  return !!l && v.includes(l);
}

function pickSystemCapacity(buses: any[]): number {
  const caps = (buses || [])
    .filter((b) => b && b.is_active !== false)
    .map((b) => Number(b.capacity))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!caps.length) return DEFAULT_BUS_CAPACITY;
  const freq = new Map<number, number>();
  for (const c of caps) freq.set(c, (freq.get(c) || 0) + 1);
  let best = caps[0];
  let bestN = 0;
  for (const [c, n] of freq) {
    if (n > bestN || (n === bestN && c > best)) {
      best = c;
      bestN = n;
    }
  }
  return best;
}

/** أول يوم من الأسبوع (السبت) للتاريخ المعطى. */
function weekStart(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  const daysSinceSat = (d.getUTCDay() + 1) % 7;
  return addDaysIso(day, -daysSinceSat);
}

function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

function monthEnd(day: string): string {
  const [y, m] = day.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${day.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

function fmt(day: string): string {
  const parts = day.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : day;
}

type LineStat = {
  line: string;
  pa: number;
  pd: number;
  aa: number;
  ad: number;
  bArr: number;
  bDep: number;
  peArr: number;
  peDep: number;
  vArr: number;
  vDep: number;
};

type ViolType = { kind: ViolationKind; count: number };
type ViolEmployee = { name: string; housing: string; count: number };

type Stat = {
  lines: LineStat[];
  types: ViolType[];
  topViolators: ViolEmployee[];
  totalViol: number;
};

const sumLines = (lines: LineStat[]) =>
  lines.reduce(
    (t, r) => ({
      pa: t.pa + r.pa,
      pd: t.pd + r.pd,
      aa: t.aa + r.aa,
      ad: t.ad + r.ad,
      bArr: t.bArr + r.bArr,
      bDep: t.bDep + r.bDep,
      peArr: t.peArr + r.peArr,
      peDep: t.peDep + r.peDep,
      vArr: t.vArr + r.vArr,
      vDep: t.vDep + r.vDep,
    }),
    { pa: 0, pd: 0, aa: 0, ad: 0, bArr: 0, bDep: 0, peArr: 0, peDep: 0, vArr: 0, vDep: 0 },
  );

type Props = { reports: any[]; employees?: any[]; buses?: any[] };

export default function TripsOverview({ reports, employees, buses }: Props) {
  const [snapEmployees, setSnapEmployees] = useState<any[]>([]);
  const [snapBuses, setSnapBuses] = useState<any[]>([]);
  const usesProps = employees !== undefined;
  const today = useMemo(() => todayIso(), []);

  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [preset, setPreset] = useState("اليوم");

  useEffect(() => {
    if (usesProps) return;
    let alive = true;
    (async () => {
      await syncSnapshotFromServer();
      let snap = null;
      try {
        snap = await loadSnapshot();
      } catch {
        snap = getCachedSnapshot();
      }
      if (!alive || !snap) return;
      setSnapEmployees(snap.employees ?? []);
      setSnapBuses(snap.buses ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [usesProps]);

  const empList = usesProps ? employees! : snapEmployees;
  const busList = buses !== undefined ? buses : snapBuses;

  const empMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const e of empList) {
      if (e?.employee_code != null) m.set(String(e.employee_code), e);
    }
    return m;
  }, [empList]);

  const setDay = (offset: number) => {
    const k = addDaysIso(today, offset);
    setFrom(k);
    setTo(k);
    setPreset(offset < 0 ? "أمس" : offset > 0 ? "غداً" : "اليوم");
  };
  const setThisWeek = () => {
    const start = weekStart(today);
    setFrom(start);
    setTo(addDaysIso(start, 6));
    setPreset("هذا الأسبوع");
  };
  const setThisMonth = () => {
    setFrom(monthStart(today));
    setTo(monthEnd(today));
    setPreset("هذا الشهر");
  };

  const { stat, capacity, lo, hi, dayCount } = useMemo(() => {
    const cap = pickSystemCapacity(busList);
    const lo = from <= to ? from : to;
    const hi = from <= to ? to : from;
    const rangeDays = daysInRange(lo, hi);

    const firstByDay = new Map<string, Map<string, string>>();
    const firstMapFor = (day: string) => {
      let m = firstByDay.get(day);
      if (!m) {
        m = firstBoardedTripMap(reports, day);
        firstByDay.set(day, m);
      }
      return m;
    };
    const dupOf = (day: string, code: string, dir: "arriving" | "departing", tripNo: string) => {
      if (!code) return false;
      const first = firstMapFor(day).get(`${code}|${dir}`);
      return first != null && first !== tripNo;
    };
    const tripNoOf = (r: any) => String(r?.trip_number || r?.raw?.trip?.trip_id || "—").trim() || "؟";

    const lines: LineStat[] = LINES.map((line) => {
      const filter = (emp: any) => lineMatches(emp?.housing_location, line);
      let pa = 0;
      let pd = 0;
      let peArr = 0;
      let peDep = 0;
      for (const day of rangeDays) {
        pa += plannedTripsForDay(empList, day, "arriving", cap, filter);
        pd += plannedTripsForDay(empList, day, "departing", cap, filter);
        peArr += plannedHeadcountForDay(empList, day, "arriving", filter);
        peDep += plannedHeadcountForDay(empList, day, "departing", filter);
      }
      let aa = 0;
      let ad = 0;
      let bArr = 0;
      let bDep = 0;
      let vArr = 0;
      let vDep = 0;
      for (const r of reports) {
        const rd = dayOfValue(reportTripDate(r));
        if (!rd || rd < lo || rd > hi) continue;
        const isArr = reportType(r) === "قادم";
        const dir = isArr ? "arriving" : "departing";
        const viaRoute = routeMatchesHousing(r, line);
        const { employees: ps } = reportTripOf(r);
        const counted = viaRoute ? ps : ps.filter((p: any) => lineMatches(p?.housing_location, line));
        if (!viaRoute && counted.length === 0) continue;
        if (isArr) {
          aa += 1;
          bArr += counted.length;
        } else {
          ad += 1;
          bDep += counted.length;
        }
        const tripNo = tripNoOf(r);
        for (const p of counted) {
          const code = p?.employee_code ? String(p.employee_code).trim() : "";
          const emp = code ? empMap.get(code) ?? null : null;
          const status = passengerStatus(p, emp, rd, dir);
          const kind = violationKindId(status, emp ? employeeCycle(emp, rd)?.status ?? null : null, dupOf(rd, code, dir, tripNo));
          if (kind) {
            if (isArr) vArr += 1;
            else vDep += 1;
          }
        }
      }
      return { line, pa, pd, aa, ad, bArr, bDep, peArr, peDep, vArr, vDep };
    });

    const kindCount = new Map<ViolationKind, number>();
    const empViol = new Map<string, ViolEmployee>();
    let totalViol = 0;
    for (const r of reports) {
      const rd = dayOfValue(reportTripDate(r));
      if (!rd || rd < lo || rd > hi) continue;
      const viaRoute = LINES.some((l) => routeMatchesHousing(r, l));
      const { employees: ps } = reportTripOf(r);
      const counted = viaRoute ? ps : ps.filter((p: any) => LINES.some((l) => lineMatches(p?.housing_location, l)));
      if (!viaRoute && counted.length === 0) continue;
      const isArr = reportType(r) === "قادم";
      const dir = isArr ? "arriving" : "departing";
      const tripNo = tripNoOf(r);
      for (const p of counted) {
        const code = p?.employee_code ? String(p.employee_code).trim() : "";
        const emp = code ? empMap.get(code) ?? null : null;
        const status = passengerStatus(p, emp, rd, dir);
        const kind = violationKindId(status, emp ? employeeCycle(emp, rd)?.status ?? null : null, dupOf(rd, code, dir, tripNo));
        if (!kind) continue;
        kindCount.set(kind, (kindCount.get(kind) || 0) + 1);
        const k = code || String(p?.name || "?");
        const cur = empViol.get(k) || {
          name: emp?.name || p?.name || "—",
          housing: emp?.housing_location || p?.housing_location || "—",
          count: 0,
        };
        cur.count += 1;
        empViol.set(k, cur);
        totalViol += 1;
      }
    }
    const types: ViolType[] = VIOLATION_KIND_ORDER.map((kind) => ({ kind, count: kindCount.get(kind) || 0 })).filter((x) => x.count > 0);
    const topViolators = Array.from(empViol.values()).sort((a, b) => b.count - a.count).slice(0, 10);

    return { stat: { lines, types, topViolators, totalViol }, capacity: cap, lo, hi, dayCount: rangeDays.length };
  }, [empList, busList, reports, empMap, from, to]);

  const total = sumLines(stat.lines);
  const plannedTrips = total.pa + total.pd;
  const actualTrips = total.aa + total.ad;
  const boarders = total.bArr + total.bDep;
  const plannedEmployees = total.peArr + total.peDep;
  const violators = stat.totalViol;
  const coverage = plannedEmployees ? (boarders / plannedEmployees) * 100 : 0;
  const tripCoverage = plannedTrips ? (actualTrips / plannedTrips) * 100 : 0;
  const violationRate = boarders ? (violators / boarders) * 100 : 0;
  const isSingle = lo === hi;
  const periodLabel = isSingle ? `${preset} ${fmt(lo)}` : `${fmt(lo)} ← ${fmt(hi)}`;
  const activePreset = (p: string) => (preset === p ? "active" : "");

  const rowFor = (r: LineStat, isTotal = false) => {
    const totalBoarders = r.bArr + r.bDep;
    const totalViolators = r.vArr + r.vDep;
    const empPlanned = r.peArr + r.peDep;
    const rate = totalBoarders ? (totalViolators / totalBoarders) * 100 : 0;
    const cover = empPlanned ? (totalBoarders / empPlanned) * 100 : 0;
    return (
      <tr key={r.line} className={isTotal ? "ov-total" : undefined}>
        <td className="ov-line"><strong>{r.line}</strong></td>
        <td>{NUM(r.pa)}</td>
        <td>{NUM(r.pd)}</td>
        <td className={r.aa ? "ov-actual" : ""}>{NUM(r.aa)}</td>
        <td className={r.ad ? "ov-actual" : ""}>{NUM(r.ad)}</td>
        <td>{NUM(r.bArr)}</td>
        <td>{NUM(r.bDep)}</td>
        <td><strong>{NUM(totalBoarders)}</strong></td>
        <td>{NUM(r.peArr)}</td>
        <td>{NUM(r.peDep)}</td>
        <td><strong>{NUM(empPlanned)}</strong></td>
        <td className={r.vArr ? "ov-viol" : ""}>{NUM(r.vArr)}</td>
        <td className={r.vDep ? "ov-viol" : ""}>{NUM(r.vDep)}</td>
        <td><strong>{NUM(totalViolators)}</strong></td>
        <td>{totalBoarders ? PCT(rate) : "—"}</td>
        <td><strong>{empPlanned ? PCT(cover) : "—"}</strong></td>
      </tr>
    );
  };

  const buildExport = () => {
    const me = currentUser();
    const who = `${me?.full_name || "—"}${me?.username ? ` (${me.username})` : ""}`;
    const now = new Date().toLocaleString("ar-EG");
    const title = "نظرة سريعة على الرحلات — خطوط الصليف والحديدة";
    const meta = [
      `الفترة: ${isSingle ? periodLabel : `${fmt(lo)} → ${fmt(hi)}`} · ${dayCount} يوم`,
      `المستخدم: ${who}`,
      `السعة المعتمدة: ${capacity} راكب/باص`,
      `تاريخ التصدير: ${now}`,
    ];
    const tr = (vals: Array<string | number>) => vals;

    const sections: ReportSection[] = [
      {
        heading: "المؤشرات العامة",
        headers: ["المؤشر", "القيمة"],
        rows: [
          tr(["الرحلات المفترضة", plannedTrips]),
          tr(["الرحلات الفعلية", actualTrips]),
          tr(["نسبة تغطية الرحلات", plannedTrips ? PCT(tripCoverage) : "—"]),
          tr(["الصاعدون (فعلي)", boarders]),
          tr(["الموظفون المفترض", plannedEmployees]),
          tr(["نسبة التغطية (صاعدون ÷ مفترض)", plannedEmployees ? PCT(coverage) : "—"]),
          tr(["إجمالي المخالفين", violators]),
          tr(["نسبة المخالفة", boarders ? PCT(violationRate) : "—"]),
        ],
      },
      {
        heading: `الرحلات والصاعدون والمخالفون (${isSingle ? periodLabel : `${fmt(lo)} ← ${fmt(hi)}`})`,
        headers: ["الخط (السكن)", "مفترضة قادم", "مفترضة مغادر", "فعلية قادم", "فعلية مغادر", "صاعدون قادمون", "صاعدون مغادرون", "إجمالي الصاعدين", "مفترض قادمون", "مفترض مغادرون", "إجمالي المفترض", "مخالفون قادمون", "مخالفون مغادرون", "إجمالي المخالفين", "نسبة المخالفة %", "نسبة التغطية %"],
        rows: [
          ...stat.lines.map((r) => {
            const tb = r.bArr + r.bDep;
            const tv = r.vArr + r.vDep;
            const ep = r.peArr + r.peDep;
            return tr([r.line, r.pa, r.pd, r.aa, r.ad, r.bArr, r.bDep, tb, r.peArr, r.peDep, ep, r.vArr, r.vDep, tv, tb ? PCT((tv / tb) * 100) : "—", ep ? PCT((tb / ep) * 100) : "—"]);
          }),
          tr(["الإجمالي", total.pa, total.pd, total.aa, total.ad, total.bArr, total.bDep, boarders, total.peArr, total.peDep, plannedEmployees, total.vArr, total.vDep, violators, boarders ? PCT(violationRate) : "—", plannedEmployees ? PCT(coverage) : "—"]),
        ],
      },
      {
        heading: "توزيع المخالفات حسب النوع",
        headers: ["نوع المخالفة", "العدد", "النسبة من الإجمالي"],
        rows: stat.types.length
          ? [
              ...stat.types.map((t) => tr([VIOLATION_KIND_LABEL[t.kind], t.count, violators ? PCT((t.count / violators) * 100) : "—"])),
              tr(["الإجمالي", violators, violators ? "100%" : "—"]),
            ]
          : [tr(["لا توجد مخالفات", 0, "—"])],
      },
      {
        heading: "أكثر الموظفين مخالفة",
        headers: ["#", "الاسم", "السكن", "عدد المخالفات"],
        rows: stat.topViolators.length
          ? stat.topViolators.map((v, i) => tr([i + 1, v.name, v.housing, v.count]))
          : [tr(["لا توجد مخالفات", "", "", ""])],
      },
    ];
    return { title, meta, sections };
  };

  const exportPdf = () => {
    const { title, meta, sections } = buildExport();
    printReportSections(title, meta, sections);
  };
  const exportExcel = () => {
    const { title, meta, sections } = buildExport();
    downloadSectionsXls(`نظرة-سريعة-الرحلات-${lo}_${hi}.xls`, "نظرة سريعة", title, meta, sections);
  };

  return (
    <section className="section ov-section">
      <div className="section-title" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2>نظرة سريعة على الرحلات</h2>
          <span>
            لخطوط سكن <strong>الصليف</strong> و<strong>الحديدة</strong> — اختر الفترة (يوم أو أسبوع أو شهر أو مدى مخصّص) لعرض رحلة ومفترض وفعلي وصاعدين ومخالفين ونِسَبهم.
            السعة المعتمدة {capacity} راكب/باص.
          </span>
        </div>
        <div className="row-actions">
          <button className="secondary-btn" onClick={exportExcel}><FileSpreadsheet size={16} /> Excel</button>
          <button className="secondary-btn" onClick={exportPdf}><Printer size={16} /> طباعة / PDF</button>
        </div>
      </div>

      <div className="ov-filters">
        <div className="ov-days">
          {[
            { offset: -1, label: "أمس" },
            { offset: 0, label: "اليوم" },
            { offset: 1, label: "غداً" },
          ].map((d) => (
            <button key={d.label} className={activePreset(d.label)} onClick={() => setDay(d.offset)}>
              <span>{d.label}</span>
              <small>{fmt(addDaysIso(today, d.offset))}</small>
            </button>
          ))}
          <button className={activePreset("هذا الأسبوع")} onClick={setThisWeek}>
            <span>هذا الأسبوع</span>
            <small>{fmt(weekStart(today))} ← {fmt(addDaysIso(weekStart(today), 6))}</small>
          </button>
          <button className={activePreset("هذا الشهر")} onClick={setThisMonth}>
            <span>هذا الشهر</span>
            <small>{fmt(monthStart(today))} ← {fmt(monthEnd(today))}</small>
          </button>
        </div>

        <div className="ov-range">
          <label>
            <span>من</span>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset("مخصّص"); }} />
          </label>
          <label>
            <span>إلى</span>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset("مخصّص"); }} />
          </label>
        </div>
      </div>

      <div className="stats-grid">
        <div className="metric"><BusFront size={20} /><div><span>الرحلات المفترضة</span><strong>{NUM(plannedTrips)}</strong><small className="muted">قادم {NUM(total.pa)} · مغادر {NUM(total.pd)}</small></div></div>
        <div className="metric"><BusFront size={20} /><div><span>الرحلات الفعلية</span><strong>{NUM(actualTrips)}</strong><small className="muted">تغطية {PCT(tripCoverage)} · قادم {NUM(total.aa)} · مغادر {NUM(total.ad)}</small></div></div>
        <div className="metric"><Users size={20} /><div><span>الصاعدون (فعلي)</span><strong>{NUM(boarders)}</strong><small className="muted">المفترض {NUM(plannedEmployees)} · تغطية {plannedEmployees ? PCT(coverage) : "—"}</small></div></div>
        <div className="metric"><AlertTriangle size={20} /><div><span>إجمالي المخالفين</span><strong>{NUM(violators)}</strong><small className="muted">نسبة المخالفة {boarders ? PCT(violationRate) : "—"} · قادم {NUM(total.vArr)} · مغادر {NUM(total.vDep)}</small></div></div>
      </div>

      <div className="table-card">
        <div className="table-scroll">
          <table className="ov-table">
            <thead>
              <tr>
                <th rowSpan={2} className="ov-line">الخط (السكن)</th>
                <th colSpan={4} className="ov-day">الرحلات — {periodLabel}<small>{dayCount} يوم</small></th>
                <th colSpan={3} className="ov-day">الصاعدون (فعلي)</th>
                <th colSpan={3} className="ov-day">الموظفون المفترض</th>
                <th colSpan={4} className="ov-day">المخالفون</th>
                <th rowSpan={2} className="ov-day">نسبة التغطية<small>صاعدون ÷ مفترض</small></th>
              </tr>
              <tr>
                <th>مفترضة قادم</th>
                <th>مفترضة مغادر</th>
                <th>فعلية قادم</th>
                <th>فعلية مغادر</th>
                <th>صاعدون قادمون</th>
                <th>صاعدون مغادرون</th>
                <th>إجمالي الصاعدين</th>
                <th>مفترض قادمون</th>
                <th>مفترض مغادرون</th>
                <th>إجمالي المفترض</th>
                <th>مخالفون قادمون</th>
                <th>مخالفون مغادرون</th>
                <th>إجمالي المخالفين</th>
                <th>نسبة المخالفة</th>
              </tr>
            </thead>
            <tbody>
              {stat.lines.map((r) => rowFor(r))}
              {rowFor({ line: "الإجمالي", ...total }, true)}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ov-two">
        <div className="table-card ov-card">
          <div className="ov-card-title">
            توزيع المخالفات حسب النوع
            <small>{periodLabel} · إجمالي المخالفين {NUM(violators)}</small>
          </div>
          <div className="table-scroll">
            <table className="ov-mini">
              <thead>
                <tr><th>نوع المخالفة</th><th>العدد</th><th>النسبة من الإجمالي</th></tr>
              </thead>
              <tbody>
                {stat.types.length ? (
                  stat.types.map((t) => (
                    <tr key={t.kind}>
                      <td className="ov-line">{VIOLATION_KIND_LABEL[t.kind]}</td>
                      <td>{NUM(t.count)}</td>
                      <td><strong>{violators ? PCT((t.count / violators) * 100) : "—"}</strong></td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={3} className="muted">لا توجد مخالفات</td></tr>
                )}
                {violators > 0 && (
                  <tr className="ov-total"><td className="ov-line">الإجمالي</td><td>{NUM(violators)}</td><td>100%</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="table-card ov-card">
          <div className="ov-card-title">
            أكثر الموظفين مخالفة
            <small>{periodLabel} · أعلى {NUM(Math.min(10, stat.topViolators.length))} موظف</small>
          </div>
          <div className="table-scroll">
            <table className="ov-mini">
              <thead>
                <tr><th>#</th><th>الاسم</th><th>السكن</th><th>المخالفات</th></tr>
              </thead>
              <tbody>
                {stat.topViolators.length ? (
                  stat.topViolators.map((v, i) => (
                    <tr key={`${v.name}-${i}`}>
                      <td>{NUM(i + 1)}</td>
                      <td className="ov-line">{v.name}</td>
                      <td>{v.housing}</td>
                      <td className={v.count ? "ov-viol" : ""}>{NUM(v.count)}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={4} className="muted">لا توجد مخالفات</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="ov-legend">
        <span><BusFront size={14} /> «مفترضة» = عدد الباصات المتوقّعة (عدد الموظفين ÷ السعة) · «فعلية» = عدد رحلات تقارير السائقين.</span>
        <span><AlertTriangle size={14} /> «مخالف» = من يصعد في غير دوامه (يوم راحة/إجازة، ترتيب مواصلات، تسجيل مكرر، غير مسجّل، غير موظف).</span>
      </div>
    </section>
  );
}
