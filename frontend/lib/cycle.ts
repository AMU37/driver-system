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

/** تصنيف النقل المُطبَّق: يُشتق من نوع الخدمة والسكن بصرف النظر عن القيمة المخزّنة. */
export const DAILY_TRANSPORT_TYPE = "نقل يومي";
export const NO_TRANSPORT_TYPE = "لا يوجد نقل";

export function effectiveTransportType(
  employee: { housing_location?: unknown; transport_type?: unknown; service_type?: unknown } | null | undefined,
): string {
  if (!employee) return "";
  // نوع الخدمة «أخرى»: لا نقل إطلاقاً (الأولوية على السكن القريب).
  if (isOtherServiceType(employee.service_type)) return NO_TRANSPORT_TYPE;
  if (isNearbyHousing(employee.housing_location)) return DAILY_TRANSPORT_TYPE;
  return String(employee.transport_type ?? "").trim();
}

/**
 * قرى قريبة يُنقل سكانها عبر «الدينات» (وليس الباصات)؛
 * لذا تُستبعد خطط نقلهم من حساب «الرحلات المفترضة» للباص.
 */
export const DYNA_SERVED_HOUSINGS: string[] = ["الولي", "الضبرة", "الزحيفي"];

/** هل سكن الموظف في إحدى القرى التي تُخدم بالدينات (لا تدخل في الرحلات المفترضة للباص)؟ */
export function isDynaServedHousing(housing: unknown): boolean {
  const h = normalizeArabic(housing);
  if (!h) return false;
  return DYNA_SERVED_HOUSINGS.some((name) => {
    const n = normalizeArabic(name);
    return !!n && h.includes(n);
  });
}

/** نوع الخدمة «نقل» فقط (بلا سكن): يُنقل صاحبه يومياً (قادم ومغادر) في الأنظمة الأسبوعية. */
export function isTransportOnlyService(service: unknown): boolean {
  return normalizeArabic(service) === "نقل";
}

/** نوع الخدمة «أخرى»: لا يدخل صاحبه في خطط النقل إطلاقاً. */
export function isOtherServiceType(service: unknown): boolean {
  return normalizeArabic(service) === "اخري";
}

