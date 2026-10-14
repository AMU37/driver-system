import { employeeCycle, matchesTripDirection, toDayIndex } from "./cycle";
import { normalizeTripType, type TripType } from "./offlineStore";
import { reportTripOf } from "./export";

const DAY_MS = 86400000;

/** السعة الافتراضية للباص المستخدمة في حساب «الرحلات المفترضة» (عدد الموظفين ÷ السعة). */
export const DEFAULT_BUS_CAPACITY = 30;

export type Granularity = "day" | "week" | "month";
export type DirectionFilter = "all" | "arriving" | "departing";

export type Bucket = {
  key: string;
  label: string;
  planned: number;
  plannedDeparting: number;
  plannedArriving: number;
  actualDeparting: number;
  actualArriving: number;
  actualTrips: number;
  expectedBoarders: number;
  boarders: number;
  violators: number;
};

export type DriverStat = { driver: string; departing: number; arriving: number; total: number; boarders: number; violators: number };
export type BusStat = { bus: string; departing: number; arriving: number; total: number; boarders: number };

export type Totals = {
  planned: number;
  actualTrips: number;
  actualDeparting: number;
  actualArriving: number;
  boarders: number;
  violators: number;
};

export const EMPTY_TOTALS: Totals = { planned: 0, actualTrips: 0, actualDeparting: 0, actualArriving: 0, boarders: 0, violators: 0 };

