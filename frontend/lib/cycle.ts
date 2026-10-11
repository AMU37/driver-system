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

export type CycleStatus = "arriving" | "working" | "departing" | "transport_arrange" | "vacation";

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
};

export const WORK_CYCLE_STATUSES: CycleStatus[] = ["arriving", "working", "departing"];

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
  if (pos < wd) {
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
  employee: { first_work_day?: string | null; work_days?: unknown; rest_days?: unknown } | null | undefined,
  targetDate: string | Date,
): CycleInfo | null {
  if (!employee) return null;
  return computeCycle(employee.first_work_day, employee.work_days, employee.rest_days, targetDate);
}
