import { employeeCycle } from "./cycle";
import {
  dayOfValue,
  firstBoardedTripMap,
  passengerStatus,
  reportRouteName,
  violationKindId,
} from "./analytics";
import { reportTripOf } from "./export";

/* ------------------------------------------------------------------ */
/* إعدادات التقييم                                                     */
/* ------------------------------------------------------------------ */

/** أوزان التقييم (المجموع 100). «لم يرحل» = 0. */
export const DRIVER_SCORE = {
  base: 50, // رحّل فعلاً (له رحلات في النظام)
  timing: 30, // الالتزام بالنوافذ الزمنية المثالية
  violations: 20, // خصم المخالفات
  penaltyTransfer: 3, // خصم لكل «مخالف لخطة النقل»
  penaltyOther: 1, // خصم لكل باقي المخالفات
} as const;

export type TripLine = "الحديدة" | "الصليف";

/** دقائق من منتصف الليل. نهاية 1440 = 24:00، والنوافذ الليلية تُدار بمقارنة مباشرة. */
export type TimeWindow = [number, number];

/** النوافذ الزمنية المثالية لكل خط واتجاه. */
export const TRIP_TIME_WINDOWS: Record<TripLine, Record<"قادم" | "مغادر", TimeWindow[]>> = {
  الحديدة: {
    قادم: [[360, 510], [1080, 1230]], // 06:00-08:30 · 18:00-20:30
    مغادر: [[480, 600], [960, 1080], [1200, 1320]], // 08:00-10:00 · 16:00-18:00 · 20:00-22:00
  },
  الصليف: {
    قادم: [[420, 480], [900, 960], [1140, 1200], [1380, 1440]], // 07-08 · 15-16 · 19-20 · 23-24
    مغادر: [[480, 540], [960, 1020], [1200, 1260], [0, 60]], // 08-09 · 16-17 · 20-21 · 00-01
  },
};

const LINES: TripLine[] = ["الحديدة", "الصليف"];

/* ------------------------------------------------------------------ */
/* أدوات                                                               */
/* ------------------------------------------------------------------ */

