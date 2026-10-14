"use client";
import { useEffect, useMemo, useState } from "react";
import { Activity, BusFront, FileSpreadsheet, MessageCircle, Printer, RefreshCw, Users } from "lucide-react";
import {
  DEFAULT_BUS_CAPACITY,
  DIRECTION_LABEL,
  GRANULARITY_LABEL,
  addDaysIso,
  computeAnalytics,
  deltaPct,
  housingOf,
  pct,
  reportBusNumber,
  reportDriverName,
  todayIso,
  type Bucket,
  type DirectionFilter,
  type Granularity,
} from "@/lib/analytics";
import { downloadTable, openWhatsAppText, printTableReport, reportTripOf, tableToText } from "@/lib/export";
import { getCachedSnapshot, loadSnapshot, syncSnapshotFromServer } from "@/lib/offlineStore";

type Props = { reports: any[]; onRefresh?: () => void };

const NUM = (v: number) => new Intl.NumberFormat("ar-EG").format(v);
const PCT = (v: number) => `${NUM(Math.round(v * 10) / 10)}%`;

/** سعة الباص السائدة في بيانات النظام (الأكثر تكراراً بين الباصات الفعّالة). */
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

export default function AnalyticsCharts({ reports, onRefresh }: Props) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [snapMsg, setSnapMsg] = useState("");

  const [to, setTo] = useState(todayIso());
  const [from, setFrom] = useState(addDaysIso(todayIso(), -13));
  const [gran, setGran] = useState<Granularity>("day");
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [driver, setDriver] = useState("");
  const [bus, setBus] = useState("");
  const [housing, setHousing] = useState("");
  const [capacity, setCapacity] = useState(DEFAULT_BUS_CAPACITY);
  const [live, setLive] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const sync = await syncSnapshotFromServer();
      if (!alive) return;
      if (!sync.ok) setSnapMsg(sync.error || "");
      const apply = (snap: { employees?: any[]; buses?: any[] } | null | undefined) => {
        if (!alive || !snap) return;
        setEmployees(snap.employees ?? []);
        setBuses(snap.buses ?? []);
        setCapacity(pickSystemCapacity(snap.buses ?? []));
      };
      try {
        apply(await loadSnapshot());
      } catch {
        apply(getCachedSnapshot());
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!live || !onRefresh) return;
    const t = window.setInterval(() => onRefresh(), 30000);
    return () => window.clearInterval(t);
  }, [live, onRefresh]);

  const driverOptions = useMemo(
    () => Array.from(new Set(reports.map((r) => reportDriverName(r)))).filter((v) => v && v !== "—").sort((a, b) => a.localeCompare(b, "ar")),
    [reports],
  );
  const busOptions = useMemo(
    () => Array.from(new Set(reports.map((r) => reportBusNumber(r)))).filter((v) => v && v !== "—").sort((a, b) => a.localeCompare(b, "ar")),
    [reports],
  );
  const housingOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of employees) {
      const h = String(e?.housing_location ?? "").trim();
      if (h) set.add(h);
    }
    for (const r of reports) {
      const { employees: ps } = reportTripOf(r);
      for (const p of ps) {
        const h = housingOf(p, null);
        if (h) set.add(h);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ar"));
  }, [employees, reports]);

  const result = useMemo(
    () => computeAnalytics({ employees, reports, filters: { from, to, gran, direction, driver, bus, housing, capacity } }),
    [employees, reports, from, to, gran, direction, driver, bus, housing, capacity],
  );

  const { buckets, actual, previous, drivers, buses: busStats } = result;
  const compliance = pct(actual.actualTrips, actual.planned);
  const violationRate = pct(actual.violators, actual.boarders);
  const trampDelta = deltaPct(actual.actualTrips, previous.actualTrips);
  const touristsDelta = deltaPct(actual.boarders, previous.boarders);

  function applyPreset(preset: "today" | "week" | "month" | "30") {
    const t = todayIso();
    if (preset === "today") {
      setFrom(t);
      setTo(t);
      setGran("day");
    } else if (preset === "week") {
      setFrom(addDaysIso(t, -6));
      setTo(t);
      setGran("day");
    } else if (preset === "month") {
      setFrom(`${t.slice(0, 7)}-01`);
      setTo(t);
      setGran("day");
    } else {
      setFrom(addDaysIso(t, -29));
      setTo(t);
      setGran("day");
    }
  }

  const seriesRows = () =>
    buckets.map((b) => [b.label, b.plannedDeparting, b.plannedArriving, b.actualDeparting, b.actualArriving, b.boarders, b.violators]);
  const seriesHeaders = ["الفترة", "مفترض مغادر", "مفترض قادم", "فعلي مغادر", "فعلي قادم", "الصاعدون", "المخالفون"];

  const driverRows = () =>
    drivers.map((d, i) => [i + 1, d.driver, d.departing, d.arriving, d.total, d.boarders, d.violators]);
  const driverHeaders = ["#", "السائق", "مغادر", "قادم", "الإجمالي", "الصاعدون", "المخالفون"];

  const busRows = () => busStats.map((b, i) => [i + 1, b.bus, b.departing, b.arriving, b.total, b.boarders]);
  const busHeaders = ["#", "الباص", "مغادر", "قادم", "الإجمالي", "الصاعدون"];

  return (
    <>
      <section className="section">
        <div className="section-title" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2>لوحة التحليلات وحركة الرحلات</h2>
            <span>مقارنة مستمرة بين الرحلات الفعلية والمفترضة (عدد الموظفين المجدولين ÷ سعة الباص) مع الصاعدين والمخالفين.</span>
          </div>
          <div className="row-actions" style={{ alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
              <span>تحديث تلقائي</span>
            </label>
            <button className="secondary-btn" onClick={onRefresh}><RefreshCw size={16} /> تحديث</button>
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
          <label className="field" style={{ minWidth: 120 }}>
            <span>النطاق</span>
            <select value={gran} onChange={(e) => setGran(e.target.value as Granularity)}>
              {(["day", "week", "month"] as Granularity[]).map((g) => <option key={g} value={g}>{GRANULARITY_LABEL[g]}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: 110 }}>
            <span>الاتجاه</span>
            <select value={direction} onChange={(e) => setDirection(e.target.value as DirectionFilter)}>
              {(["all", "arriving", "departing"] as DirectionFilter[]).map((d) => <option key={d} value={d}>{DIRECTION_LABEL[d]}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: 170 }}>
            <span>السائق</span>
            <select value={driver} onChange={(e) => setDriver(e.target.value)}>
              <option value="">كل السائقين</option>
              {driverOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: 130 }}>
            <span>الباص</span>
            <select value={bus} onChange={(e) => setBus(e.target.value)}>
              <option value="">كل الباصات</option>
              {busOptions.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: 150 }}>
            <span>السكن</span>
            <select value={housing} onChange={(e) => setHousing(e.target.value)}>
              <option value="">كل أماكن السكن</option>
              {housingOptions.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: 120 }}>
            <span>سعة الباص</span>
            <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Math.max(1, Number(e.target.value) || DEFAULT_BUS_CAPACITY))} />
          </label>
          <div className="row-actions" style={{ flexWrap: "wrap" }}>
            <button className="secondary-btn" onClick={() => applyPreset("today")}>اليوم</button>
            <button className="secondary-btn" onClick={() => applyPreset("week")}>7 أيام</button>
            <button className="secondary-btn" onClick={() => applyPreset("30")}>30 يوماً</button>
            <button className="secondary-btn" onClick={() => applyPreset("month")}>هذا الشهر</button>
          </div>
          <span style={{ flex: 1, minWidth: 20 }} />
          <button className="secondary-btn" onClick={() => downloadTable("تحليلات الرحلات", `تحليلات-الرحلات-${from}-${to}.xls`, seriesHeaders, seriesRows())}><FileSpreadsheet size={16} /> Excel</button>
          <button className="secondary-btn" onClick={() => printTableReport("لوحة التحليلات", `من ${from} إلى ${to} · ${GRANULARITY_LABEL[gran]}`, seriesHeaders, seriesRows())}><Printer size={16} /> PDF</button>
          <button className="secondary-btn" onClick={() => openWhatsAppText(tableToText("لوحة التحليلات", `من ${from} إلى ${to}`, seriesHeaders, seriesRows()))}><MessageCircle size={16} /> واتساب</button>
        </div>
        {snapMsg && <div className="alert warning">{snapMsg} — تُحسب الرحلات المفترضة من آخر نسخة بيانات متاحة على الجهاز.</div>}

        <div className="stats-grid">
          <div className="metric"><Activity size={20} /><div><span>الرحلات الفعلية</span><strong>{NUM(actual.actualTrips)}</strong>{trampDelta !== null && <small className={trampDelta >= 0 ? "delta up" : "delta down"}>{trampDelta >= 0 ? "▲" : "▼"} {PCT(Math.abs(trampDelta))} عن الفترة السابقة</small>}</div></div>
          <div className="metric"><BusFront size={20} /><div><span>الرحلات المفترضة</span><strong>{NUM(actual.planned)}</strong><small className="muted">التغطية {PCT(compliance)} من الخطة</small></div></div>
          <div className="metric"><Users size={20} /><div><span>الصاعدون</span><strong>{NUM(actual.boarders)}</strong>{touristsDelta !== null && <small className={touristsDelta >= 0 ? "delta up" : "delta down"}>{touristsDelta >= 0 ? "▲" : "▼"} {PCT(Math.abs(touristsDelta))} عن الفترة السابقة</small>}</div></div>
          <div className="metric"><Users size={20} /><div><span>المخالفون</span><strong>{NUM(actual.violators)}</strong><small className="muted">{PCT(violationRate)} من الصاعدين</small></div></div>
        </div>
      </section>

      <section className="section">
        <div className="section-title">
          <div><h2>الرحلات حسب اليوم (مغادر / قادم)</h2><span>مقارنة الفعلي بالمفترض لكل اتجاه على حدة · {GRANULARITY_LABEL[gran]} · يتحرك تلقائياً مع ورود تقارير الرحلات.</span></div>
        </div>
        <div className="chart-card">
          <DirectionChart buckets={buckets} direction={direction} />
        </div>
      </section>

      <section className="section">
        <div className="section-title">
          <div><h2>الرحلات الفعلية حسب السائق</h2><span>مغادر/قادم لكل سائق خلال الفترة المحددة{driver ? ` — ${driver}` : ""}.</span></div>
          <div className="row-actions">
            <button className="secondary-btn" onClick={() => downloadTable("رحلات السائقين", `رحلات-السائقين-${from}-${to}.xls`, driverHeaders, driverRows())}><FileSpreadsheet size={16} /> Excel</button>
            <button className="secondary-btn" onClick={() => printTableReport("الرحلات حسب السائق", `من ${from} إلى ${to}`, driverHeaders, driverRows())}><Printer size={16} /> PDF</button>
          </div>
        </div>
        <div className="chart-card">
          {drivers.length ? <DriverBars drivers={drivers} /> : <div className="chart-empty">لا توجد رحلات فعلية في هذه الفترة.</div>}
        </div>
      </section>

      <section className="section">
        <div className="section-title">
          <div><h2>الصاعدون والمخالفون</h2><span>عدد الصاعدين مقابل من خالف خطة الدوام في كل فترة.</span></div>
          <div className="row-actions">
            <button className="secondary-btn" onClick={() => downloadTable("الصاعدون والمخالفون", `الصاعدون-${from}-${to}.xls`, ["الفترة", "الصاعدون", "المخالفون"], buckets.map((b) => [b.label, b.boarders, b.violators]))}><FileSpreadsheet size={16} /> Excel</button>
          </div>
        </div>
        <div className="chart-card">
          <BoardersBars buckets={buckets} />
        </div>
      </section>

      {busStats.length > 0 && (
        <section className="section">
          <div className="section-title">
            <div><h2>الرحلات حسب الباص</h2><span>توزيع الرحلات الفعلية على الباصات خلال الفترة.</span></div>
            <div className="row-actions">
              <button className="secondary-btn" onClick={() => downloadTable("رحلات الباصات", `رحلات-الباصات-${from}-${to}.xls`, busHeaders, busRows())}><FileSpreadsheet size={16} /> Excel</button>
            </div>
          </div>
          <div className="table-card">
            <div className="table-scroll">
              <table>
                <thead><tr>{busHeaders.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {busStats.map((b) => (
                    <tr key={b.bus}>
                      <td><BusFront size={15} /></td>
                      <td><strong>{b.bus}</strong></td>
                      <td>{NUM(b.departing)}</td>
                      <td>{NUM(b.arriving)}</td>
                      <td>{NUM(b.total)}</td>
                      <td>{NUM(b.boarders)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* مخطط الرحلات حسب اليوم (مغادر / قادم) — الفعلي مقابل المفترض           */
/* ------------------------------------------------------------------ */

type TrendSeries = { key: string; label: string; color: string; dash: string; values: number[] };

function DirectionChart({ buckets, direction }: { buckets: Bucket[]; direction: DirectionFilter }) {
  const w = 780;
  const h = 270;
  const padL = 38;
  const padR = 14;
  const padT = 18;
  const padB = 34;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const n = buckets.length;

  if (!n) return <div className="chart-empty">لا توجد بيانات في هذه الفترة.</div>;

  const series: TrendSeries[] = [];
  if (direction === "all" || direction === "departing") {
    series.push({ key: "ad", label: "فعلي مغادر", color: "#1769e0", dash: "", values: buckets.map((b) => b.actualDeparting) });
    series.push({ key: "pd", label: "مفترض مغادر", color: "#1769e0", dash: "6 5", values: buckets.map((b) => b.plannedDeparting) });
  }
  if (direction === "all" || direction === "arriving") {
    series.push({ key: "aa", label: "فعلي قادم", color: "#0f9d68", dash: "", values: buckets.map((b) => b.actualArriving) });
    series.push({ key: "pa", label: "مفترض قادم", color: "#0f9d68", dash: "6 5", values: buckets.map((b) => b.plannedArriving) });
  }

  const maxV = Math.max(1, ...series.flatMap((s) => s.values));
  const x = (i: number) => (n <= 1 ? padL + innerW / 2 : padL + (i * innerW) / (n - 1));
  const y = (v: number) => padT + (1 - v / maxV) * innerH;
  const linePath = (vals: number[]) => vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const labelEvery = Math.ceil(n / 10);
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: Math.round(maxV * f), yy: y(maxV * f) }));

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} className="chart-svg" role="img" aria-label="الرحلات حسب اليوم (مغادر/قادم)">
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={g.yy} y2={g.yy} stroke="#e3e9f0" strokeWidth="1" />
            <text x={padL - 6} y={g.yy + 4} textAnchor="end" fontSize="10" fill="#8b97a6">{g.v}</text>
          </g>
        ))}
        {series.map((s) => (
          <path key={s.key} d={linePath(s.values)} fill="none" stroke={s.color} strokeWidth={s.dash ? 2 : 2.5} strokeDasharray={s.dash || undefined} />
        ))}
        {n <= 60 &&
          series.map((s) =>
            buckets.map((b, i) => (
              <circle key={`${s.key}-${b.key}`} cx={x(i)} cy={y(s.values[i])} r="2.6" fill={s.color}>
                <title>{`${b.label} · ${s.label}: ${s.values[i]}`}</title>
              </circle>
            )),
          )}
        {n <= 16 &&
          series
            .filter((s) => s.key === "ad" || s.key === "aa")
            .map((s) =>
              buckets.map((b, i) => {
                const v = s.values[i];
                if (!v) return null;
                return (
                  <text key={`v-${s.key}-${b.key}`} x={x(i)} y={y(v) - 5} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={s.color}>
                    {v}
                  </text>
                );
              }),
            )}
        {buckets.map((b, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text key={`l-${b.key}`} x={x(i)} y={h - 12} textAnchor="middle" fontSize="10" fill="#8b97a6">{b.label}</text>
          ) : null,
        )}
      </svg>
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.dash ? `repeating-linear-gradient(90deg, ${s.color} 0 5px, transparent 5px 9px)` : s.color }} /> {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* أعمدة الرحلات لكل سائق                                              */
/* ------------------------------------------------------------------ */

function DriverBars({ drivers }: { drivers: { driver: string; departing: number; arriving: number; total: number }[] }) {
  const shown = drivers.slice(0, 14);
  const w = Math.max(620, shown.length * 74);
  const h = 250;
  const padL = 30;
  const padB = 56;
  const padT = 16;
  const innerH = h - padT - padB;
  const maxV = Math.max(1, ...shown.map((d) => Math.max(d.departing, d.arriving)));
  const groupW = (w - padL - 14) / Math.max(1, shown.length);
  const barW = Math.min(22, groupW / 2.6);
  const y = (v: number) => padT + (1 - v / maxV) * innerH;

  return (
    <div className="chart-wrap">
      <div className="chart-scroll">
        <svg viewBox={`0 0 ${w} ${h}`} className="chart-svg" role="img" aria-label="الرحلات حسب السائق">
          {[0, 0.5, 1].map((f, i) => {
            const v = Math.round(maxV * f);
            return (
              <g key={i}>
                <line x1={padL} x2={w - 6} y1={y(v)} y2={y(v)} stroke="#e3e9f0" />
                <text x={padL - 5} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#8b97a6">{v}</text>
              </g>
            );
          })}
          {shown.map((d, i) => {
            const cx = padL + groupW * (i + 0.5);
            const x1 = cx - barW - 2;
            const x2 = cx + 2;
            return (
              <g key={d.driver}>
                <rect x={x1} y={y(d.departing)} width={barW} height={innerH + padT - y(d.departing)} rx="3" fill="#1769e0"><title>{`${d.driver} — مغادر ${d.departing}`}</title></rect>
                <rect x={x2} y={y(d.arriving)} width={barW} height={innerH + padT - y(d.arriving)} rx="3" fill="#0f9d68"><title>{`${d.driver} — قادم ${d.arriving}`}</title></rect>
                <text x={cx} y={h - 38} textAnchor="middle" fontSize="10" fill="#5b6775">{truncate(d.driver, 10)}</text>
                <text x={cx} y={h - 24} textAnchor="middle" fontSize="10" fontWeight="700" fill="#17202b">{d.total}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="chart-legend">
        <span><i style={{ background: "#1769e0" }} /> مغادر</span>
        <span><i style={{ background: "#0f9d68" }} /> قادم</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* أعمدة الصاعدين والمخالفين                                           */
/* ------------------------------------------------------------------ */

function BoardersBars({ buckets }: { buckets: Bucket[] }) {
  const n = buckets.length;
  if (!n) return <div className="chart-empty">لا توجد بيانات في هذه الفترة.</div>;
  const w = Math.max(620, n * 46);
  const h = 230;
  const padL = 34;
  const padB = 46;
  const padT = 16;
  const innerH = h - padT - padB;
  const maxV = Math.max(1, ...buckets.map((b) => Math.max(b.boarders, b.violators)));
  const groupW = (w - padL - 12) / n;
  const barW = Math.min(16, groupW / 2.6);
  const y = (v: number) => padT + (1 - v / maxV) * innerH;
  const labelEvery = Math.ceil(n / 16);

  return (
    <div className="chart-wrap">
      <div className="chart-scroll">
        <svg viewBox={`0 0 ${w} ${h}`} className="chart-svg" role="img" aria-label="الصاعدون والمخالفون">
          {[0, 0.5, 1].map((f, i) => {
            const v = Math.round(maxV * f);
            return (
              <g key={i}>
                <line x1={padL} x2={w - 6} y1={y(v)} y2={y(v)} stroke="#e3e9f0" />
                <text x={padL - 5} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#8b97a6">{v}</text>
              </g>
            );
          })}
          {buckets.map((b, i) => {
            const cx = padL + groupW * (i + 0.5);
            const x1 = cx - barW - 2;
            const x2 = cx + 2;
            return (
              <g key={b.key}>
                <rect x={x1} y={y(b.boarders)} width={barW} height={innerH + padT - y(b.boarders)} rx="3" fill="#0f9d68"><title>{`${b.label} — الصاعدون ${b.boarders}`}</title></rect>
                <rect x={x2} y={y(b.violators)} width={barW} height={innerH + padT - y(b.violators)} rx="3" fill="#dc3e55"><title>{`${b.label} — المخالفون ${b.violators}`}</title></rect>
                {i % labelEvery === 0 && <text x={cx} y={h - 12} textAnchor="middle" fontSize="10" fill="#8b97a6">{b.label}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="chart-legend">
        <span><i style={{ background: "#0f9d68" }} /> الصاعدون</span>
        <span><i style={{ background: "#dc3e55" }} /> المخالفون</span>
      </div>
    </div>
  );
}

function truncate(text: string, max: number): string {
  const t = String(text || "");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