/* ------------------------------------------------------------------ */
/* تواريخ                                                              */
/* ------------------------------------------------------------------ */

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(day: string, n: number): string {
  const t = Date.parse(day + "T00:00:00Z");
  if (isNaN(t)) return day;
  return new Date(t + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysInRange(from: string, to: string, cap = 400): string[] {
  const out: string[] = [];
  let cur = from;
  const end = to;
  for (let i = 0; i < cap; i++) {
    if (!cur || cur > end) break;
    out.push(cur);
    cur = addDaysIso(cur, 1);
  }
  return out;
}

export function rangeLength(from: string, to: string): number {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(1, Math.round((b - a) / DAY_MS) + 1);
}

/** مفتاح الحاوية (يوم/أسبوع يبدأ الاثنين/شهر). */
export function bucketOf(day: string, gran: Granularity): string {
  if (gran === "day") return day;
  if (gran === "month") return day.slice(0, 7);
  const d = new Date(day + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * DAY_MS).toISOString().slice(0, 10);
}

export function bucketLabel(key: string, gran: Granularity): string {
  if (gran === "month") {
    const [y, m] = key.split("-");
    return `${m}/${y}`;
  }
  const d = new Date(key + "T00:00:00Z");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return gran === "week" ? `أسبوع ${dd}/${mm}` : `${dd}/${mm}`;
}

export function dayOfValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const idx = toDayIndex(value);
  if (idx === null) return null;
  return new Date(idx * DAY_MS).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* قراءة تقارير الرحلات                                                */
/* ------------------------------------------------------------------ */

/** تاريخ الرحلة المرجعي (الانطلاق المخطط ثم البداية ثم الإكمال ثم وقت الوصول). */
export function reportTripDate(report: any): string | null {
  const { trip } = reportTripOf(report);
  return trip.scheduled_start_at || trip.started_at || trip.completed_at || report?.received_at || null;
}

/** نوع حركة التقرير (قادم/مغادر). */
export function reportType(report: any): TripType {
  const { trip } = reportTripOf(report);
  return normalizeTripType(report?.trip_type || trip?.trip_type);
}

export function reportDriverName(report: any): string {
  return report?.driver_name || report?.driver_username || "—";
}

export function reportBusNumber(report: any): string {
  const { trip } = reportTripOf(report);
  return String((report?.bus_number ?? trip?.bus_number) || "—");
}

/* ------------------------------------------------------------------ */
/* المطابقة مع خطة الدوام (نفس منطق تبويب «الموظفون الفعليون»)          */
/* ------------------------------------------------------------------ */

export type PassengerStatus = "match" | "violation" | "unknown" | "nonemp";

export function passengerStatus(p: any, emp: any, day: string, want: "arriving" | "departing"): PassengerStatus {
  if (p?.source === "non_employee" || p?.is_employee === false) return "nonemp";
  const cycle = emp ? employeeCycle(emp, day) : null;
  if (!emp || !cycle) return "unknown";
  // من أول يوم دوام إلى آخر يوم دوام يحق للموظف الصعود من/إلى الموقع بلا مخالفة،
  // والمخالفة تقع فقط في أيام الراحة (إجازة / ترتيب مواصلات).
  return cycle.isWorkDay ? "match" : "violation";
}

/* ------------------------------------------------------------------ */
/* الرحلات المفترضة (من خطة دوام الموظفين ÷ سعة الباص)                  */
/* ------------------------------------------------------------------ */

function directionsOf(filter: DirectionFilter): Array<"arriving" | "departing"> {
  if (filter === "arriving") return ["arriving"];
  if (filter === "departing") return ["departing"];
  return ["arriving", "departing"];
}

/** عدد الرحلات المفترضة في يومٍ ما = إجمالي الموظفين المجدولين (حسب السكن/الحالة) ÷ سعة الباص. */
export function plannedTripsForDay(
  employees: any[],
  day: string,
  filter: DirectionFilter,
  capacity: number,
  groupFilter?: (emp: any) => boolean,
): number {
  const cap = Math.max(1, capacity || DEFAULT_BUS_CAPACITY);
  const wanted = directionsOf(filter);
  let trips = 0;
  for (const dir of wanted) {
    let n = 0;
    for (const emp of employees) {
      if (emp?.is_active === false) continue;
      if (groupFilter && !groupFilter(emp)) continue;
      const cycle = employeeCycle(emp, day);
      if (!cycle) continue;
      if (!matchesTripDirection(cycle.status, dir)) continue;
      n += 1;
    }
    if (n) trips += Math.ceil(n / cap);
  }
  return trips;
}

/* ------------------------------------------------------------------ */
/* تجميع فعلي                                                          */
/* ------------------------------------------------------------------ */

export type AnalyticsFilters = {
  from: string;
  to: string;
  gran: Granularity;
  direction: DirectionFilter;
  driver: string;
  bus: string;
  housing: string;
  capacity: number;
};

/** موقع سكن الراكب (من الحمولة أو من سجل الموظف). */
export function housingOf(p: any, emp: any): string {
  return String(p?.housing_location || emp?.housing_location || "").trim();
}

/** اسم خط الرحلة (يُعتمد لاشتقاق السكن: «الحديدة - الثلاثين» ⇒ الحديدة). */
export function reportRouteName(report: any): string {
  const { trip } = reportTripOf(report);
  return String(trip?.route || report?.route || trip?.origin || report?.origin || "").replace(/\s+/g, " ").trim();
}

/** هل تخصّ الرحلة هذا السكن بحسب اسم الخط (اسم الخط يحتوي على السكن)؟ */
export function routeMatchesHousing(report: any, housing: string): boolean {
  const h = String(housing ?? "").trim();
  if (!h) return false;
  return reportRouteName(report).includes(h);
}

function matchesDirection(type: TripType, filter: DirectionFilter): boolean {
  if (filter === "all") return true;
  const t = type === "قادم" ? "arriving" : "departing";
  return t === filter;
}

type ReportAnalysis = { bucket: string; day: string; departing: number; arriving: number };
type DayActual = {
  departing: number;
  arriving: number;
  boarders: number;
  violators: number;
  drivers: Map<string, DriverStat>;
  buses: Map<string, BusStat>;
};

function analyzeReports(
  reports: any[],
  from: string,
  to: string,
  filters: AnalyticsFilters,
  employeesByCode: Map<string, any>,
): { byBucket: Map<string, DayActual>; totals: Totals; drivers: DriverStat[]; buses: BusStat[] } {
  const byBucket = new Map<string, DayActual>();
  const drivers = new Map<string, DriverStat>();
  const buses = new Map<string, BusStat>();
  const totals: Totals = { ...EMPTY_TOTALS };

  const ensure = (key: string): DayActual => {
    let row = byBucket.get(key);
    if (!row) {
      row = { departing: 0, arriving: 0, boarders: 0, violators: 0, drivers: new Map(), buses: new Map() };
      byBucket.set(key, row);
    }
    return row;
  };

  for (const r of reports) {
    const day = dayOfValue(reportTripDate(r));
    if (!day || day < from || day > to) continue;
    const type = reportType(r);
    const driver = reportDriverName(r);
    const bus = reportBusNumber(r);
    if (filters.driver && driver !== filters.driver) continue;
    if (filters.bus && bus !== filters.bus) continue;

    const key = bucketOf(day, filters.gran);
    const { trip, employees: passengers } = reportTripOf(r);
    const want: "arriving" | "departing" = type === "قادم" ? "arriving" : "departing";
    const routeName = String(trip?.route || r?.route || trip?.origin || r?.origin || "").replace(/\s+/g, " ").trim();
    const viaRoute = filters.housing ? routeName.includes(filters.housing) : false;
    const resolved = passengers.map((p: any) => {
      const code = p?.employee_code ? String(p.employee_code) : "";
      const emp = code ? employeesByCode.get(code) ?? null : null;
      return { status: passengerStatus(p, emp, day, want), housing: housingOf(p, emp) };
    });
    // السكن يُطابق إن كان اسم الخط يحوي السكن (الرحلة تخصّ هذا السكن) أو كان سكن الراكب مطابقاً.
    const counted = filters.housing
      ? (viaRoute ? resolved : resolved.filter((x: any) => x.housing === filters.housing))
      : resolved;
    if (filters.housing && !viaRoute && counted.length === 0) continue;

    // تفصيل الاتجاه (مغادر/قادم) يُحتسب دائماً ليظهر في الشارت.
    const row = ensure(key);
    const isArriving = want === "arriving";
    if (isArriving) row.arriving += 1;
    else row.departing += 1;

    // بقية المؤشرات تتبع فلتر الاتجاه المحدد.
    if (!matchesDirection(type, filters.direction)) continue;

    if (isArriving) totals.actualArriving += 1;
    else totals.actualDeparting += 1;
    totals.actualTrips += 1;

    const d = drivers.get(driver) ?? { driver, departing: 0, arriving: 0, total: 0, boarders: 0, violators: 0 };
    const b = buses.get(bus) ?? { bus, departing: 0, arriving: 0, total: 0, boarders: 0 };
    if (isArriving) {
      d.arriving += 1;
      b.arriving += 1;
    } else {
      d.departing += 1;
      b.departing += 1;
    }
    d.total += 1;
    b.total += 1;

    for (const x of counted) {
      row.boarders += 1;
      totals.boarders += 1;
      d.boarders += 1;
      b.boarders += 1;
      if (x.status !== "match") {
        row.violators += 1;
        totals.violators += 1;
        d.violators += 1;
      }
    }
    drivers.set(driver, d);
    buses.set(bus, b);
  }

  return {
    byBucket,
    totals,
    drivers: Array.from(drivers.values()).sort((a, b) => b.total - a.total),
    buses: Array.from(buses.values()).sort((a, b) => b.total - a.total),
  };
}

/* ------------------------------------------------------------------ */
/* النتيجة الكاملة + المقارنة بالفترة السابقة                          */
/* ------------------------------------------------------------------ */

export type AnalyticsResult = {
  buckets: Bucket[];
  actual: Totals;
  previous: Totals;
  drivers: DriverStat[];
  buses: BusStat[];
};

export function computeAnalytics(args: {
  employees: any[];
  reports: any[];
  filters: AnalyticsFilters;
}): AnalyticsResult {
  const { employees, reports, filters } = args;
  const employeesByCode = new Map<string, any>();
  for (const e of employees) employeesByCode.set(String(e.employee_code), e);
  const housingFilter = filters.housing
    ? (emp: any) => String(emp?.housing_location ?? "").trim() === filters.housing
    : undefined;

  const days = daysInRange(filters.from, filters.to);
  const buckets: Bucket[] = [];
  const index = new Map<string, Bucket>();
  for (const day of days) {
    const key = bucketOf(day, filters.gran);
    let bucket = index.get(key);
    if (!bucket) {
      bucket = {
        key,
        label: bucketLabel(key, filters.gran),
        planned: 0,
        plannedDeparting: 0,
        plannedArriving: 0,
        actualDeparting: 0,
        actualArriving: 0,
        actualTrips: 0,
        expectedBoarders: 0,
        boarders: 0,
        violators: 0,
      };
      index.set(key, bucket);
      buckets.push(bucket);
    }
    const pd = plannedTripsForDay(employees, day, "departing", filters.capacity, housingFilter);
    const pa = plannedTripsForDay(employees, day, "arriving", filters.capacity, housingFilter);
    bucket.plannedDeparting += pd;
    bucket.plannedArriving += pa;
    bucket.planned += filters.direction === "arriving" ? pa : filters.direction === "departing" ? pd : pd + pa;
  }

  const analyzed = analyzeReports(reports, filters.from, filters.to, filters, employeesByCode);
  for (const [key, row] of analyzed.byBucket) {
    const bucket = index.get(key);
    if (!bucket) continue;
    bucket.actualDeparting = row.departing;
    bucket.actualArriving = row.arriving;
    bucket.actualTrips = row.departing + row.arriving;
    bucket.boarders = row.boarders;
    bucket.violators = row.violators;
  }

  // الفترة السابقة المكافئة (للمقارنة والنسب).
  const span = rangeLength(filters.from, filters.to);
  const prevTo = addDaysIso(filters.from, -1);
  const prevFrom = addDaysIso(prevTo, -(span - 1));
  const prevAnalyzed = analyzeReports(reports, prevFrom, prevTo, filters, employeesByCode);
  const previous: Totals = { ...prevAnalyzed.totals };
  previous.planned = daysInRange(prevFrom, prevTo).reduce((sum, day) => {
    const pd = plannedTripsForDay(employees, day, "departing", filters.capacity, housingFilter);
    const pa = plannedTripsForDay(employees, day, "arriving", filters.capacity, housingFilter);
    return sum + (filters.direction === "arriving" ? pa : filters.direction === "departing" ? pd : pd + pa);
  }, 0);

  const actual: Totals = { ...analyzed.totals };
  actual.planned = buckets.reduce((sum, b) => sum + b.planned, 0);

  return { buckets, actual, previous, drivers: analyzed.drivers, buses: analyzed.buses };
}

/* ------------------------------------------------------------------ */
/* أدوات العرض                                                         */
/* ------------------------------------------------------------------ */

export function pct(value: number, base: number): number {
  if (!base) return 0;
  return Math.round((value / base) * 1000) / 10;
}

export function deltaPct(current: number, previous: number): number | null {
  if (!previous) return current ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export const GRANULARITY_LABEL: Record<Granularity, string> = { day: "يومي", week: "أسبوعي", month: "شهري" };
export const DIRECTION_LABEL: Record<DirectionFilter, string> = { all: "الكل", arriving: "قادم", departing: "مغادر" };