function normalize(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

/** الخط المطابق لاسم المسار (يحتوي «الحديدة» أو «الصليف»)، أو null. */
export function lineOfRoute(route: unknown): TripLine | null {
  const r = normalize(route);
  if (!r) return null;
  for (const line of LINES) if (r.includes(normalize(line))) return line;
  return null;
}

/** الوقت الفعلي للرحلة (البداية ثم الإكمال ثم الانطلاق المخطط). */
export function reportActualTime(report: any): string | null {
  const { trip } = reportTripOf(report);
  return trip?.started_at || report?.started_at || trip?.completed_at || report?.completed_at || null;
}

/** دقائق اليوم بالتوقيت المحلي (مطابق للعرض في التطبيق). */
export function minutesOfDay(value: string | null | undefined): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

/** هل تقع الدقيقة داخل إحدى النوافذ؟ */
export function withinAnyWindow(min: number, windows: TimeWindow[]): boolean {
  return windows.some(([a, b]) => min >= a && min <= b);
}

export function minutesLabel(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function windowsLabel(windows: TimeWindow[]): string {
  return windows.map(([a, b]) => `${minutesLabel(a)}–${minutesLabel(b)}`).join(" · ");
}

function reportMatchesDriver(report: any, driver: { username: string; full_name: string; driver_code?: string | null }): boolean {
  const { trip } = reportTripOf(report);
  const keys = new Set(
    [report?.driver_username, report?.driver_name, trip?.driver_id]
      .map((v) => String(v ?? "").trim())
      .filter(Boolean),
  );
  if (keys.has(driver.username) || keys.has(driver.full_name)) return true;
  if (driver.driver_code && keys.has(driver.driver_code)) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* التقييم                                                             */
/* ------------------------------------------------------------------ */

export type DriverEvalRow = {
  id: string;
  username: string;
  name: string;
  code: string;
  company: string;
  transported: boolean;
  total: number;
  judgeable: number;
  onTime: number;
  transferViol: number;
  otherViol: number;
  timingScore: number;
  violationScore: number;
  score: number;
};

export type EvalResult = {
  day: string;
  rows: DriverEvalRow[];
};

/**
 * يقيّم السائقين على يومٍ ما من الرحلات الفعلية فقط:
 * - لم يرحل إطلاقاً ⇒ 0.
 * - رحّل ⇒ 50 (أساس) + حتى 30 (التوقيت) + حتى 20 (المخالفات).
 * التوقيت يُقاس على رحلات «الحديدة» و«الصليف» فقط حسب النوافذ المثالية.
 */
export function evaluateDrivers(args: {
  drivers: Array<{ id: string; username: string; full_name: string; driver_code?: string | null; company_code?: string | null; role?: string }>;
  reports: any[];
  employees: any[];
  day: string;
}): EvalResult {
  const { drivers, reports, employees, day } = args;
  const byCode = new Map<string, any>();
  for (const e of employees) byCode.set(String(e.employee_code), e);
  const firstBoarded = firstBoardedTripMap(reports, day);

  const rows: DriverEvalRow[] = drivers.map((driver) => {
    const reps = reports.filter((r) => reportMatchesDriver(r, driver) && dayOfValue(reportActualTime(r)) === day);

    let total = 0;
    let judgeable = 0;
    let onTime = 0;
    let transferViol = 0;
    let otherViol = 0;

    for (const r of reps) {
      total += 1;
      const t = String(reportTripOf(r).trip?.trip_type ?? r?.trip_type ?? "").trim();
      const dir = t.includes("قادم") || t === "Q" ? "قادم" : "مغادر";
      const line = lineOfRoute(reportRouteName(r));
      if (line) {
        const min = minutesOfDay(reportActualTime(r));
        const windows = TRIP_TIME_WINDOWS[line][dir];
        judgeable += 1;
        if (min !== null && withinAnyWindow(min, windows)) onTime += 1;
      }

      const want = dir === "قادم" ? "arriving" : "departing";
      const tripNo = String(r?.trip_number || reportTripOf(r).trip?.trip_id || "—").trim() || "؟";
      const { employees: passengers } = reportTripOf(r);
      for (const p of passengers) {
        const code = p?.employee_code ? String(p.employee_code).trim() : "";
        const emp = code ? byCode.get(code) ?? null : null;
        const status = passengerStatus(p, emp, day, want);
        const dup = code ? firstBoarded.get(`${code}|${want}`) !== undefined && firstBoarded.get(`${code}|${want}`) !== tripNo : false;
        const kind = violationKindId(status, emp ? employeeCycle(emp, day)?.status ?? null : null, dup);
        if (!kind) continue;
        if (kind === "transport") transferViol += 1;
        else otherViol += 1;
      }
    }

    const transported = total > 0;
    const timingScore = judgeable > 0 ? Math.round((onTime / judgeable) * DRIVER_SCORE.timing) : transported ? DRIVER_SCORE.timing : 0;
    const violationScore = Math.max(0, DRIVER_SCORE.violations - (transferViol * DRIVER_SCORE.penaltyTransfer + otherViol * DRIVER_SCORE.penaltyOther));
    const score = transported ? Math.max(0, Math.min(100, DRIVER_SCORE.base + timingScore + violationScore)) : 0;

    return {
      id: driver.id,
      username: driver.username,
      name: driver.full_name || driver.username,
      code: driver.driver_code || "—",
      company: driver.company_code || "—",
      transported,
      total,
      judgeable,
      onTime,
      transferViol,
      otherViol,
      timingScore,
      violationScore,
      score,
    };
  });

  rows.sort((a, b) => b.score - a.score || b.total - a.total || a.name.localeCompare(b.name, "ar"));
  return { day, rows };
}
