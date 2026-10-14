/**
 * حساب «الحالة الدورية» للموظف بنفس منطق تطبيق GhithOps
 * (backend/transport/cycle_utils.py — دالة _compute_cycle).
 *
 * يُحسب موضع اليوم داخل الدورة من (أول يوم عمل + عدد أيام العمل + عدد أيام الراحة):
 *   pos = (targetDay - firstWorkDay) % (workDays + restDays)
 *   insWork  : pos==0 => قادم | pos==workDays-1 => مغادر | غير ذلك => مداوم
 *   إجازة    : آخر يوم راحة => ترتيب مواصلات | غير ذلك => إجازة
 */

const DAY_MS = 86400000;

export type CycleStatus = "arriving" | "working" | "departing" | "transport_arrange" | "vacation" | "daily";

export type CycleInfo = {
  status: CycleStatus;
  label: string;
  /** صنف CSS من مجموعة .status-* في globals.css */
  badge: string;
  isWorkDay: boolean;
  positionInCycle: number;
  cycleLen: number;
  workDays: number;
  restDays: number;
};

const META: Record<CycleStatus, { label: string; badge: string }> = {
  arriving: { label: "قادم", badge: "available" },
  working: { label: "مداوم", badge: "completed" },
  departing: { label: "مغادر", badge: "started" },
  transport_arrange: { label: "ترتيب مواصلات", badge: "received" },
  vacation: { label: "إجازة", badge: "planned" },
  daily: { label: "دوام يومي", badge: "daily" },
};

export const WORK_CYCLE_STATUSES: CycleStatus[] = ["arriving", "working", "departing", "daily"];

/**
 * هل نظام الدوام «يومي» (ذهاب وعودة كل يوم عمل)؟
 * يُعرَّف بأنه نظام أسبوعي براحة قصيرة (عمل 6/راحة 1 أو عمل 5/راحة 2).
 */
export function isDailySchedule(workDays: unknown, restDays: unknown): boolean {
  const wd = toInt(workDays);
  const rd = toInt(restDays);
  if (wd === null || rd === null || wd < 1 || rd < 1) return false;
  return rd <= 2 && wd + rd <= 7;
}

/** هل تتوافق حالة الدورة مع اتجاه الرحلة؟ «الدوام اليومي» يُحتسب مع القادمين والمغادرين. */
export function matchesTripDirection(status: CycleStatus, direction: "arriving" | "departing"): boolean {
  return status === direction || status === "daily";
}

/**
 * مواقع سكن قريبة من الشركة: تُنقل يومياً (قادم ومغادر) في أيام العمل بكافة أنواع الدوام،
 * بصرف النظر عن دورية الموظف (6/1، 5/2، 20/10…).
 */
export const NEARBY_DAILY_HOUSINGS: string[] = ["الصليف", "الولي", "الضبرة", "الزحيفي"];

/** تبسيط نصي عربي للمقارنة (إزالة المسافات والتشكيل وتوحيد الألف/التاء/الياء). */
function normalizeArabic(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

/** هل يقع سكن الموظف في إحدى المواقع القريبة (تُنقل بشكل يومي)؟ */
export function isNearbyHousing(housing: unknown): boolean {
  const h = normalizeArabic(housing);
  if (!h) return false;
  return NEARBY_DAILY_HOUSINGS.some((name) => {
    const n = normalizeArabic(name);
    return !!n && h.includes(n);
  });
}

function dayIndexFromParts(y: number, m: number, d: number): number {
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** يحوّل قيمة تاريخ (نص Excel/ISO أو Date) إلى رقم يوم ثابت (بدون مناطق زمنية). */
export function toDayIndex(value?: string | Date | null): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return dayIndexFromParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  const text = String(value).trim();
  if (!text) return null;
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return dayIndexFromParts(+m[1], +m[2], +m[3]);
  m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (/[t :]/.test(text) === false && m) return dayIndexFromParts(+m[1], +m[2], +m[3]);
  const d = new Date(text);
  if (!isNaN(d.getTime())) return dayIndexFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
  m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  return m ? dayIndexFromParts(+m[3], +m[2], +m[1]) : null;
}

function toInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : parseInt(String(value).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

export function computeCycle(
  firstWorkDay: string | Date | null | undefined,
  workDays: unknown,
  restDays: unknown,
  targetDate: string | Date | null | undefined,
): CycleInfo | null {
  const start = toDayIndex(firstWorkDay);
  const wd = toInt(workDays);
  const rd = toInt(restDays);
  if (start === null || wd === null || rd === null || wd < 0 || rd < 0) return null;
  const cycleLen = wd + rd;
  if (cycleLen <= 0) return null;
  const target = toDayIndex(targetDate);
  if (target === null) return null;
  const diff = target - start;
  if (diff < 0) return null;
  const pos = ((diff % cycleLen) + cycleLen) % cycleLen;

  let status: CycleStatus;
  if (isDailySchedule(wd, rd)) {
    status = pos < wd ? "daily" : (pos - wd === rd - 1 ? "transport_arrange" : "vacation");
  } else if (pos < wd) {
    if (pos === 0) status = "arriving";
    else if (pos === wd - 1) status = "departing";
    else status = "working";
  } else {
    const vacPos = pos - wd;
    status = vacPos === rd - 1 ? "transport_arrange" : "vacation";
  }
  const meta = META[status];
  return {
    status,
    label: meta.label,
    badge: meta.badge,
    isWorkDay: pos < wd,
    positionInCycle: pos,
    cycleLen,
    workDays: wd,
    restDays: rd,
  };
}

/** حالة دورة موظف (من سجل الموظف المستورد) على تاريخ معيّن. */
export function employeeCycle(
  employee: { first_work_day?: string | null; work_days?: unknown; rest_days?: unknown; housing_location?: string | null } | null | undefined,
  targetDate: string | Date,
): CycleInfo | null {
  if (!employee) return null;
  const base = computeCycle(employee.first_work_day, employee.work_days, employee.rest_days, targetDate);
  if (!base) return null;
  // سكان المواقع القريبة: في أيام عملهم تُعامل حالتهم «نقل يومي» (قادم ومغادر) بكافة أنواع الدوام.
  if (base.isWorkDay && base.status !== "daily" && isNearbyHousing(employee.housing_location)) {
    return { ...base, status: "daily", label: "نقل يومي", badge: META.daily.badge };
  }
  return base;
}