/** هل يُستبعد الموظف من خطط النقل تماماً (نوع الخدمة «أخرى»)؟ */
export function isExcludedFromTransport(employee: { service_type?: unknown } | null | undefined): boolean {
  return isOtherServiceType(employee?.service_type);
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

/* ------------------------------------------------------------------ */
/* النظام الأسبوعي (مجموع أيام العمل والراحة = 7)                       */
/* ------------------------------------------------------------------ */

/** رقم يوم الأسبوع من قيمة تاريخ (0=الأحد … 6=السبت). */
function weekdayOf(value?: string | Date | null): number | null {
  const di = toDayIndex(value);
  if (di === null) return null;
  return (((di + 4) % 7) + 7) % 7;
}

// أسماء أيام الأسبوع مُبسّطة (بعد normalizeArabic). الترتيب يمنع التداخل.
const WEEKDAY_TOKENS: Array<[string, number]> = [
  ["اربعاء", 3],
  ["ثلاثاء", 2],
  ["اثنين", 1],
  ["خميس", 4],
  ["سبت", 6],
  ["احد", 0],
  ["جمعه", 5],
];

/** كل مواضع ذكر أيام الأسبوع داخل نص مُبسّط، مرتّبة تصاعدياً. */
function weekdayMentions(text: string): Array<{ day: number; pos: number }> {
  const out: Array<{ day: number; pos: number }> = [];
  for (const [token, day] of WEEKDAY_TOKENS) {
    let from = 0;
    for (;;) {
      const p = text.indexOf(token, from);
      if (p < 0) break;
      out.push({ day, pos: p });
      from = p + token.length;
    }
  }
  return out.sort((a, b) => a.pos - b.pos);
}

/**
 * أيام العمل الأسبوعية من نوع الدوام (وصفه النصي) مرتّبة حسب تسلسل الدورة،
 * أو null إذا تعذّر التحليل. يُغطّي الصيغتين: النطاق «من السبت - الخميس»
 * والقائمة «سبت واحد واربعاء وخميس دوام …».
 * الترتيب مهم لتحديد أول يوم عمل (قادم) وآخر يوم عمل (مغادر).
 */
export function weeklyWorkOrder(workDays: unknown, scheduleDesc: unknown): number[] | null {
  const wd = toInt(workDays);
  const text = normalizeArabic(String(scheduleDesc ?? "")).replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  if (!text || wd === null || wd < 1) return null;
  const dash = text.search(/[-–—/]/);
  const hasRange = /من/.test(text) && dash >= 0;
  const mentions = weekdayMentions(text);
  if (!mentions.length) return null;
  let order: number[];
  if (hasRange) {
    // «من السبت - الخميس» ⇒ من أول يوم إلى آخر يوم (مع الالتفاف على نهاية الأسبوع).
    const start = mentions[0].day;
    const end = mentions[1] ? mentions[1].day : start;
    order = [];
    let d = start;
    for (let i = 0; i < 7; i++) {
      order.push(d);
      if (d === end) break;
      d = (d + 1) % 7;
    }
  } else {
    // قائمة صريحة: أيام قسم «الدوام» فقط (قبل أول فاصل أو قبل كلمة «إجازة»).
    const aj = text.indexOf("اجازه");
    const cut = Math.min(dash < 0 ? text.length : dash, aj < 0 ? text.length : aj);
    const work = mentions.filter((m) => m.pos < cut);
    order = Array.from(new Set((work.length ? work : mentions).map((m) => m.day)));
  }
  // يجب أن يطابق عدد أيام العمل المذكور؛ وإلا نرجع للنموذج الاحتياطي (أمان).
  return order.length === wd ? order : null;
}

/** أيام العمل الأسبوعية كمجموعة، أو null إذا تعذّر التحليل. */
export function weeklyWorkdays(workDays: unknown, scheduleDesc: unknown): Set<number> | null {
  const order = weeklyWorkOrder(workDays, scheduleDesc);
  return order ? new Set(order) : null;
}

/** حالة دورة موظف (من سجل الموظف المستورد) على تاريخ معيّن. */
export function employeeCycle(
  employee: {
    first_work_day?: string | null;
    work_days?: unknown;
    rest_days?: unknown;
    housing_location?: string | null;
    work_schedule?: string | null;
    schedule_desc?: string | null;
    service_type?: unknown;
  } | null | undefined,
  targetDate: string | Date,
): CycleInfo | null {
  if (!employee) return null;
  const wd = toInt(employee.work_days);
  const rd = toInt(employee.rest_days);
  // النظام الأسبوعي (المجموع = 7): تُحدَّد أيام العمل من نوع الدوام (أيام الأسبوع).
  if (wd !== null && rd !== null && wd >= 1 && rd >= 1 && wd + rd === 7) {
    const order = weeklyWorkOrder(wd, employee.schedule_desc);
    if (order) {
      const dow = weekdayOf(targetDate);
      if (dow === null) return null;
      const idx = order.indexOf(dow);
      if (idx < 0) {
        // يوم راحة أسبوعي ⇒ إجازة.
        return {
          status: "vacation",
          label: META.vacation.label,
          badge: META.vacation.badge,
          isWorkDay: false,
          positionInCycle: dow,
          cycleLen: 7,
          workDays: wd,
          restDays: rd,
        };
      }
      // «النقل اليومي» لسكان المواقع القريبة أو نوع الخدمة «نقل» (بلا سكن) فقط،
      // أما «سكن/نقل-سكن» فرحلتان: قادم أول يوم عمل، ومغادر آخر يوم عمل، وما بينهما مداوم.
      const dailyPerson = isNearbyHousing(employee.housing_location) || isTransportOnlyService(employee.service_type);
      let status: CycleStatus;
      if (dailyPerson || order.length === 1) status = "daily";
      else if (idx === 0) status = "arriving";
      else if (idx === order.length - 1) status = "departing";
      else status = "working";
      const meta = META[status];
      return {
        status,
        label: meta.label,
        badge: meta.badge,
        isWorkDay: true,
        positionInCycle: dow,
        cycleLen: 7,
        workDays: wd,
        restDays: rd,
      };
    }
  }
  const base = computeCycle(employee.first_work_day, employee.work_days, employee.rest_days, targetDate);
  if (!base) return null;
  // سكان المواقع القريبة: في أيام عملهم تُعامل حالتهم «نقل يومي» (قادم ومغادر) بكافة أنواع الدوام.
  if (base.isWorkDay && base.status !== "daily" && isNearbyHousing(employee.housing_location)) {
    return { ...base, status: "daily", label: "نقل يومي", badge: META.daily.badge };
  }
  return base;
}
