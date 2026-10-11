"use client";
import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import CrudTable, { type CrudColumn, type CrudField } from "@/components/CrudTable";
import StatusBadge from "@/components/StatusBadge";
import {
  addBus, addCompany, addDepartment, addDriver, addAdminUser, addEmployeeMaster, addHousing, addJob, addRoute,
  createAdminPlan, deleteBus, deleteCompany, deleteDepartment, deleteDriver, deleteEmployeeMaster,
  deleteHousing, deleteJob, deleteRoute, getAdminBuses, getAdminDrivers, getAdminEmployees,
  getAdminPlanned, getAdminTripReports, getAdminUsers, getCompanies, getDepartments, getHousing, getJobs, getNewEmployees,
  getRoutes, importEmployeesFile, reviewNewEmployee, updateBus, updateCompany, updateDepartment,
  updateAdminUser, updateDriver, updateEmployeeMaster, updateHousing, updateJob, updateRoute,
  type PlannedTrip, type User,
} from "@/lib/api";
import { AlertTriangle, ArchiveRestore, BusFront, ChevronDown, ChevronUp, ClipboardList, Copy, Download, Eye, FileSpreadsheet, MessageCircle, Plus, Printer, RefreshCw, Send, Upload, UserCheck, Users } from "lucide-react";
import { useAuthGuard } from "@/lib/authGuard";
import { getCachedSnapshot, getLocalAdminPlans, loadSnapshot, normalizeTripType, queueAdminPlan, removeLocalAdminPlan, TRIP_TYPES, type Snapshot, type TripType } from "@/lib/offlineStore";
import { applyAdminOps, dropLocalCreate, getAdminOps, isLocalRowId, isNetworkError, queueAdminOp, removeAdminOp, replaceLocalCreatePayload, type AdminEntity } from "@/lib/adminOps";
import { downloadContent, openReportTripWhatsApp, printTripReport, reportEmployeeStatus, reportStatusLabel, reportTripOf, reportTripText, reportsToXlsText } from "@/lib/export";
import { employeeCycle, toDayIndex, type CycleInfo, type CycleStatus } from "@/lib/cycle";

type Tab = "plans" | "planner" | "daily" | "actual" | "drivers" | "users" | "employees" | "buses" | "routes" | "companies" | "departments" | "jobs" | "housing" | "new" | "trips" | "compare";

const CYCLE_STATUS_OPTIONS: { value: CycleStatus | ""; label: string }[] = [
  { value: "", label: "كل الحالات" },
  { value: "arriving", label: "قادم" },
  { value: "working", label: "مداوم" },
  { value: "departing", label: "مغادر" },
  { value: "transport_arrange", label: "ترتيب مواصلات" },
  { value: "vacation", label: "إجازة" },
];

const BOOL_OPTIONS = [{ value: true, label: "نشط" }, { value: false, label: "معطّل" }];
const YESNO = (v: any) => (v ? "نشط" : "معطّل");
const DASH = (v: any) => v || "—";
const ROLE_LABEL: Record<string, string> = { driver: "سائق", supervisor: "مشرف", admin: "مدير" };
const ROLE_OPTIONS = [{ value: "supervisor", label: "مشرف" }, { value: "admin", label: "أدمن" }];

const mapSnapshotDriver = (d: any) => ({ id: d.id, driver_code: d.driver_code ?? "", username: d.username, full_name: d.full_name, role: d.role, company_code: d.company_code, is_active: true });
const mapSnapshotUsers = (u: any) => ({ id: u.id, username: u.username, full_name: u.full_name, role: u.role, driver_code: u.driver_code ?? "", company_code: u.company_code ?? "", is_active: true, must_change_password: false });
const mapSnapshotPlanned = (p: any) => ({ ...p, driver_username: p.driver_username ?? "", status: p.status ?? "planned", trip_number: p.trip_number ?? String(p.id), trip_date: p.trip_date ?? "" });
const mapSnapshotEmployee = (e: any) => ({ id: e.id, employee_code: e.employee_code, name: e.name, job_title: e.job_title ?? "", department_name: e.department_name ?? "", company_name: e.company_name ?? "", housing_location: e.housing_location ?? "", work_schedule: e.work_schedule ?? "", schedule_desc: e.schedule_desc ?? "", work_days: e.work_days ?? null, rest_days: e.rest_days ?? null, first_work_day: e.first_work_day ?? "", rotation_status: e.rotation_status ?? "", departure_time: e.departure_time ?? "", gender: e.gender ?? "", service_type: e.service_type ?? "", transport_type: e.transport_type ?? "", cycle_day_today: e.cycle_day_today ?? null, base_status_today: e.base_status_today ?? "", cycle_day_tomorrow: e.cycle_day_tomorrow ?? null, is_active: e.is_active });
const mapSnapshotBus = (b: any) => ({ id: b.id, number: b.number, plate_number: b.plate_number ?? "", capacity: b.capacity, company_code: b.company_code, is_active: b.is_active });
const mapSnapshotRoute = (r: any) => ({ id: r.id, name: r.name, origin: r.origin ?? "", destination: r.destination ?? "", company_code: r.company_code, is_active: r.is_active });

/** شارة الحالة الدورية للموظف (قادم/مداوم/مغادر/إجازة/ترتيب مواصلات). */
function CycleBadge({ info, withPosition = false }: { info: CycleInfo | null; withPosition?: boolean }) {
  if (!info) return <small className="muted">بدون بيانات دورة</small>;
  return (
    <span className={`status status-${info.badge}`} title={`الموقع داخل الدورة: ${info.positionInCycle + 1} من ${info.cycleLen}`}>
      {info.label}{withPosition ? ` (${info.positionInCycle + 1}/${info.cycleLen})` : ""}
    </span>
  );
}

/** تاريخ الرحلة المرجعي لحساب الدورة (الانطلاق المخطط ثم البداية ثم الإكمال). */
function reportTripDateRaw(report: any): string | null {
  const { trip } = reportTripOf(report);
  return trip.scheduled_start_at || trip.started_at || trip.completed_at || report.received_at || null;
}

/** أكواد الموظفين الذين صعدوا فعلاً في رحلات تاريخ معيّن. */
function boardedCodesForDate(reports: any[], dateValue: string): Set<string> {
  const target = toDayIndex(dateValue);
  const codes = new Set<string>();
  if (target === null) return codes;
  for (const r of reports) {
    const raw = reportTripDateRaw(r);
    if (raw === null || toDayIndex(raw) !== target) continue;
    const { employees } = reportTripOf(r);
    for (const p of employees) {
      if (p && p.employee_code) codes.add(String(p.employee_code));
    }
  }
  return codes;
}

/** نوع حركة التقرير (قادم/مغادر) من الحقل العلوي أو داخل الرحلة. */
function reportTypeOf(report: any): TripType {
  const { trip } = reportTripOf(report);
  return normalizeTripType(report?.trip_type || trip?.trip_type);
}

/** تقارير الرحلات التي وقع تاريخها في يوم معيّن. */
function reportsForDate(reports: any[], dateValue: string): any[] {
  const target = toDayIndex(dateValue);
  if (target === null) return [];
  return reports.filter((r) => {
    const raw = reportTripDateRaw(r);
    return raw !== null && toDayIndex(raw) === target;
  });
}

export type ActualRow = {
  code: string;
  name: string;
  housing: string;
  department: string;
  driver: string;
  bus: string;
  route: string;
  tripNumber: string;
  tripType: TripType;
  boardedAt: string;
  source: string;
  status: "match" | "violation" | "unknown" | "nonemp";
  cycle: CycleInfo | null;
};

