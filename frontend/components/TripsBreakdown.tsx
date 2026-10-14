"use client";
import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, MessageCircle, Printer, Users } from "lucide-react";
import {
  addDaysIso,
  dayOfValue,
  reportBusNumber,
  reportDriverName,
  reportRouteName,
  reportTripDate,
  reportType,
  todayIso,
} from "@/lib/analytics";
import { downloadTable, openWhatsAppText, printTableReport, reportTripOf, tableToText } from "@/lib/export";
import { getCachedSnapshot, loadSnapshot, syncSnapshotFromServer } from "@/lib/offlineStore";

type GroupKey = "driver" | "bus" | "housing";

const NUM = (v: number) => new Intl.NumberFormat("ar-EG").format(v);

const GROUPS: { key: GroupKey; label: string; column: string }[] = [
  { key: "driver", label: "حسب السائق", column: "السائق" },
  { key: "bus", label: "حسب الباص", column: "الباص" },
  { key: "housing", label: "حسب السكن", column: "السكن" },
];

const PRESETS: { key: string; label: string }[] = [
  { key: "today", label: "اليوم" },
  { key: "week", label: "7 أيام" },
  { key: "30", label: "30 يوماً" },
  { key: "month", label: "هذا الشهر" },
];

function norm(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

/** إسناد الرحلة إلى سكن: من اسم الخط إن احتوى على اسم السكن، وإلا الأغلبية بين صعّاد الرحلة. */
function assignHousing(report: any, housings: string[]): string {
  const route = norm(reportRouteName(report));
  const sorted = [...housings].sort((a, b) => norm(b).length - norm(a).length);
  for (const h of sorted) {
    const n = norm(h);
    if (n && route.includes(n)) return h;
  }
  const freq = new Map<string, number>();
  const { employees } = reportTripOf(report);
  for (const p of employees) {
    const h = String(p?.housing_location ?? "").trim();
    if (h) freq.set(h, (freq.get(h) || 0) + 1);
  }
  let best = "";
  let bestN = 0;
  for (const [h, n] of freq) {
    if (n > bestN) {
      best = h;
      bestN = n;
    }
  }
  return best || "غير محدد";
}

function presetRange(preset: string): { from: string; to: string } {
  const t = todayIso();
  if (preset === "today") return { from: t, to: t };
  if (preset === "week") return { from: addDaysIso(t, -6), to: t };
  if (preset === "30") return { from: addDaysIso(t, -29), to: t };
  return { from: `${t.slice(0, 7)}-01`, to: t };
}

type Row = { key: string; arriving: number; departing: number; total: number; boarders: number };

type Props = { reports: any[]; employees?: any[]; onRefresh?: () => void };

export default function TripsBreakdown({ reports, employees, onRefresh }: Props) {
  const [snapEmployees, setSnapEmployees] = useState<any[]>([]);
  const usesProps = employees !== undefined;
  const [from, setFrom] = useState(() => addDaysIso(todayIso(), -6));
  const [to, setTo] = useState(() => todayIso());
  const [group, setGroup] = useState<GroupKey>("driver");
  const [live, setLive] = useState(true);

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
      if (alive && snap) setSnapEmployees(snap.employees ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [usesProps]);

  const empList = usesProps ? employees! : snapEmployees;

  useEffect(() => {
    if (!live || !onRefresh) return;
    const t = window.setInterval(() => onRefresh(), 60000);
    return () => window.clearInterval(t);
  }, [live, onRefresh]);

  const housingOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of empList) {
      const h = String(e?.housing_location ?? "").trim();
      if (h) set.add(h);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ar"));
  }, [empList]);

  const { rows, totals } = useMemo(() => {
    const index = new Map<string, Row>();
    let arr = 0;
    let dep = 0;
    let boarders = 0;
    let trips = 0;

    for (const r of reports) {
      const day = dayOfValue(reportTripDate(r));
      if (!day || day < from || day > to) continue;
      const isArriving = reportType(r) === "قادم";
      const { employees: ps } = reportTripOf(r);

      let key: string;
      if (group === "driver") key = reportDriverName(r);
      else if (group === "bus") key = reportBusNumber(r);
      else key = assignHousing(r, housingOptions);

      let row = index.get(key);
      if (!row) {
        row = { key, arriving: 0, departing: 0, total: 0, boarders: 0 };
        index.set(key, row);
      }
      if (isArriving) {
        row.arriving += 1;
        arr += 1;
      } else {
        row.departing += 1;
        dep += 1;
      }
      row.total += 1;
      row.boarders += ps.length;
      trips += 1;
      boarders += ps.length;
    }

    const rows = Array.from(index.values()).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key, "ar"));
    return { rows, totals: { arriving: arr, departing: dep, trips, boarders } };
  }, [reports, from, to, group, housingOptions]);

  const meta = GROUPS.find((g) => g.key === group)!;
  const headers = ["#", meta.column, "رحلات قادمة", "رحلات مغادرة", "إجمالي الرحلات", "الصاعدون"];
  const tableRows = (): Array<Array<string | number>> =>
    rows.map((r, i) => [i + 1, r.key, r.arriving, r.departing, r.total, r.boarders]);
  const title = `عدد الرحلات — ${meta.label}`;
  const subtitle = `الفترة: من ${from} إلى ${to} · إجمالي الرحلات: ${totals.trips} · الصاعدون: ${totals.boarders}`;

  function applyPreset(key: string) {
    const { from: f, to: t } = presetRange(key);
    setFrom(f);
    setTo(t);
  }

  return (
    <section className="section">
      <div className="section-title" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2>عدد الرحلات حسب الفترة</h2>
          <span>تحدّد الفترة والفئة ثم تطبع التقرير: عدد الرحلات لكل باص أو لكل سائق، أو إجمالي الرحلات على مستوى كل سكن (مثل الحديدة أو الصليف).</span>
        </div>
        <div className="row-actions" style={{ alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
            <span>تحديث تلقائي</span>
          </label>
        </div>
      </div>

      <div className="form-panel import-panel" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <label className="field" style={{ minWidth: 150 }}>
          <span>من تاريخ</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field" style={{ minWidth: 150 }}>
          <span>إلى تاريخ</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <div className="row-actions">
          {PRESETS.map((p) => (
            <button key={p.key} className="secondary-btn" onClick={() => applyPreset(p.key)}>{p.label}</button>
          ))}
        </div>
        <label className="field" style={{ minWidth: 140 }}>
          <span>التجميع</span>
          <select value={group} onChange={(e) => setGroup(e.target.value as GroupKey)}>
            {GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </label>
        <span style={{ flex: 1, minWidth: 20 }} />
        <button className="secondary-btn" onClick={() => downloadTable(title, `${title}-${from}-${to}.xls`, headers, tableRows())}>
          <FileSpreadsheet size={16} /> Excel
        </button>
        <button className="secondary-btn" onClick={() => printTableReport(title, subtitle, headers, tableRows())}>
          <Printer size={16} /> طباعة / PDF
        </button>
        <button className="secondary-btn" onClick={() => openWhatsAppText(tableToText(title, subtitle, headers, tableRows()))}>
          <MessageCircle size={16} /> واتساب
        </button>
      </div>

      <div className="stats-grid">
        <div className="metric"><Users size={20} /><div><span>إجمالي الرحلات</span><strong>{NUM(totals.trips)}</strong></div></div>
        <div className="metric"><Users size={20} /><div><span>رحلات قادمة</span><strong>{NUM(totals.arriving)}</strong></div></div>
        <div className="metric"><Users size={20} /><div><span>رحلات مغادرة</span><strong>{NUM(totals.departing)}</strong></div></div>
        <div className="metric"><Users size={20} /><div><span>إجمالي الصاعدين</span><strong>{NUM(totals.boarders)}</strong></div></div>
      </div>

      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key}>
                  <td>{i + 1}</td>
                  <td><strong>{r.key}</strong></td>
                  <td>{NUM(r.arriving)}</td>
                  <td>{NUM(r.departing)}</td>
                  <td><strong>{NUM(r.total)}</strong></td>
                  <td>{NUM(r.boarders)}</td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="ov-total">
                  <td>—</td>
                  <td><strong>الإجمالي</strong></td>
                  <td><strong>{NUM(totals.arriving)}</strong></td>
                  <td><strong>{NUM(totals.departing)}</strong></td>
                  <td><strong>{NUM(totals.trips)}</strong></td>
                  <td><strong>{NUM(totals.boarders)}</strong></td>
                </tr>
              )}
              {!rows.length && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>
                    لا توجد رحلات فعلية في الفترة {from} — {to}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