/** قائمة الصاعدين الفعليين في تاريخ معيّن مع اسم السائق/الباص/الخط وحالة المطابقة. */
function actualRowsForDate(reports: any[], dateValue: string, employees: any[]): ActualRow[] {
  const rows: ActualRow[] = [];
  const byCode = new Map<string, any>();
  for (const e of employees) byCode.set(String(e.employee_code), e);
  for (const r of reportsForDate(reports, dateValue)) {
    const { trip, employees: passengers } = reportTripOf(r);
    const type = reportTypeOf(r);
    const bus = String(trip.bus_number || "—");
    const route = trip.origin && trip.destination ? `${trip.origin} → ${trip.destination}` : (trip.route || r.route || "—");
    const driver = r.driver_name || r.driver_username || "—";
    const tripNumber = r.trip_number || trip.trip_id || "—";
    const want: CycleStatus = type === "قادم" ? "arriving" : "departing";
    for (const p of passengers) {
      const code = p.employee_code ? String(p.employee_code) : "";
      const emp = code ? byCode.get(code) || null : null;
      const cycle = emp ? employeeCycle(emp, dateValue) : null;
      let status: ActualRow["status"];
      if (p.source === "non_employee") status = "nonemp";
      else if (!emp || !cycle) status = "unknown";
      else status = cycle.status === want ? "match" : "violation";
      rows.push({
        code,
        name: p.name || emp?.name || "—",
        housing: p.housing_location || emp?.housing_location || "—",
        department: p.department || emp?.department_name || "—",
        driver,
        bus,
        route,
        tripNumber,
        tripType: type,
        boardedAt: p.boarded_at || "",
        source: p.source || "",
        status,
        cycle,
      });
    }
  }
  return rows;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** الرحلة القديمة المخططة قبل إضافة النوع لا تُعرض كنوع محدد. */
export const tripTypeLabel = (value?: string | null) => {
  const v = (value || "").trim();
  if (!v) return "—";
  if (v === "قادم" || v === "قادمة" || v === "داخل" || v.toLowerCase() === "inbound") return "قادم";
  if (v === "مغادر" || v === "مغادرة" || v === "خارج" || v.toLowerCase() === "outbound") return "مغادر";
  return v;
};

export default function AdminPage() {
  useAuthGuard(["admin", "supervisor"]);
  const [tab, setTab] = useState<Tab>("plans");
  const [drivers, setDrivers] = useState<User[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [plans, setPlans] = useState<PlannedTrip[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [newEmployees, setNewEmployees] = useState<any[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [housing, setHousing] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [viewReport, setViewReport] = useState<any | null>(null);
  const [cycleDate, setCycleDate] = useState<string>(todayIso());
  const [cycleSearch, setCycleSearch] = useState("");
  const [cycleOnlyMissing, setCycleOnlyMissing] = useState(false);
  const [dailyDate, setDailyDate] = useState<string>(todayIso());
  const [actualDate, setActualDate] = useState<string>(todayIso());
  const [actualSearch, setActualSearch] = useState("");
  const [actualOnlyViolation, setActualOnlyViolation] = useState(false);
  const [planDate, setPlanDate] = useState<string>(todayIso());
  const [planHousing, setPlanHousing] = useState("");
  const [planSchedule, setPlanSchedule] = useState("");
  const [planStatus, setPlanStatus] = useState<CycleStatus | "">("arriving");
  const [planSearch, setPlanSearch] = useState("");
  const [planSelected, setPlanSelected] = useState<Record<string, boolean>>({});
  const [pForm, setPForm] = useState<any>({ driver_code: "", bus_number: "", route_name: "", origin: "", destination: "", trip_type: "قادم", scheduled_start_at: "" });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [empSearch, setEmpSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<any>({ driver_code: "", bus_number: "", route_name: "", origin: "", destination: "", scheduled_start_at: "", trip_type: "مغادر" });
  const [planOpen, setPlanOpen] = useState(false);
  const pendingAdminOps = getAdminOps();

  const companyCodeOptions = companies.map(c => ({ value: c.code, label: `${c.name} (${c.code})` }));
  const companyIdOptions = companies.map(c => ({ value: c.id, label: c.name }));
  const companyNameOptions = companies.map(c => ({ value: c.name, label: `${c.name} (${c.code})` }));
  const housingNameOptions = housing.map(h => ({ value: h.name, label: h.name }));

  async function loadEmployees(search?: string) {
    try {
      const result = await getAdminEmployees(search);
      setEmployees(result ?? []);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "تعذر تحميل الموظفين");
    }
  }
  function onEmpSearch(query: string) {
    setEmpSearch(query);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { loadEmployees(query.trim() || ""); }, 350);
  }
  async function load(silent = false) {
    const results = await Promise.allSettled([
      getAdminDrivers(), getAdminPlanned(), getAdminEmployees(), getNewEmployees(),
      getAdminBuses(), getRoutes(), getCompanies(), getDepartments(), getJobs(), getHousing(),
      getAdminTripReports(), getAdminUsers(),
    ]);
    const vals = results.map((x) => (x.status === "fulfilled" ? x.value : undefined));
    const okCount = vals.filter((v) => v !== undefined).length;
    let snap: Snapshot | null = null;
    if (okCount < vals.length) {
      try {
        snap = await loadSnapshot();
      } catch {
        snap = getCachedSnapshot() ?? null;
      }
    }
    setDrivers(vals[0] ?? (snap ? snap.drivers.map(mapSnapshotDriver) : []));
    setPlans(vals[1] ?? (snap ? snap.planned.map(mapSnapshotPlanned) : []));
    setEmployees(vals[2] ?? (snap ? snap.employees.map(mapSnapshotEmployee) : []));
    setAllEmployees(vals[2] ?? (snap ? snap.employees.map(mapSnapshotEmployee) : []));
    setNewEmployees(vals[3] ?? []);
    setBuses(vals[4] ?? (snap ? snap.buses.map(mapSnapshotBus) : []));
    setRoutes(vals[5] ?? (snap ? (snap.routes ?? []).map(mapSnapshotRoute) : []));
    setCompanies(vals[6] ?? []);
    setDepartments(vals[7] ?? []);
    setJobs(vals[8] ?? []);
    setHousing(vals[9] ?? []);
    setReports(vals[10] ?? []);
    setUsers(vals[11] ?? (snap ? snap.drivers.map(mapSnapshotUsers) : []));
    mergeLocalPlans();
    applyOpsToState();
    if (!silent) {
      if (okCount < vals.length) {
        setMsg(`تعذر الاتصال بالخادم لبعض الأقسام (${vals.length - okCount}) — عُرضت النسخ المحلية/اللقطة. للبيانات الحيّة اضبط «رابط الخادم» وسجّل الدخول عبر الشبكة ثم اضغط «تحديث البيانات».`);
      } else {
        setMsg("بيانات حيّة من الخادم — جميع الأقسام محدّثة.");
      }
    }
  }
  function mergeLocalPlans() {
    const local = getLocalAdminPlans().map((p, i) => ({
      id: -(i + 1),
      trip_number: p.client_id,
      driver_id: p.driver_code,
      company_code: p.company_code || "YCSR",
      trip_date: "",
      trip_type: p.trip_type,
      scheduled_start_at: p.scheduled_start_at,
      status: "local",
      bus_number: p.bus_number,
      route_name: p.route_name,
      origin: p.origin,
      destination: p.destination,
      local: true,
    }));
    setPlans((prev: any[]) => [...prev.filter((x) => !x.local), ...local]);
  }
  async function pushPendingPlans() {
    const pending = getLocalAdminPlans();
    if (!pending.length) return { pushed: 0, failed: 0 };
    const hasToken = typeof window !== "undefined" && !!window.localStorage.getItem("access_token");
    if (!hasToken) return { pushed: 0, failed: pending.length, noSession: true, error: "" };
    let pushed = 0;
    let error = "";
    for (const p of pending) {
      try {
        await createAdminPlan({
          driver_code: p.driver_code,
          bus_number: p.bus_number,
          route_name: p.route_name,
          origin: p.origin,
          destination: p.destination,
          company_code: p.company_code,
          scheduled_start_at: p.scheduled_start_at,
          trip_type: p.trip_type,
          employee_codes: p.employee_codes ?? [],
          employee_statuses: p.employee_statuses ?? {},
        });
        removeLocalAdminPlan(p.client_id);
        pushed += 1;
      } catch (err) {
        const net = isNetworkError(err);
        const msg = err instanceof Error ? err.message : String(err);
        if (!error) error = msg;
        if (!net) break;
      }
    }
    return { pushed, failed: pending.length - pushed, noSession: false, error };
  }
  async function sendPending() {
    setLoading(true);
    try {
      const p = await pushPendingPlans();
      const o = await pushLocalOps();
      const sent = p.pushed + o.pushed;
      const failed = p.failed + o.failed;
      if (sent > 0) {
        setMsg(`تم إرسال ${p.pushed} رحلة و${o.pushed} عنصر إدارة إلى الخادم بنجاح${failed ? `، وتَبقّى ${failed} للجولة القادمة.` : "."}`);
        await load(true);
        applyOpsToState();
      } else if (p.noSession || o.noSession) {
        setMsg("لا يمكن الإرسال الآن: لا توجد جلسة اتصال بخادم البيانات. سجّل الدخول عبر شبكة توصل إلى الخادم الذي يقرؤه السائق، وتأكد من «رابط الخادم» في صفحة الإعدادات.");
        mergeLocalPlans();
        applyOpsToState();
      } else {
        const detail = p.error || o.error || "تعذر الوصول إلى الخادم";
        setMsg(`تعذر إرسال العناصر المعلّقة — ${detail}. تأكد من «رابط الخادم» في الإعدادات (يجب أن يصل جهازك وعنوان الخادم إلى بعضهما عبر الشبكة) ثم أعد المحاولة.`);
        mergeLocalPlans();
        applyOpsToState();
      }
    } finally {
      setLoading(false);
    }
  }
  async function fallbackSnapshot() {
    let s: Snapshot | null = null;
    try {
      s = await loadSnapshot();
    } catch {
      s = getCachedSnapshot() ?? null;
    }
    if (!s) {
      setMsg("لا توجد نسخة بيانات محلية بعد — اتصل بالخادم مرة واحدة عبر الشبكة ثم سجّل الدخول لتنزيل بيانات الموظفين.");
      return;
    }
    setDrivers(s.drivers.map(mapSnapshotDriver));
    setUsers(s.drivers.map(mapSnapshotUsers));
    setPlans(s.planned.map(mapSnapshotPlanned));
    setEmployees(s.employees.map(mapSnapshotEmployee));
    setAllEmployees(s.employees.map(mapSnapshotEmployee));
    setNewEmployees([]);
    setBuses(s.buses.map(mapSnapshotBus));
    setRoutes((s.routes ?? []).map(mapSnapshotRoute));
    mergeLocalPlans();
    applyOpsToState();
    setMsg("وضع غير متصل — البيانات المعروضة من اللقطة المحلية (أحدث نسخة مزامَنة). للبيانات الحيّة اضبط «رابط الخادم» وسجّل الدخول عبر الشبكة ثم اضغط «تحديث البيانات».");
  }
  async function initialize() {
    const hasToken = typeof window !== "undefined" && !!window.localStorage.getItem("access_token");
    setLoading(true);
    if (!hasToken) {
      setMsg("وضع دون اتصال — البيانات من اللقطة المحلية");
      await fallbackSnapshot();
      setLoading(false);
      return;
    }
    await load();
    const r = await pushPendingPlans();
    if (r.pushed > 0) {
      setMsg(`تم إرسال ${r.pushed} رحلة كانت محفوظة محلياً إلى الخادم بنجاح.`);
      await load(true);
    }
    const o = await pushLocalOps();
    if (o.pushed > 0) {
      setMsg(`تم إرسال ${o.pushed} عنصر إدارة كان محفوظاً محلياً (سائق/شركة/موظف) إلى الخادم بنجاح.`);
      await load(true);
    }
    applyOpsToState();
    setLoading(false);
  }
  useEffect(() => { initialize(); }, []);

  function afterAction(message: string) {
    setMsg(message);
    load(true);
  }

  function hasSessionToken(): boolean {
    return typeof window !== "undefined" && !!window.localStorage.getItem("access_token");
  }
  function applyOpsToState() {
    setDrivers((prev) => applyAdminOps("driver", prev) as any[]);
    setCompanies((prev) => applyAdminOps("company", prev) as any[]);
    setEmployees((prev) => applyAdminOps("employee", prev) as any[]);
    setAllEmployees((prev) => applyAdminOps("employee", prev) as any[]);
  }
  async function localSave(entity: AdminEntity, payload: Record<string, any>, id: number | string | undefined, online: (pp: Record<string, any>, iid: number | string | undefined) => Promise<void>, label: string) {
    if (isLocalRowId(id)) {
      replaceLocalCreatePayload(String(id), payload);
      applyOpsToState();
      setMsg(`تم تعديل ${label} المحفوظ محلياً — ستُرسل النسخة الجديدة عند توفر الاتصال بالخادم.`);
      return;
    }
    if (hasSessionToken()) {
      try {
        await online(payload, id);
        afterAction(`تم حفظ ${label} على الخادم بنجاح`);
        return;
      } catch (err) {
        if (!isNetworkError(err)) throw err;
      }
    }
    queueAdminOp({ entity, kind: id !== undefined ? "update" : "create", id, payload });
    applyOpsToState();
    setMsg(`تعذر الاتصال بالخادم — تم حفظ ${label} على هذا الجهاز محلياً، وستُرسل تلقائياً عند توفر الاتصال (اضغط «إرسال الآن» أو «تحديث»).`);
  }
  async function localRemove(entity: AdminEntity, id: number | string, online: (iid: number | string) => Promise<void>) {
    if (isLocalRowId(id)) {
      dropLocalCreate(String(id));
      applyOpsToState();
      setMsg("تم حذف العنصر المحفوظ محلياً قبل إرساله إلى الخادم.");
      return;
    }
    if (hasSessionToken()) {
      try {
        await online(id);
        return;
      } catch (err) {
        if (!isNetworkError(err)) throw err;
      }
    }
    queueAdminOp({ entity, kind: "delete", id });
    applyOpsToState();
    setMsg("لا يوجد اتصال بالخادم — سيُزال العنصر محلياً الآن، ومن الخادم عند توفر الاتصال (اضغط «إرسال الآن» أو «تحديث»).");
  }
  async function pushLocalOps(): Promise<{ pushed: number; failed: number; noSession?: boolean; error?: string }> {
    if (!hasSessionToken()) return { pushed: 0, failed: 0, noSession: true, error: "" };
    const ops = getAdminOps();
    let pushed = 0;
    let error = "";
    for (const op of ops) {
      try {
        if (op.entity === "driver") {
          if (op.kind === "create") await addDriver(op.payload);
          else if (op.kind === "update") await updateDriver(String(op.id), op.payload);
          else await deleteDriver(String(op.id));
        } else if (op.entity === "company") {
          if (op.kind === "create") await addCompany(op.payload);
          else if (op.kind === "update") await updateCompany(op.id as number | string, op.payload);
          else await deleteCompany(op.id as number | string);
        } else if (op.entity === "employee") {
          if (op.kind === "create") await addEmployeeMaster(op.payload);
          else if (op.kind === "update") await updateEmployeeMaster(op.id as number | string, op.payload);
          else await deleteEmployeeMaster(op.id as number | string);
        }
        removeAdminOp(op.client_id);
        pushed += 1;
      } catch (err) {
        const net = isNetworkError(err);
        const msg = err instanceof Error ? err.message : String(err);
        if (!error) error = msg;
        if (!net) break;
      }
    }
    return { pushed, failed: ops.length - pushed, noSession: false, error };
  }

  function exportReports() {
    if (!reports.length) { setMsg("لا توجد تقارير للتصدير حالياً"); return; }
    downloadContent(`رحلات-السائقين-${new Date().toISOString().slice(0, 10)}.xls`, reportsToXlsText(reports), "application/vnd.ms-excel");
    setMsg("تم تجهيز ملف Excel — افتحه من التنزيلات/الخطوة التالية.");
  }

  function exportBackup() {
    const out: Record<string, string> = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith("ds_") && k !== "ds_session") out[k] = window.localStorage.getItem(k) ?? "";
    }
    downloadContent(`دعم-نظام-الرحلات-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 2), "application/json");
    setMsg("تم تجهيز النسخة الاحتياطية — احفظها في مكان آمن أو انقلها إلى الجهاز الآخر.");
  }
  async function importBackup(file: File) {
    try {
      const obj = JSON.parse(await file.text()) as Record<string, unknown>;
      let n = 0;
      for (const [k, v] of Object.entries(obj)) {
        if (k && k.startsWith("ds_") && k !== "ds_session" && typeof v === "string") {
          window.localStorage.setItem(k, v);
          n += 1;
        }
      }
      setMsg(`تم استيراد النسخة الاحتياطية (${n} عنصر) — يعاد تحميل البيانات الآن.`);
      await initialize();
    } catch {
      setMsg("تعذر قراءة ملف النسخة الاحتياطية — تأكد أنه ملف JSON صادر من هذا التطبيق.");
    }
  }

  async function createTrip() {
    if (!form.driver_code) { setMsg("اختر السائق أولاً"); return; }
    if (!form.scheduled_start_at) { setMsg("حدد موعد الانطلاق"); return; }
    setLoading(true);
    setMsg("");
    const driver = drivers.find(d => d.driver_code === form.driver_code);
    const payload = {
      driver_code: form.driver_code,
      bus_number: form.bus_number,
      route_name: form.route_name,
      origin: form.origin,
      destination: form.destination,
      company_code: driver?.company_code || undefined,
      trip_type: form.trip_type || "مغادر",
      scheduled_start_at: new Date(form.scheduled_start_at).toISOString(),
    };
    const hasToken = typeof window !== "undefined" && !!window.localStorage.getItem("access_token");
    const saveLocal = (msg: string) => {
      queueAdminPlan({ ...payload, driver_name: driver?.full_name });
      mergeLocalPlans();
      setMsg(msg);
    };
    if (hasToken) {
      try {
        await createAdminPlan(payload);
        setForm((f: any) => ({ ...f, scheduled_start_at: "" }));
        const r = await pushPendingPlans();
        if (r.pushed > 0) setMsg(`تم تخطيط الرحلة وإرسال ${r.pushed} رحلة كانت معلّقة محلياً إلى الخادم بنجاح.`);
        else setMsg("تم تخطيط الرحلة للسائق بنجاح وحفظها على الخادم");
        await load(true);
      } catch (err) {
        setForm((f: any) => ({ ...f, scheduled_start_at: "" }));
        if (isNetworkError(err)) {
          saveLocal("تعذر الوصول إلى الخادم — حُفظت الرحلة على هذا الجهاز محلياً، وستُرسل عند توفر الاتصال بالخادم (اضغط «إرسال الآن» أو «تحديث»). ستظهر للسائق على هذا الجهاز مباشرة.");
        } else {
          setMsg(`تعذر حفظ الرحلة — الخادم رفض العملية: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } else {
      setForm((f: any) => ({ ...f, scheduled_start_at: "" }));
      saveLocal("وضع دون اتصال — حُفظت الرحلة محلياً وستظهر للسائق على هذا الجهاز مباشرة. لوصولها لأجهزة أخرى يجب الاتصال بخادم البيانات («رابط الخادم» ثم «إرسال الآن»).");
    }
    setLoading(false);
  }

  async function createPlanWithEmployees() {
    const codes = Object.keys(planSelected).filter((c) => planSelected[c]);
    if (!pForm.driver_code) { setMsg("اختر السائق أولاً"); return; }
    if (!pForm.bus_number) { setMsg("اختر الباص أولاً"); return; }
    if (!pForm.route_name) { setMsg("اختر خط السير أولاً"); return; }
    if (!pForm.scheduled_start_at) { setMsg("حدد موعد الانطلاق"); return; }
    if (!codes.length) { setMsg("حدد موظفاً واحداً على الأقل"); return; }
    setLoading(true);
    setMsg("");
    const driver = drivers.find(d => d.driver_code === pForm.driver_code);
    const dateValue = planDate || todayIso();
    const statuses: Record<string, string> = {};
    for (const c of codes) {
      const emp = allEmployees.find((e) => String(e.employee_code) === c);
      const st = employeeCycle(emp, dateValue)?.status;
      if (st) statuses[c] = st;
    }
    const payload = {
      driver_code: pForm.driver_code,
      bus_number: pForm.bus_number,
      route_name: pForm.route_name,
      origin: pForm.origin,
      destination: pForm.destination,
      company_code: driver?.company_code || undefined,
      trip_type: pForm.trip_type || "قادم",
      scheduled_start_at: new Date(pForm.scheduled_start_at).toISOString(),
      employee_codes: codes,
      employee_statuses: statuses,
    };
    const hasToken = typeof window !== "undefined" && !!window.localStorage.getItem("access_token");
    const saveLocal = (text: string) => {
      queueAdminPlan({ ...payload, driver_name: driver?.full_name });
      mergeLocalPlans();
      setMsg(text);
    };
    if (hasToken) {
      try {
        const created = await createAdminPlan(payload);
        setPlanSelected({});
        setMsg(`تم تخطيط الرحلة ${created.trip_number} وإسناد ${codes.length} موظفاً إليها بنجاح`);
        await load(true);
      } catch (err) {
        if (isNetworkError(err)) {
          saveLocal(`تعذر الوصول إلى الخادم — حُفظت الرحلة مع ${codes.length} موظفاً على هذا الجهاز محلياً، وستُرسل عند توفر الاتصال (اضغط «إرسال الآن»).`);
        } else {
          setMsg(`تعذر حفظ الرحلة — الخادم رفض العملية: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } else {
      saveLocal(`وضع دون اتصال — حُفظت الرحلة مع ${codes.length} موظفاً محلياً وستُرسل عند الاتصال بخادم البيانات.`);
    }
    setLoading(false);
  }

  const selectedDriver = drivers.find(d => d.driver_code === form.driver_code);
  const pDriver = drivers.find(d => d.driver_code === pForm.driver_code);
  const pBuses = buses.filter(b => b.is_active !== false && (!pDriver?.company_code || b.company_code === pDriver.company_code));
  const pRoutes = routes.filter(r => r.is_active !== false && (!pDriver?.company_code || r.company_code === pDriver.company_code));
  function selectPDriver(code: string) {
    const d = drivers.find(x => x.driver_code === code);
    const comp = d?.company_code;
    const firstBus = buses.find(b => b.is_active !== false && (!comp || b.company_code === comp));
    const firstRoute = routes.find(r => r.is_active !== false && (!comp || r.company_code === comp));
    setPForm((f: any) => ({ ...f, driver_code: code, bus_number: firstBus ? firstBus.number : "", route_name: firstRoute ? firstRoute.name : "", origin: firstRoute ? firstRoute.origin : "", destination: firstRoute ? firstRoute.destination : "" }));
  }
  function selectPRoute(name: string) {
    const r = routes.find(x => x.name === name);
    setPForm((f: any) => ({ ...f, route_name: name, origin: r?.origin ?? "", destination: r?.destination ?? "" }));
  }
  const activeBuses = buses.filter(b => b.is_active !== false && (!selectedDriver?.company_code || b.company_code === selectedDriver.company_code));
  const activeRoutes = routes.filter(r => r.is_active !== false && (!selectedDriver?.company_code || r.company_code === selectedDriver.company_code));

  function selectDriver(code: string) {
    const driver = drivers.find(d => d.driver_code === code);
    const comp = driver?.company_code;
    const firstBus = buses.find(b => b.is_active !== false && (!comp || b.company_code === comp));
    const firstRoute = routes.find(r => r.is_active !== false && (!comp || r.company_code === comp));
    setForm((f: any) => ({
      ...f,
      driver_code: code,
      bus_number: firstBus ? firstBus.number : "",
      route_name: firstRoute ? firstRoute.name : "",
      origin: firstRoute ? firstRoute.origin : "",
      destination: firstRoute ? firstRoute.destination : "",
    }));
  }
  function selectBus(number: string) {
    setForm((f: any) => ({ ...f, bus_number: number }));
  }
  function selectRoute(name: string) {
    const route = routes.find(r => r.name === name);
    setForm((f: any) => ({ ...f, route_name: name, origin: route?.origin ?? "", destination: route?.destination ?? "" }));
  }

  async function uploadFile(file: File) {
    setLoading(true);
    setMsg("");
    try {
      const result = await importEmployeesFile(file);
      setMsg(`تم الاستيراد: ${result.created} جديد، ${result.updated} محدث${result.skipped?.length ? `، ${result.skipped.length} مرفوض` : ""}`);
      if (fileRef.current) fileRef.current.value = "";
      load(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذر استيراد الملف");
    } finally {
      setLoading(false);
    }
  }

  async function review(id: number, status: "approved" | "rejected") {
    try {
      await reviewNewEmployee(id, status);
      setMsg(status === "approved" ? "تم اعتماد الموظف" : "تم رفض الطلب");
      load(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذر حفظ المراجعة");
    }
  }

  // ---- CrudTable helpers -------------------------------------------------
  const driverColumns: CrudColumn[] = [
    { key: "username", label: "اسم المستخدم" },
    { key: "full_name", label: "الاسم" },
    { key: "driver_code", label: "كود السائق", render: (i) => <strong>{DASH(i.driver_code)}</strong> },
    { key: "company_code", label: "الشركة" },
    { key: "is_active", label: "الحالة", render: (i) => YESNO(i.is_active) },
  ];
  const driverFields: CrudField[] = [
    { key: "username", label: "اسم المستخدم", required: true, createOnly: true },
    { key: "password", label: "كلمة المرور", type: "password", required: true, createOnly: true, help: "8 أحرف فأكثر، حروف وأرقام" },
    { key: "new_password", label: "كلمة مرور جديدة (اختياري)", type: "password", editOnly: true, help: "اتركه فارغاً لعدم تغييرها" },
    { key: "full_name", label: "الاسم الكامل", required: true },
    { key: "driver_code", label: "كود السائق", required: true },
    { key: "company_code", label: "الشركة", type: "select", options: companyCodeOptions },
    { key: "is_active", label: "الحالة", type: "select", options: BOOL_OPTIONS },
  ];

  const userColumns: CrudColumn[] = [
    { key: "username", label: "اسم المستخدم" },
    { key: "full_name", label: "الاسم" },
    { key: "role", label: "الدور", render: (i) => <span className={`status ${i.role === "admin" ? "status-completed" : i.role === "supervisor" ? "status-needs_review" : "status-local"}`}>{ROLE_LABEL[i.role] ?? i.role}</span> },
    { key: "is_active", label: "الحالة", render: (i) => YESNO(i.is_active) },
  ];
  const userFields: CrudField[] = [
    { key: "username", label: "اسم المستخدم", required: true, createOnly: true },
    { key: "full_name", label: "الاسم الكامل", required: true },
    { key: "role", label: "الدور", type: "select", options: ROLE_OPTIONS, required: true, createOnly: true, help: "المدير: صلاحيات كاملة؛ المشرف: إدارة الرحلات والبيانات" },
    { key: "password", label: "كلمة المرور", type: "password", required: true, createOnly: true, help: "8 أحرف فأكثر، حروف وأرقام" },
    { key: "new_password", label: "كلمة مرور جديدة (اختياري)", type: "password", editOnly: true, help: "اتركه فارغاً لعدم تغييرها" },
    { key: "is_active", label: "الحالة", type: "select", options: BOOL_OPTIONS },
  ];

  const employeeColumns: CrudColumn[] = [
    { key: "employee_code", label: "الكود", render: (i) => <strong>{i.employee_code}</strong> },
    { key: "name", label: "الاسم" },
    { key: "job_title", label: "الوظيفة / الإدارة", render: (i) => (
      <span className="stack-cell"><strong>{DASH(i.job_title)}</strong><small>{DASH(i.department_name)}</small></span>
    ) },
    { key: "company_name", label: "الشركة / السكن", render: (i) => (
      <span className="stack-cell"><strong>{DASH(i.company_name)}</strong><small>{DASH(i.housing_location)}</small></span>
    ) },
    { key: "schedule", label: "نظام الدوام", render: (i) => (
      <span className="stack-cell">
        <strong>{DASH(i.schedule_desc || i.work_schedule)}</strong>
        {i.work_schedule && <small>جدول {i.work_schedule}</small>}
      </span>
    ) },
    { key: "rotation_status", label: "الدورة", render: (i) => (
      <span className="stack-cell">
        <strong>{DASH(i.rotation_status)}</strong>
        {(i.work_days !== null && i.work_days !== undefined) && <small>{i.work_days} عمل / {i.rest_days ?? 0} راحة</small>}
      </span>
    ) },
    { key: "today", label: "حالة اليوم", render: (i) => (
      <span className="stack-cell">
        <strong>{DASH(i.base_status_today)}</strong>
        {i.cycle_day_today !== null && i.cycle_day_today !== undefined && <small>يركب اليوم ({i.cycle_day_today}) / غداً ({i.cycle_day_tomorrow ?? "—"})</small>}
      </span>
    ) },
    { key: "is_active", label: "الحالة", render: (i) => YESNO(i.is_active) },
  ];
  const employeeFields: CrudField[] = [
    { key: "employee_code", label: "كود الموظف", required: true },
    { key: "name", label: "الاسم", required: true },
    { key: "job_title", label: "المسمى الوظيفي" },
    { key: "department_name", label: "الإدارة" },
    { key: "company_name", label: "الشركة", type: "select", options: companyNameOptions },
    { key: "housing_location", label: "السكن", type: "select", options: housingNameOptions },
    { key: "work_schedule", label: "جدول العمل" },
    { key: "schedule_desc", label: "شرح نوع الدوام" },
    { key: "work_days", label: "عدد أيام العمل", type: "number" },
    { key: "rest_days", label: "عدد أيام الراحة", type: "number" },
    { key: "first_work_day", label: "تاريخ أول يوم عمل" },
    { key: "rotation_status", label: "الحالة الدورية للموظف" },
    { key: "departure_time", label: "وقت المغادرة" },
    { key: "gender", label: "نوع الجنس" },
    { key: "service_type", label: "نوع الخدمة" },
    { key: "transport_type", label: "تصنيف النقل (يومي/دوري)" },
    { key: "cycle_day_today", label: "يوم الدورة اليوم", type: "number" },
    { key: "base_status_today", label: "الحالة الأساسية اليوم" },
    { key: "cycle_day_tomorrow", label: "يوم الدورة غداً", type: "number" },
    { key: "is_active", label: "الحالة", type: "select", options: BOOL_OPTIONS },
  ];

  const busColumns: CrudColumn[] = [
    { key: "number", label: "رقم الباص", render: (i) => <strong>{i.number}</strong> },
    { key: "plate_number", label: "اللوحة", render: (i) => DASH(i.plate_number) },
    { key: "capacity", label: "السعة" },
    { key: "company_code", label: "الشركة" },
    { key: "is_active", label: "الحالة", render: (i) => YESNO(i.is_active) },
  ];
  const busFields: CrudField[] = [
    { key: "number", label: "رقم الباص", required: true },
    { key: "plate_number", label: "رقم اللوحة" },
    { key: "capacity", label: "السعة", type: "number" },
    { key: "company_code", label: "الشركة", type: "select", options: companyCodeOptions },
    { key: "is_active", label: "الحالة", type: "select", options: BOOL_OPTIONS },
  ];

  const routeColumns: CrudColumn[] = [
    { key: "name", label: "اسم الخط", render: (i) => <strong>{i.name}</strong> },
    { key: "origin", label: "الانطلاق" },
    { key: "destination", label: "الوصول" },
    { key: "company_code", label: "الشركة" },
    { key: "is_active", label: "الحالة", render: (i) => YESNO(i.is_active) },
  ];
  const routeFields: CrudField[] = [
    { key: "name", label: "اسم الخط", required: true },
    { key: "origin", label: "مكان الانطلاق", required: true },
    { key: "destination", label: "مكان الوصول", required: true },
    { key: "company_code", label: "الشركة", type: "select", options: companyCodeOptions },
    { key: "is_active", label: "الحالة", type: "select", options: BOOL_OPTIONS },
  ];

  const companyColumns: CrudColumn[] = [
    { key: "code", label: "الكود", render: (i) => <strong>{i.code}</strong> },
    { key: "name", label: "الاسم" },
    { key: "is_active", label: "الحالة", render: (i) => YESNO(i.is_active) },
  ];
  const companyFields: CrudField[] = [
    { key: "code", label: "كود الشركة", required: true },
    { key: "name", label: "اسم الشركة", required: true },
    { key: "is_active", label: "الحالة", type: "select", options: BOOL_OPTIONS },
  ];

  const departmentColumns: CrudColumn[] = [
    { key: "name", label: "الإدارة", render: (i) => <strong>{i.name}</strong> },
    { key: "company_name", label: "الشركة", render: (i) => DASH(i.company_name) },
    { key: "is_active", label: "الحالة", render: (i) => YESNO(i.is_active) },
  ];
  const departmentFields: CrudField[] = [
    { key: "name", label: "اسم الإدارة", required: true },
    { key: "company_id", label: "الشركة", type: "select", options: companyIdOptions, required: true },
    { key: "is_active", label: "الحالة", type: "select", options: BOOL_OPTIONS },
  ];

  const jobColumns: CrudColumn[] = [
    { key: "title", label: "المسمى الوظيفي", render: (i) => <strong>{i.title}</strong> },
    { key: "is_active", label: "الحالة", render: (i) => YESNO(i.is_active) },
  ];
  const jobFields: CrudField[] = [
    { key: "title", label: "المسمى الوظيفي", required: true },
    { key: "is_active", label: "الحالة", type: "select", options: BOOL_OPTIONS },
  ];

  const housingColumns: CrudColumn[] = [
    { key: "name", label: "اسم السكن", render: (i) => <strong>{i.name}</strong> },
    { key: "is_active", label: "الحالة", render: (i) => YESNO(i.is_active) },
  ];
  const housingFields: CrudField[] = [
    { key: "name", label: "اسم السكن", required: true },
    { key: "is_active", label: "الحالة", type: "select", options: BOOL_OPTIONS },
  ];

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <div className="eyebrow">SUPERVISOR CONSOLE</div>
          <h1>إدارة النظام</h1>
          <p>تخطيط الرحلات للسائقين، وإدارة الموظفين والباصات والخطوط والشركات وقوائم البيانات.</p>
        </div>
        <button className="secondary-btn" onClick={initialize} disabled={loading}><RefreshCw size={17} />تحديث</button>
      </div>
      {msg && <div className={`alert ${msg.includes("تعذر") || msg.includes("مطلوب") || msg.includes("غير صحيحة") ? "danger" : "success"}`}>{msg}</div>}

      {pendingAdminOps.length > 0 && (
        <div className="alert success pending-bar">
          <span>يوجد {pendingAdminOps.length} عنصر (سائق/شركة/موظف) محفوظ محلياً بانتظار الإرسال إلى الخادم.</span>
          <button className="primary-btn" onClick={sendPending} disabled={loading}><Send size={16} style={{ verticalAlign: "-3px" }} />{loading ? "جارٍ الإرسال..." : "إرسال الآن"}</button>
        </div>
      )}

      <div className="form-panel">
        <div className="panel-title">
          <div>
            <ArchiveRestore size={22} />
            <div>
              <h2>النسخ الاحتياطي للبيانات المحلية</h2>
              <span>انقل بيانات هذا الجهاز (السائقون/الشركات/الموظفون/الرحلات) إلى جهاز آخر، أو احفظها قبل إعادة تثبيت التطبيق.</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="secondary-btn" onClick={exportBackup}><Download size={16} />تصدير نسخة</button>
            <button className="secondary-btn" onClick={() => backupRef.current?.click()}><Upload size={16} />استيراد نسخة</button>
            <input ref={backupRef} type="file" accept=".json" style={{ display: "none" }} onChange={e => e.target.files?.[0] && importBackup(e.target.files[0])} />
          </div>
        </div>
      </div>

      <div className="form-panel">
        <div className="panel-title">
          <div>
            <BusFront size={22} />
            <div>
              <h2>تخطيط رحلة للسائق</h2>
              <span>السائق سيضيف الموظفين الصاعدين من صفحة الرحلة المخصصة له.</span>
            </div>
          </div>
          <button className="secondary-btn" onClick={() => setPlanOpen(v => !v)}>{planOpen ? <><ChevronUp size={16} />إخفاء النموذج</> : <><ChevronDown size={16} />تخطيط رحلة</>}</button>
        </div>
        {planOpen && (<>
        <div className="form-grid">
          <label className="field"><span>السائق</span><select value={form.driver_code} onChange={e => selectDriver(e.target.value)}><option value="">— اختر السائق —</option>{drivers.map(d => <option key={d.id} value={d.driver_code ?? ""}>{d.full_name} ({d.driver_code ?? ""})</option>)}</select></label>
          <label className="field"><span>رقم الباص</span><select value={form.bus_number} onChange={e => selectBus(e.target.value)}><option value="">— اختر الباص —</option>{activeBuses.map(b => <option key={b.id} value={b.number}>{b.number}{b.plate_number ? ` (${b.plate_number})` : ""}</option>)}</select></label>
          <label className="field"><span>خط السير</span><select value={form.route_name} onChange={e => selectRoute(e.target.value)}><option value="">— اختر الخط —</option>{activeRoutes.map(r => <option key={r.id} value={r.name}>{r.name} ({r.origin} → {r.destination})</option>)}</select></label>
          <label className="field"><span>مكان الانطلاق</span><input value={form.origin} disabled /></label>
          <label className="field"><span>مكان الوصول</span><input value={form.destination} disabled /></label>
          <label className="field"><span>نوع الرحلة</span><select value={form.trip_type} onChange={e => setForm({ ...form, trip_type: e.target.value })}>{TRIP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
          <label className="field"><span>موعد الانطلاق</span><input type="datetime-local" value={form.scheduled_start_at} onChange={e => setForm({ ...form, scheduled_start_at: e.target.value })} /></label>
        </div>
        <button className="primary-btn" onClick={createTrip} disabled={loading || !form.scheduled_start_at || !form.driver_code || !form.bus_number || !form.route_name}><Plus size={18} />{loading ? "جارٍ الحفظ..." : "تخطيط الرحلة"}</button>
        </>)}
      </div>

      <div className="admin-tabs">
        <button className={tab === "planner" ? "active" : ""} onClick={() => setTab("planner")}>تخطيط المواصلات</button>
        <button className={tab === "plans" ? "active" : ""} onClick={() => setTab("plans")}>الرحلات المخططة ({plans.length})</button>
        <button className={tab === "drivers" ? "active" : ""} onClick={() => setTab("drivers")}>السائقون ({drivers.length})</button>
        <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>المستخدمون ({users.length})</button>
        <button className={tab === "employees" ? "active" : ""} onClick={() => setTab("employees")}>الموظفون ({employees.length})</button>
        <button className={tab === "buses" ? "active" : ""} onClick={() => setTab("buses")}>الباصات ({buses.length})</button>
        <button className={tab === "routes" ? "active" : ""} onClick={() => setTab("routes")}>الخطوط ({routes.length})</button>
        <button className={tab === "companies" ? "active" : ""} onClick={() => setTab("companies")}>الشركات ({companies.length})</button>
        <button className={tab === "departments" ? "active" : ""} onClick={() => setTab("departments")}>الإدارات ({departments.length})</button>
        <button className={tab === "jobs" ? "active" : ""} onClick={() => setTab("jobs")}>الوظائف ({jobs.length})</button>
        <button className={tab === "housing" ? "active" : ""} onClick={() => setTab("housing")}>السكن ({housing.length})</button>
        <button className={tab === "new" ? "active" : ""} onClick={() => setTab("new")}>طلبات الموظفين الجدد ({newEmployees.length})</button>
        <button className={tab === "trips" ? "active" : ""} onClick={() => setTab("trips")}>رحلات السائقين ({reports.length})</button>
        <button className={tab === "daily" ? "active" : ""} onClick={() => setTab("daily")}>الخطة اليومية (تلقائي)</button>
        <button className={tab === "actual" ? "active" : ""} onClick={() => setTab("actual")}>الموظفون الفعليون</button>
        <button className={tab === "compare" ? "active" : ""} onClick={() => setTab("compare")}>المخطط مقابل الفعلي</button>
      </div>

      {tab === "planner" && (() => {
        const dateValue = planDate || todayIso();
        const q = planSearch.trim().toLowerCase();
        const dirType = pForm.trip_type || "قادم";
        const wantStatus: CycleStatus | null = dirType === "مغادر" ? "departing" : "arriving";

        const housingCounts = new Map<string, number>();
        const scheduleCounts = new Map<string, number>();
        for (const e of allEmployees) {
          const h = String(e.housing_location ?? "").trim();
          if (h) housingCounts.set(h, (housingCounts.get(h) || 0) + 1);
          const s = String(e.work_schedule ?? "").trim();
          if (s) scheduleCounts.set(s, (scheduleCounts.get(s) || 0) + 1);
        }
        const housingOptions = Array.from(housingCounts.entries()).sort((a, b) => b[1] - a[1]);
        const scheduleOptions = Array.from(scheduleCounts.entries()).sort((a, b) => b[1] - a[1]);

        const rows = allEmployees
          .map((e) => ({ e, cycle: employeeCycle(e, dateValue) }))
          .filter((x) => x.cycle)
          .map((x) => ({ e: x.e, cycle: x.cycle as CycleInfo }))
          .filter((x) => !planHousing || String(x.e.housing_location ?? "").trim() === planHousing)
          .filter((x) => !planSchedule || String(x.e.work_schedule ?? "").trim() === planSchedule)
          .filter((x) => !planStatus || x.cycle.status === planStatus)
          .filter((x) => !q || [x.e.employee_code, x.e.name, x.e.department_name, x.e.company_name, x.e.housing_location, x.e.work_schedule, x.e.schedule_desc].some((v) => String(v ?? "").toLowerCase().includes(q)));

        const selectedCodes = Object.keys(planSelected).filter((c) => planSelected[c]);
        const allSelected = rows.length > 0 && rows.every((x) => planSelected[String(x.e.employee_code)]);
        const violating = rows.filter((x) => planSelected[String(x.e.employee_code)] && wantStatus && x.cycle.status !== wantStatus);
        const statusCounts = new Map<string, number>();
        for (const x of rows) statusCounts.set(x.cycle.status, (statusCounts.get(x.cycle.status) || 0) + 1);
        const statusSummary = Array.from(statusCounts.entries()).map(([s, n]) => `${CYCLE_STATUS_OPTIONS.find(o => o.value === s)?.label ?? s} ${n}`).join(" · ") || "—";

        const toggle = (code: string) => setPlanSelected((prev) => ({ ...prev, [code]: !prev[code] }));
        const toggleAll = () => setPlanSelected((prev) => {
          const next = { ...prev };
          if (allSelected) for (const x of rows) delete next[String(x.e.employee_code)];
          else for (const x of rows) next[String(x.e.employee_code)] = true;
          return next;
        });

        return (
          <>
            <div className="section-title" style={{ flexWrap: "wrap", gap: 12 }}>
              <div>
                <h2>تخطيط مواصلات الموظفين</h2>
                <span>صفِّ الموظفين حسب موقع السكن ونظام الدوام وحالة الدورة في تاريخ معيّن (مثل: القادمون صباح يوم قادم من خط الحديدة)، ثم أسنِدهم لرحلة مخططة.</span>
              </div>
              <label className="field" style={{ minWidth: 170 }}>
                <span>تاريخ الرحلة</span>
                <input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} />
              </label>
            </div>

            <div className="form-panel import-panel" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
              <label className="field" style={{ minWidth: 150 }}><span>موقع السكن</span>
                <select value={planHousing} onChange={(e) => setPlanHousing(e.target.value)}>
                  <option value="">كل مواقع السكن</option>
                  {housingOptions.map(([name, count]) => <option key={name} value={name}>{name} ({count})</option>)}
                </select>
              </label>
              <label className="field" style={{ minWidth: 230 }}><span>نظام الدوام (جدول العمل)</span>
                <select value={planSchedule} onChange={(e) => setPlanSchedule(e.target.value)}>
                  <option value="">كل الأنظمة</option>
                  {scheduleOptions.map(([name, count]) => <option key={name} value={name}>{name} ({count})</option>)}
                </select>
              </label>
              <label className="field" style={{ minWidth: 150 }}><span>حالة الدورة</span>
                <select value={planStatus} onChange={(e) => setPlanStatus(e.target.value as CycleStatus | "")}>
                  {CYCLE_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <div className="input-wrap" style={{ flex: 1, minWidth: 200 }}>
                <input placeholder="ابحث بالكود أو الاسم أو الإدارة…" value={planSearch} onChange={(e) => setPlanSearch(e.target.value)} />
              </div>
              <small className="muted">النتائج: {rows.length} موظف</small>
            </div>

            <div className="form-panel">
              <div className="panel-title">
                <div>
                  <BusFront size={22} />
                  <div>
                    <h2>إسناد الموظفين المحددين إلى رحلة</h2>
                    <span>بعد التحديد من الجدول بالأسفل، اختر السائق والباص والخط وهدف الرحلة ثم أنشئ الرحلة المخططة.</span>
                  </div>
                </div>
              </div>
              <div className="form-grid">
                <label className="field"><span>السائق</span><select value={pForm.driver_code} onChange={e => selectPDriver(e.target.value)}><option value="">— اختر السائق —</option>{drivers.map(d => <option key={d.id} value={d.driver_code ?? ""}>{d.full_name} ({d.driver_code ?? ""})</option>)}</select></label>
                <label className="field"><span>رقم الباص</span><select value={pForm.bus_number} onChange={e => setPForm((f: any) => ({ ...f, bus_number: e.target.value }))}><option value="">— اختر الباص —</option>{pBuses.map(b => <option key={b.id} value={b.number}>{b.number}{b.plate_number ? ` (${b.plate_number})` : ""}</option>)}</select></label>
                <label className="field"><span>خط السير</span><select value={pForm.route_name} onChange={e => selectPRoute(e.target.value)}><option value="">— اختر الخط —</option>{pRoutes.map(r => <option key={r.id} value={r.name}>{r.name} ({r.origin} → {r.destination})</option>)}</select></label>
                <label className="field"><span>هدف الرحلة</span><select value={pForm.trip_type} onChange={e => setPForm((f: any) => ({ ...f, trip_type: e.target.value }))}>{TRIP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
                <label className="field"><span>موعد الانطلاق</span><input type="datetime-local" value={pForm.scheduled_start_at} onChange={e => setPForm((f: any) => ({ ...f, scheduled_start_at: e.target.value }))} /></label>
              </div>
              {violating.length > 0 && (
                <div className="alert danger" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <AlertTriangle size={18} />
                  <span>تنبيه مخالفة: {violating.length} من المحددين حالتهم لا تطابق «{dirType}» في هذا التاريخ (صعود خارج الخطة). يمكنك المتابعة أو تعديل التحديد.</span>
                </div>
              )}
              <button className="primary-btn" onClick={createPlanWithEmployees} disabled={loading || !pForm.driver_code || !pForm.bus_number || !pForm.route_name || !pForm.scheduled_start_at || !selectedCodes.length}>
                <Plus size={18} />{loading ? "جارٍ الحفظ..." : `تخطيط رحلة بـ ${selectedCodes.length} موظف`}
              </button>
            </div>

            <div className="stats-grid">
              <div className="metric"><div><span>المعروضون</span><strong>{rows.length}</strong></div></div>
              <div className="metric"><div><span>المحدَّدون</span><strong>{selectedCodes.length}</strong></div></div>
              <div className="metric"><div><span>مخالفون</span><strong>{violating.length}</strong></div></div>
              <div className="metric"><div><span>حسب الحالة</span><strong style={{ fontSize: 13 }}>{statusSummary}</strong></div></div>
            </div>

            <div className="table-card">
              <div className="table-scroll" style={{ maxHeight: 520 }}>
                <table>
                  <thead>
                    <tr>
                      <th><input type="checkbox" checked={allSelected} onChange={toggleAll} title="تحديد الكل" /></th>
                      <th>#</th><th>الكود</th><th>الاسم</th><th>الإدارة</th><th>السكن</th><th>نظام الدوام</th><th>حالة الدورة</th><th>المغادرة</th><th>التنبيه</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((x, i) => {
                      const code = String(x.e.employee_code);
                      const bad = !!wantStatus && x.cycle.status !== wantStatus;
                      return (
                        <tr key={`${code}-${i}`}>
                          <td><input type="checkbox" checked={!!planSelected[code]} onChange={() => toggle(code)} /></td>
                          <td>{i + 1}</td>
                          <td>{x.e.employee_code || "—"}</td>
                          <td><strong>{x.e.name || "—"}</strong></td>
                          <td>{x.e.department_name || "—"}</td>
                          <td>{x.e.housing_location || "—"}</td>
                          <td><span className="stack-cell"><strong>{x.e.schedule_desc || x.e.work_schedule || "—"}</strong>{x.e.work_schedule && <small>جدول {x.e.work_schedule}</small>}</span></td>
                          <td><CycleBadge info={x.cycle} withPosition /></td>
                          <td>{x.e.departure_time || "—"}</td>
                          <td>{bad ? <span className="status status-cancelled">مخالف</span> : <span className="status status-completed">مطابق</span>}</td>
                        </tr>
                      );
                    })}
                    {!rows.length && (
                      <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>
                        {allEmployees.length ? "لا يوجد موظفون مطابقون لهذا الفلتر/التاريخ." : "لا توجد بيانات موظفين — ارفع كشف الموظفين مع نظام الدوام من تبويب «الموظفون»."}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );
      })()}

      {tab === "plans" && (
        <>
          {plans.filter((p: any) => p.local).length > 0 && (
            <div className="alert success pending-bar">
              <span>يوجد {plans.filter((p: any) => p.local).length} رحلة محفوظة محلياً بانتظار الإرسال إلى الخادم.</span>
              <button className="primary-btn" onClick={sendPending} disabled={loading}><Send size={16} style={{ verticalAlign: "-3px" }} />{loading ? "جارٍ الإرسال..." : "إرسال الآن"}</button>
            </div>
          )}
          <div className="table-card">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>الرحلة</th><th>السائق</th><th>الباص</th><th>الخط</th><th>النوع</th><th>الموعد</th><th>المُسندون</th><th>الحالة</th></tr>
                </thead>
                <tbody>
                  {plans.map(p => (
                    <tr key={p.id}>
                      <td><strong>{p.trip_number}</strong></td>
                      <td>{(p as any).local ? (drivers.find(d => d.driver_code === p.driver_id)?.full_name || p.driver_id || "—") : (drivers.find(d => d.id === p.driver_id)?.full_name || "—")}</td>
                      <td>{p.bus_number}</td>
                      <td>{p.route_name}<small>{p.origin} → {p.destination}</small></td>
                      <td>{tripTypeLabel(p.trip_type)}</td>
                      <td>{new Date(p.scheduled_start_at).toLocaleString("ar-EG")}</td>
                      <td>{p.assigned_employees?.length ? <span className="status status-completed">{p.assigned_employees.length} موظف</span> : "—"}</td>
                      <td>{(p as any).local ? <span className="status status-local">محفوظة محلياً</span> : <StatusBadge status={p.status} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "drivers" && (
        <CrudTable
          title="السائقون" subtitle="إضافة أو تعديل أو حذف حسابات السائقين."
          items={drivers} columns={driverColumns} fields={driverFields}
          onSave={async (p, i) => { await localSave("driver", p, i, async (pp, iid) => { if (iid !== undefined) await updateDriver(String(iid), pp); else await addDriver(pp); }, "السائق"); }}
          onDelete={async id => { await localRemove("driver", id, async (iid) => { const res = await deleteDriver(String(iid)); afterAction(res.deactivated ? "السائق له رحلات سابقة — تم تعطيله بدلاً من الحذف" : "تم حذف السائق"); }); }}
        />
      )}

      {tab === "users" && (
        <CrudTable
          title="المستخدمون" subtitle="جميع حسابات النظام (سائق/مشرف/أدمن) — تغيير كلمة مرور كل حساب تتم مستقلّة. إنشاء حساب جديد متاح للمدير."
          items={users} columns={userColumns} fields={userFields}
          onSave={async (p, i) => { if (i !== undefined) await updateAdminUser(String(i), p); else await addAdminUser(p); afterAction("تم حفظ المستخدم"); }}
        />
      )}

      {tab === "employees" && (
        <>
          <div className="form-panel import-panel">
            <div className="panel-title">
              <div>
                <Upload size={22} />
                <div>
                  <h2>استيراد ملف الموظفين</h2>
                  <span>ارفع ملف «كشف الموظفين مع نظام الدوام» (CSV/Excel) — يشمل: الكود، الاسم، الإدارة، الوظيفة، الشركة، السكن، جدول العمل، شرح نوع الدوام، أيام العمل/الراحة، الدورة، وقت المغادرة، نوع الخدمة، تصنيف النقل، دورة اليوم وغداً.</span>
                </div>
              </div>
            </div>
            <div className="add-row">
              <input ref={fileRef} type="file" accept=".csv,.xlsx" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])} />
            </div>
          </div>
          <CrudTable
            title="الموظفون" subtitle="إضافة أو تعديل أو حذف سجلات الموظفين."
            items={employees} columns={employeeColumns} fields={employeeFields}
            searchable searchValue={empSearch} onSearch={onEmpSearch}
            onSave={async (p, i) => { await localSave("employee", p, i, async (pp, iid) => { if (iid !== undefined) await updateEmployeeMaster(iid, pp); else await addEmployeeMaster(pp); }, "الموظف"); }}
            onDelete={async id => { await localRemove("employee", id, async (iid) => { await deleteEmployeeMaster(iid); afterAction("تم حذف الموظف"); }); }}
          />
        </>
      )}

      {tab === "buses" && (
        <CrudTable
          title="الباصات" subtitle="إدارة أسطول الباصات. عند وجود رحلات سابقة يُعطّل بدلاً من الحذف."
          items={buses} columns={busColumns} fields={busFields}
          onSave={async (p, id) => { if (id) { await updateBus(id, p); } else { await addBus(p); } afterAction("تم حفظ بيانات الباص"); }}
          onDelete={async id => { const res = await deleteBus(id); afterAction(res.deactivated ? "الباص مستخدم في رحلات — تم تعطيله" : "تم حذف الباص"); }}
        />
      )}

      {tab === "routes" && (
        <CrudTable
          title="الخطوط" subtitle="خطوط السير المتاحة لتخطيط الرحلات."
          items={routes} columns={routeColumns} fields={routeFields}
          onSave={async (p, id) => { if (id) { await updateRoute(id, p); } else { await addRoute(p); } afterAction("تم حفظ الخط"); }}
          onDelete={async id => { const res = await deleteRoute(id); afterAction(res.deactivated ? "الخط مستخدم في رحلات — تم تعطيله" : "تم حذف الخط"); }}
        />
      )}

      {tab === "companies" && (
        <CrudTable
          title="الشركات" subtitle="التحكم بشركات التشغيل وترميزها."
          items={companies} columns={companyColumns} fields={companyFields}
          onSave={async (p, i) => { await localSave("company", p, i, async (pp, iid) => { if (iid !== undefined) await updateCompany(iid, pp); else await addCompany(pp); }, "الشركة"); }}
          onDelete={async id => { await localRemove("company", id, async (iid) => { const res = await deleteCompany(iid); afterAction(res.deactivated ? "الشركة مرتبطة بإدارات — تم تعطيلها" : "تم حذف الشركة"); }); }}
        />
      )}

      {tab === "departments" && (
        <CrudTable
          title="الإدارات" subtitle="إدارات الموظفين المرتبطة بكل شركة."
          items={departments} columns={departmentColumns} fields={departmentFields}
          onSave={async (p, id) => { if (id) { await updateDepartment(id, p); } else { await addDepartment(p); } afterAction("تم حفظ الإدارة"); }}
          onDelete={async id => { await deleteDepartment(id); afterAction("تم حذف الإدارة"); }}
        />
      )}

      {tab === "jobs" && (
        <CrudTable
          title="الوظائف" subtitle="المسميات الوظيفية."
          items={jobs} columns={jobColumns} fields={jobFields}
          onSave={async (p, id) => { if (id) { await updateJob(id, p); } else { await addJob(p); } afterAction("تم حفظ الوظيفة"); }}
          onDelete={async id => { await deleteJob(id); afterAction("تم حذف الوظيفة"); }}
        />
      )}

      {tab === "housing" && (
        <CrudTable
          title="السكن" subtitle="مواقع السكن المتاحة."
          items={housing} columns={housingColumns} fields={housingFields}
          onSave={async (p, id) => { if (id) { await updateHousing(id, p); } else { await addHousing(p); } afterAction("تم حفظ السكن"); }}
          onDelete={async id => { await deleteHousing(id); afterAction("تم حذف السكن"); }}
        />
      )}

      {tab === "new" && (
        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>الكود</th><th>الاسم</th><th>الوظيفة</th><th>الشركة</th><th>الرحلة</th><th>أضافه</th><th>الحالة</th><th>الإجراء</th></tr>
              </thead>
              <tbody>
                {newEmployees.map(row => {
                  const req = row.request;
                  return (
                    <tr key={req.id}>
                      <td>{req.employee_code || "—"}</td>
                      <td><strong>{req.name}</strong></td>
                      <td>{req.job_title || "—"}</td>
                      <td>{req.company || "—"}</td>
                      <td>{row.trip_number}</td>
                      <td>{row.created_by_name || "—"}</td>
                      <td>{req.status}</td>
                      <td>
                        <div className="row-actions">
                          <button className="secondary-btn" onClick={() => review(req.id, "approved")}><UserCheck size={16} />اعتماد</button>
                          <button className="danger-btn" onClick={() => review(req.id, "rejected")}>رفض</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    {tab === "trips" && (
        <>
          <div className="section-title" style={{ justifyContent: "space-between" }}>
            <div>
              <h2>رحلات السائقين المكتملة</h2>
              <span>التقارير الواصلة من أجهزة السائقين — اضغط «عرض» لاستعراض الرحلة كاملة، مع الطباعة أو الإرسال عبر واتساب أو نسخ النص.</span>
            </div>
            <button className="secondary-btn" onClick={exportReports}><FileSpreadsheet size={16} /> تصدير Excel</button>
          </div>
          <div className="table-card">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>الرحلة</th><th>السائق</th><th>الباص</th><th>الخط</th><th>الصاعدون</th><th>وصول التقرير</th><th>الحالة</th><th>الإجراء</th></tr>
                </thead>
                <tbody>
                  {reports.map(r => {
                    const trip = (r.raw && r.raw.trip) || {};
                    const route = r.origin && r.destination ? `${r.origin} → ${r.destination}` : (r.route || "—");
                    const st = r.integration_status === "success" || r.integration_status === "server_only" ? "status-completed" : "status-needs_review";
                    return (
                      <tr key={r.id}>
                        <td><strong>{r.trip_number}</strong></td>
                        <td>{r.driver_name || r.driver_username || "—"}</td>
                        <td>{trip.bus_number || "—"}</td>
                        <td>{route}<small>{r.trip_type ? `النوع: ${r.trip_type}` : ""}</small></td>
                        <td>{r.employee_count ?? 0}</td>
                        <td>{r.received_at ? new Date(r.received_at).toLocaleString("ar-EG") : "—"}</td>
                        <td><span className={`status ${st}`}>{reportStatusLabel(r.integration_status)}</span></td>
                        <td>
                          <button className="secondary-btn" onClick={() => setViewReport(r)}><Eye size={15} />عرض</button>
                        </td>
                      </tr>
                    );
                  })}
                  {!reports.length && (
                    <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>لا توجد تقارير بعد — ستظهر هنا الرحلات التي يُكملها السائقون ويرسلونها.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {viewReport && (() => {
            const { trip, employees: reportEmployees } = reportTripOf(viewReport);
            const route = trip.origin && trip.destination ? `${trip.origin} → ${trip.destination}` : (trip.route || viewReport.route || "—");
            const f = (v: any) => (v ? new Date(v).toLocaleString("ar-EG") : "—");
            const meta: Array<[string, string]> = [
              ["السائق", viewReport.driver_name || viewReport.driver_username || "—"],
              ["الباص", trip.bus_number || "—"],
              ["الخط", route],
              ...(trip.trip_type ? [["النوع", trip.trip_type] as [string, string]] : []),
              ...(trip.company_code ? [["الشركة", trip.company_code] as [string, string]] : []),
              ["الانطلاق المخطط", f(trip.scheduled_start_at)],
              ["البداية", f(trip.started_at)],
              ["الإكمال", f(trip.completed_at)],
              ["وصول التقرير", f(viewReport.received_at)],
              ["الحالة", reportStatusLabel(viewReport.integration_status)],
            ];
            const scheduleOf = (empCode: string) => allEmployees.find((e) => e.employee_code === empCode) || null;
            const tripDateRaw = reportTripDateRaw(viewReport);
            const dayBoard = boardedCodesForDate(reports, tripDateRaw || "");
            const plannedEmployees = tripDateRaw ? allEmployees.filter((e) => employeeCycle(e, tripDateRaw)?.isWorkDay) : [];
            const plannedCodes = new Set(plannedEmployees.map((e) => String(e.employee_code)));
            const plannedBoarded = plannedEmployees.filter((e) => dayBoard.has(String(e.employee_code))).length;
            const plannedMissing = plannedEmployees.length - plannedBoarded;
            const extraBoarded = Array.from(dayBoard).filter((c) => !plannedCodes.has(c)).length;
            const scheduleCell = (empCode: string) => {
              const s = scheduleOf(empCode);
              if (!s) return <small className="muted">غير مسجّل في الكشف</small>;
              if (!s.work_schedule && !s.schedule_desc && s.rotation_status === "") return <small className="muted">بدون خطة دوام</small>;
              const bits: string[] = [];
              if (s.schedule_desc) bits.push(s.schedule_desc);
              else if (s.work_schedule) bits.push(`جدول ${s.work_schedule}`);
              if (s.rotation_status) bits.push(s.rotation_status);
              if (s.base_status_today) bits.push(`اليوم: ${s.base_status_today}`);
              if (s.cycle_day_today !== null && s.cycle_day_today !== undefined) bits.push(`دورة اليوم ${s.cycle_day_today} / غداً ${s.cycle_day_tomorrow ?? "—"}`);
              if (s.work_days !== null && s.work_days !== undefined) bits.push(`${s.work_days} عمل / ${s.rest_days ?? 0} راحة`);
              if (s.departure_time) bits.push(`مغادرة ${s.departure_time}`);
              return <span className="stack-cell"><strong>{bits[0] || "—"}</strong>{bits.slice(1).map((b, i) => <small key={i}>{b}</small>)}</span>;
            };
            const matchCell = (p: any) => {
              if (!p.employee_code) return <small className="muted">غير موظف</small>;
              const emp = scheduleOf(String(p.employee_code));
              if (!emp) return <small className="muted">غير مسجّل في الكشف</small>;
              const cycle = employeeCycle(emp, tripDateRaw || todayIso());
              if (!cycle) return <small className="muted">بلا دورة</small>;
              return cycle.isWorkDay
                ? <span className="status status-completed">مطابق الخطة</span>
                : <span className="status status-cancelled">صعد بلا خطة</span>;
            };
            const cycleCell = (p: any) => {
              if (!p.employee_code) return <span className="status status-planned">—</span>;
              return <CycleBadge info={employeeCycle(scheduleOf(String(p.employee_code)), tripDateRaw || todayIso())} withPosition />;
            };
            return (
              <div className="modal-backdrop" onClick={() => setViewReport(null)}>
                <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
                  <div className="modal-head">
                    <div>
                      <div className="eyebrow">TRIP REPORT</div>
                      <h2>تقرير رحلة {viewReport.trip_number}</h2>
                    </div>
                    <button className="icon-btn" onClick={() => setViewReport(null)}>×</button>
                  </div>
                  <div className="stack-lg">
                    <div className="report-meta">
                      {meta.map(([k, v]) => (
                        <div className="report-meta-item" key={k}><span>{k}</span><strong>{v}</strong></div>
                      ))}
                    </div>
                    <h3 className="report-list-title">الصاعدون ({reportEmployees.length}) — المطابقة مع خطة دوام كل موظف</h3>
                    {tripDateRaw && (
                      <div className="alert success" style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
                        <span>المخطط لهذا اليوم (يوم عمل): <strong>{plannedEmployees.length}</strong></span>
                        <span>صعدوا من المخطط: <strong>{plannedBoarded}</strong></span>
                        <span>لم يصعدوا: <strong>{plannedMissing}</strong></span>
                        <span>صعدوا بدون خطة: <strong>{extraBoarded}</strong></span>
                        <button className="link-btn" onClick={() => { setCycleDate(tripDateRaw.slice(0, 10)); setTab("compare"); setViewReport(null); }}>القائمة الكاملة في «المخطط مقابل الفعلي» ←</button>
                      </div>
                    )}
                    <div className="table-scroll" style={{ maxHeight: 260 }}>
                      <table>
                        <thead>
                          <tr><th>#</th><th>الكود</th><th>الاسم</th><th>الإدارة</th><th>الشركة</th><th>السكن</th><th>خطة الدوام</th><th>حالة الدورة</th><th>مطابقة الخطة</th><th>الحالة</th></tr>
                        </thead>
                        <tbody>
                          {reportEmployees.map((p, i) => (
                            <tr key={`${p.employee_code}-${i}`}>
                              <td>{i + 1}</td>
                              <td>{p.employee_code || "—"}</td>
                              <td><strong>{p.name || "—"}</strong></td>
                              <td>{p.department || "—"}</td>
                              <td>{p.company || "—"}</td>
                              <td>{p.housing_location || "—"}</td>
                              <td>{p.employee_code ? scheduleCell(p.employee_code) : <small className="muted">غير موظف</small>}</td>
                              <td>{cycleCell(p)}</td>
                              <td>{matchCell(p)}</td>
                              <td>{reportEmployeeStatus(p)}</td>
                            </tr>
                          ))}
                          {!reportEmployees.length && (
                            <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--muted)", padding: 16 }}>لم تُسجَّل قائمة صاعدين مع هذا التقرير.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="modal-actions" style={{ flexWrap: "wrap" }}>
                      <button className="secondary-btn" onClick={() => openReportTripWhatsApp(viewReport)}><MessageCircle size={16} /> إرسال واتساب</button>
                      <button className="secondary-btn" onClick={() => printTripReport(viewReport)}><Printer size={16} /> طباعة / PDF</button>
                      <button className="secondary-btn" onClick={() => {
                        try {
                          navigator.clipboard.writeText(reportTripText(viewReport));
                          setMsg("تم نسخ نص التقرير — الصقه في أي محادثة.");
                        } catch {
                          setMsg("تعذر النسخ التلقائي — استخدم «طباعة / PDF» أو «واتساب».");
                        }
                      }}><Copy size={16} /> نسخ النص</button>
                      <button className="primary-btn" onClick={() => setViewReport(null)}>إغلاق</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {tab === "daily" && (() => {
        const dateValue = dailyDate || todayIso();
        type Agg = { pArr: number; pDep: number; pWork: number; aArr: number; aDep: number; aBus: Set<string>; dBus: Set<string> };
        const lines = new Map<string, Agg>();
        const ensure = (key: string): Agg => {
          let a = lines.get(key);
          if (!a) { a = { pArr: 0, pDep: 0, pWork: 0, aArr: 0, aDep: 0, aBus: new Set(), dBus: new Set() }; lines.set(key, a); }
          return a;
        };
        const lineOf = (value: any) => String(value ?? "").trim() || "غير محدد";
        for (const e of allEmployees) {
          const c = employeeCycle(e, dateValue);
          if (!c) continue;
          const a = ensure(lineOf(e.housing_location));
          if (c.status === "arriving") a.pArr += 1;
          else if (c.status === "departing") a.pDep += 1;
          else if (c.status === "working") a.pWork += 1;
        }
        let tripsArriving = 0;
        let tripsDeparting = 0;
        const dayReports = reportsForDate(reports, dateValue);
        for (const r of dayReports) {
          const { trip, employees: passengers } = reportTripOf(r);
          const type = reportTypeOf(r);
          if (type === "قادم") tripsArriving += 1; else tripsDeparting += 1;
          for (const p of passengers) {
            if (p.source === "non_employee") continue;
            const a = ensure(lineOf(p.housing_location));
            if (type === "قادم") { a.aArr += 1; a.aBus.add(String(trip.bus_number || "—")); }
            else { a.aDep += 1; a.dBus.add(String(trip.bus_number || "—")); }
          }
        }
        const rows = Array.from(lines.entries())
          .map(([line, a]) => ({ line, ...a }))
          .sort((x, y) => (y.pArr + y.pDep + y.aArr + y.aDep) - (x.pArr + x.pDep + x.aArr + x.aDep));
        const sum = (pick: (a: Agg) => number) => rows.reduce((n, r) => n + pick(r), 0);
        const pArr = sum((a) => a.pArr), aArr = sum((a) => a.aArr);
        const pDep = sum((a) => a.pDep), aDep = sum((a) => a.aDep);
        const busList = (set: Set<string>) => (set.size ? Array.from(set).join("، ") : "—");
        const diffCell = (d: number) => (d === 0
          ? <span className="status status-completed">0</span>
          : <span className={`status ${d > 0 ? "status-received" : "status-cancelled"}`}>{d > 0 ? `+${d}` : d}</span>);
        return (
          <>
            <div className="section-title" style={{ flexWrap: "wrap", gap: 12 }}>
              <div>
                <h2>الخطة اليومية التلقائية</h2>
                <span>تُحسب خطة القادمين والمغادرين لكل خط (موقع السكن) من دورية كل موظف تلقائياً — بلا ربطها بأي سائق — وتُقارن فوراً بالرحلات الفعلية الواردة من تقارير السائقين في نفس اليوم.</span>
              </div>
              <label className="field" style={{ minWidth: 190 }}>
                <span>تاريخ اليوم</span>
                <input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} />
              </label>
            </div>
            <div className="stats-grid">
              <div className="metric"><div><span>قادم مخطط</span><strong>{pArr}</strong></div></div>
              <div className="metric"><div><span>قادم فعلي</span><strong>{aArr}</strong></div></div>
              <div className="metric"><div><span>مغادر مخطط</span><strong>{pDep}</strong></div></div>
              <div className="metric"><div><span>مغادر فعلي</span><strong>{aDep}</strong></div></div>
            </div>
            <div className="alert success" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <span>رحلات قادمة فعلية: <strong>{tripsArriving}</strong></span>
              <span>رحلات مغادرة فعلية: <strong>{tripsDeparting}</strong></span>
              <span>إجمالي الخطوط: <strong>{rows.length}</strong></span>
            </div>
            <div className="table-card">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>الخط (السكن)</th>
                      <th>قادم مخطط</th><th>قادم فعلي</th><th>فرق</th>
                      <th>مغادر مخطط</th><th>مغادر فعلي</th><th>فرق</th>
                      <th>مداوم</th>
                      <th>باصات قادمة</th><th>باصات مغادرة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.line}>
                        <td><strong>{a.line}</strong></td>
                        <td>{a.pArr}</td>
                        <td>{a.aArr}</td>
                        <td>{diffCell(a.aArr - a.pArr)}</td>
                        <td>{a.pDep}</td>
                        <td>{a.aDep}</td>
                        <td>{diffCell(a.aDep - a.pDep)}</td>
                        <td>{a.pWork}</td>
                        <td>{busList(a.aBus)}</td>
                        <td>{busList(a.dBus)}</td>
                      </tr>
                    ))}
                    {!rows.length && (
                      <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>
                        {allEmployees.length ? "لا توجد بيانات لهذا اليوم." : "لا توجد بيانات موظفين بعد — ارفع كشف الموظفين من تبويب «الموظفون»."}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );
      })()}

      {tab === "actual" && (() => {
        const dateValue = actualDate || todayIso();
        const q = actualSearch.trim().toLowerCase();
        const dayReports = reportsForDate(reports, dateValue);
        const all = actualRowsForDate(reports, dateValue, allEmployees);
        const rows = all
          .filter((r) => !q || [r.code, r.name, r.housing, r.department, r.driver, r.bus, r.route, r.tripNumber].some((v) => String(v ?? "").toLowerCase().includes(q)))
          .filter((r) => !actualOnlyViolation || r.status === "violation");
        const count = (s: ActualRow["status"]) => all.filter((r) => r.status === s).length;
        const statusCell = (r: ActualRow) => {
          if (r.status === "nonemp") return <span className="status status-planned">غير موظف</span>;
          if (r.status === "unknown") return <span className="status status-needs_review">غير مسجّل في الكشف</span>;
          if (r.status === "match") return <span className="status status-completed">حسب الخطة</span>;
          return <span className="status status-cancelled">مخالف</span>;
        };
        return (
          <>
            <div className="section-title" style={{ flexWrap: "wrap", gap: 12 }}>
              <div>
                <h2>الموظفون الفعليون (الصاعدون)</h2>
                <span>كل من صعد فعلاً في رحلات يوم معيّن، مع اسم السائق ورقم الباص والمسار، وتحديد إن كان حسب خطة دوريته أم مخالفاً.</span>
              </div>
              <div className="row-actions" style={{ alignItems: "flex-end" }}>
                <label className="field" style={{ minWidth: 180 }}>
                  <span>تاريخ الرحلة</span>
                  <input type="date" value={actualDate} onChange={(e) => setActualDate(e.target.value)} />
                </label>
                <button className="secondary-btn" onClick={() => load(true)} disabled={loading}><RefreshCw size={16} />تحديث</button>
              </div>
            </div>
            <div className="stats-grid">
              <div className="metric"><div><span>إجمالي الصاعدين</span><strong>{all.length}</strong></div></div>
              <div className="metric"><div><span>حسب الخطة</span><strong>{count("match")}</strong></div></div>
              <div className="metric"><div><span>مخالفون</span><strong>{count("violation")}</strong></div></div>
              <div className="metric"><div><span>غير مسجّلين/غير موظفين</span><strong>{count("unknown") + count("nonemp")}</strong></div></div>
            </div>
            <div className="form-panel import-panel" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <div className="input-wrap" style={{ flex: 1, minWidth: 220 }}>
                <input placeholder="ابحث بالكود أو الاسم أو السكن أو السائق أو الباص…" value={actualSearch} onChange={(e) => setActualSearch(e.target.value)} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <input type="checkbox" checked={actualOnlyViolation} onChange={(e) => setActualOnlyViolation(e.target.checked)} />
                <span>إظهار المخالفين فقط</span>
              </label>
              <small className="muted">الرحلات الفعلية لهذا اليوم: {dayReports.length}</small>
            </div>
            <div className="table-card">
              <div className="table-scroll" style={{ maxHeight: 560 }}>
                <table>
                  <thead>
                    <tr>
                      <th>#</th><th>الكود</th><th>الاسم</th><th>الخط (السكن)</th><th>الإدارة</th>
                      <th>السائق</th><th>الباص</th><th>المسار</th><th>الرحلة</th><th>النوع</th><th>وقت الصعود</th><th>المطابقة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={`${r.tripNumber}-${r.code}-${i}`}>
                        <td>{i + 1}</td>
                        <td>{r.code || "—"}</td>
                        <td><strong>{r.name || "—"}</strong></td>
                        <td>{r.housing || "—"}</td>
                        <td>{r.department || "—"}</td>
                        <td>{r.driver}</td>
                        <td>{r.bus}</td>
                        <td>{r.route}</td>
                        <td>{r.tripNumber}</td>
                        <td>{r.tripType}</td>
                        <td>{r.boardedAt ? new Date(r.boardedAt).toLocaleString("ar-EG") : "—"}</td>
                        <td>{statusCell(r)}</td>
                      </tr>
                    ))}
                    {!rows.length && (
                      <tr><td colSpan={12} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>
                        لا يوجد صاعدون فعليون لهذا التاريخ/الفلتر — ستظهر الحالات هنا فور وصول تقارير رحلات السائقين.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );
      })()}

      {tab === "compare" && (() => {
        const dateValue = cycleDate || todayIso();
        const planned = allEmployees
          .map((e) => ({ emp: e, cycle: employeeCycle(e, dateValue) }))
          .filter((x) => x.cycle && x.cycle.isWorkDay)
          .map((x) => ({ ...x.emp, cycle: x.cycle as CycleInfo }));
        const boardedCodes = boardedCodesForDate(reports, dateValue);
        const q = cycleSearch.trim().toLowerCase();
        const match = (e: any) => !q || [e.employee_code, e.name, e.department_name, e.company_name, e.housing_location]
          .some((v) => String(v ?? "").toLowerCase().includes(q));
        const plannedRows = planned
          .map((e: any) => ({ ...e, boarded: boardedCodes.has(String(e.employee_code)) }))
          .filter(match)
          .filter((e: any) => !cycleOnlyMissing || !e.boarded);
        const plannedCodes = new Set(planned.map((e: any) => String(e.employee_code)));
        const plannedBoarded = planned.filter((e: any) => boardedCodes.has(String(e.employee_code))).length;
        const missing = planned.length - plannedBoarded;
        const targetIdx = toDayIndex(dateValue);
        const extraMap = new Map<string, any>();
        for (const r of reports) {
          const raw = reportTripDateRaw(r);
          if (targetIdx === null || raw === null || toDayIndex(raw) !== targetIdx) continue;
          const { employees } = reportTripOf(r);
          for (const p of employees) {
            const code = p && p.employee_code ? String(p.employee_code) : "";
            if (!code || plannedCodes.has(code) || extraMap.has(code)) continue;
            extraMap.set(code, p);
          }
        }
        const extraRows = Array.from(extraMap.values());
        return (
          <>
            <div className="section-title" style={{ flexWrap: "wrap", gap: 12 }}>
              <div>
                <h2>المخطط مقابل الفعلي</h2>
                <span>الموظفون الذين تقول دوريتهم إنهم في يوم عمل بتاريخ الرحلة، مقابل من صعد فعلاً في تقارير السائقين لنفس التاريخ (طريقة مطابقة GhithOps).</span>
              </div>
              <div className="row-actions" style={{ alignItems: "flex-end" }}>
                <label className="field" style={{ minWidth: 190 }}>
                  <span>تاريخ المقارنة</span>
                  <input type="date" value={cycleDate} onChange={(e) => setCycleDate(e.target.value)} />
                </label>
                <button className="secondary-btn" onClick={() => load(true)} disabled={loading}><RefreshCw size={16} />تحديث</button>
              </div>
            </div>
            <div className="stats-grid">
              <div className="metric"><div><span>المخطط (يوم عمل)</span><strong>{planned.length}</strong></div></div>
              <div className="metric"><div><span>صعد من المخطط</span><strong>{plannedBoarded}</strong></div></div>
              <div className="metric"><div><span>لم يصعد (مخطط)</span><strong>{missing}</strong></div></div>
              <div className="metric"><div><span>صعد بدون خطة</span><strong>{extraRows.length}</strong></div></div>
            </div>
            <div className="form-panel import-panel" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <div className="input-wrap" style={{ flex: 1, minWidth: 220 }}>
                <input placeholder="ابحث بالكود أو الاسم أو الإدارة أو السكن…" value={cycleSearch} onChange={(e) => setCycleSearch(e.target.value)} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <input type="checkbox" checked={cycleOnlyMissing} onChange={(e) => setCycleOnlyMissing(e.target.checked)} />
                <span>إظهار «لم يصعد» فقط</span>
              </label>
              <small className="muted">عدد الموظفين المسجّلين في الكشف: {allEmployees.length}</small>
            </div>
            <div className="table-card">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr><th>#</th><th>الكود</th><th>الاسم</th><th>الإدارة</th><th>الشركة</th><th>السكن</th><th>حالة الدورة</th><th>النتيجة</th></tr>
                  </thead>
                  <tbody>
                    {plannedRows.map((e: any, i: number) => (
                      <tr key={`${e.employee_code}-${i}`}>
                        <td>{i + 1}</td>
                        <td>{e.employee_code || "—"}</td>
                        <td><strong>{e.name || "—"}</strong></td>
                        <td>{e.department_name || "—"}</td>
                        <td>{e.company_name || "—"}</td>
                        <td>{e.housing_location || "—"}</td>
                        <td><CycleBadge info={e.cycle} withPosition /></td>
                        <td>{e.boarded
                          ? <span className="status status-completed">صعد</span>
                          : <span className="status status-cancelled">لم يصعد</span>}</td>
                      </tr>
                    ))}
                    {!plannedRows.length && (
                      <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>
                        {allEmployees.length
                          ? "لا يوجد موظفون بحالة «يوم عمل» مطابقون لهذا التاريخ/الفلتر."
                          : "لا توجد بيانات موظفين بعد — ارفع كشف الموظفين مع نظام الدوام من تبويب «الموظفون»."}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {extraRows.length > 0 && (
              <div className="section">
                <div className="section-title">
                  <div><h2>صعدوا بدون خطة دوام ({extraRows.length})</h2><span>مسجّلون في تقارير الرحلات لهذا التاريخ لكن دوريتهم لا تقول إنهم في يوم عمل.</span></div>
                </div>
                <div className="table-card">
                  <div className="table-scroll" style={{ maxHeight: 320 }}>
                    <table>
                      <thead>
                        <tr><th>#</th><th>الكود</th><th>الاسم</th><th>الإدارة</th><th>الشركة</th><th>حالة الدورة</th></tr>
                      </thead>
                      <tbody>
                        {extraRows.map((p: any, i: number) => {
                          const emp = allEmployees.find((e) => e.employee_code === String(p.employee_code)) || null;
                          return (
                            <tr key={`${p.employee_code}-${i}`}>
                              <td>{i + 1}</td>
                              <td>{p.employee_code || "—"}</td>
                              <td><strong>{p.name || emp?.name || "—"}</strong></td>
                              <td>{p.department || emp?.department_name || "—"}</td>
                              <td>{p.company || emp?.company_name || "—"}</td>
                              <td><CycleBadge info={employeeCycle(emp, dateValue)} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        );
      })()}
    </AppShell>
  );
}