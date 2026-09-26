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
import { ArchiveRestore, BusFront, ChevronDown, ChevronUp, Copy, Download, Eye, FileSpreadsheet, MessageCircle, Plus, Printer, RefreshCw, Send, Upload, UserCheck } from "lucide-react";
import { useAuthGuard } from "@/lib/authGuard";
import { getCachedSnapshot, getLocalAdminPlans, loadSnapshot, queueAdminPlan, removeLocalAdminPlan, type Snapshot } from "@/lib/offlineStore";
import { applyAdminOps, dropLocalCreate, getAdminOps, isLocalRowId, isNetworkError, queueAdminOp, removeAdminOp, replaceLocalCreatePayload, type AdminEntity } from "@/lib/adminOps";
import { downloadContent, openReportTripWhatsApp, printTripReport, reportEmployeeStatus, reportStatusLabel, reportTripOf, reportTripText, reportsToXlsText } from "@/lib/export";

type Tab = "plans" | "drivers" | "users" | "employees" | "buses" | "routes" | "companies" | "departments" | "jobs" | "housing" | "new" | "trips";

const BOOL_OPTIONS = [{ value: true, label: "نشط" }, { value: false, label: "معطّل" }];
const YESNO = (v: any) => (v ? "نشط" : "معطّل");
const DASH = (v: any) => v || "—";
const ROLE_LABEL: Record<string, string> = { driver: "سائق", supervisor: "مشرف", admin: "مدير" };
const ROLE_OPTIONS = [{ value: "supervisor", label: "مشرف" }, { value: "admin", label: "أدمن" }];

const mapSnapshotDriver = (d: any) => ({ id: d.id, driver_code: d.driver_code ?? "", username: d.username, full_name: d.full_name, role: d.role, company_code: d.company_code, is_active: true });
const mapSnapshotUsers = (u: any) => ({ id: u.id, username: u.username, full_name: u.full_name, role: u.role, driver_code: u.driver_code ?? "", company_code: u.company_code ?? "", is_active: true, must_change_password: false });
const mapSnapshotPlanned = (p: any) => ({ ...p, driver_username: p.driver_username ?? "", status: p.status ?? "planned", trip_number: p.trip_number ?? String(p.id), trip_date: p.trip_date ?? "" });
const mapSnapshotEmployee = (e: any) => ({ id: e.id, employee_code: e.employee_code, name: e.name, job_title: e.job_title ?? "", department_name: e.department_name ?? "", company_name: e.company_name ?? "", housing_location: e.housing_location ?? "", is_active: e.is_active });
const mapSnapshotBus = (b: any) => ({ id: b.id, number: b.number, plate_number: b.plate_number ?? "", capacity: b.capacity, company_code: b.company_code, is_active: b.is_active });
const mapSnapshotRoute = (r: any) => ({ id: r.id, name: r.name, origin: r.origin ?? "", destination: r.destination ?? "", company_code: r.company_code, is_active: r.is_active });

export default function AdminPage() {
  useAuthGuard(["admin", "supervisor"]);
  const [tab, setTab] = useState<Tab>("plans");
  const [drivers, setDrivers] = useState<User[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [plans, setPlans] = useState<PlannedTrip[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [newEmployees, setNewEmployees] = useState<any[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [housing, setHousing] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [viewReport, setViewReport] = useState<any | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [empSearch, setEmpSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<any>({ driver_code: "", bus_number: "", route_name: "", origin: "", destination: "", scheduled_start_at: "", release_hours: "8" });
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
      company_code: "YCSR",
      trip_date: "",
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
          scheduled_start_at: p.scheduled_start_at,
          release_hours: p.release_hours,
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
    const s = getCachedSnapshot() ?? null;
    if (!s) return;
    setDrivers(s.drivers.map(mapSnapshotDriver));
    setUsers(s.drivers.map(mapSnapshotUsers));
    setPlans(s.planned.map(mapSnapshotPlanned));
    setEmployees(s.employees.map(mapSnapshotEmployee));
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
    const payload = {
      driver_code: form.driver_code,
      bus_number: form.bus_number,
      route_name: form.route_name,
      origin: form.origin,
      destination: form.destination,
      scheduled_start_at: new Date(form.scheduled_start_at).toISOString(),
      release_hours: form.release_hours ? Number(form.release_hours) : undefined,
    };
    const driver = drivers.find(d => d.driver_code === form.driver_code);
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

  const selectedDriver = drivers.find(d => d.driver_code === form.driver_code);
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
    { key: "is_active", label: "الحالة", render: (i) => YESNO(i.is_active) },
  ];
  const employeeFields: CrudField[] = [
    { key: "employee_code", label: "كود الموظف", required: true },
    { key: "name", label: "الاسم", required: true },
    { key: "job_title", label: "المسمى الوظيفي" },
    { key: "department_name", label: "الإدارة" },
    { key: "company_name", label: "الشركة", type: "select", options: companyNameOptions },
    { key: "housing_location", label: "السكن", type: "select", options: housingNameOptions },
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
          <label className="field"><span>موعد الانطلاق</span><input type="datetime-local" value={form.scheduled_start_at} onChange={e => setForm({ ...form, scheduled_start_at: e.target.value })} /></label>
          <label className="field"><span>وقت الإتاحة قبل الانطلاق</span><select value={form.release_hours} onChange={e => setForm({ ...form, release_hours: e.target.value })}><option value="2">ساعتان</option><option value="4">4 ساعات</option><option value="8">8 ساعات</option><option value="0">فوراً</option></select></label>
        </div>
        <button className="primary-btn" onClick={createTrip} disabled={loading || !form.scheduled_start_at || !form.driver_code || !form.bus_number || !form.route_name}><Plus size={18} />{loading ? "جارٍ الحفظ..." : "تخطيط الرحلة"}</button>
        </>)}
      </div>

      <div className="admin-tabs">
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
      </div>

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
                  <tr><th>الرحلة</th><th>السائق</th><th>الباص</th><th>الخط</th><th>الموعد</th><th>الحالة</th></tr>
                </thead>
                <tbody>
                  {plans.map(p => (
                    <tr key={p.id}>
                      <td><strong>{p.trip_number}</strong></td>
                      <td>{(p as any).local ? (drivers.find(d => d.driver_code === p.driver_id)?.full_name || p.driver_id || "—") : (drivers.find(d => d.id === p.driver_id)?.full_name || "—")}</td>
                      <td>{p.bus_number}</td>
                      <td>{p.route_name}<small>{p.origin} → {p.destination}</small></td>
                      <td>{new Date(p.scheduled_start_at).toLocaleString("ar-EG")}</td>
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
                  <span>رفع ملف CSV أو Excel. الأعمدة: كود الموظف، الاسم، الوظيفة، الإدارة، الشركة، السكن.</span>
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
            const { trip, employees } = reportTripOf(viewReport);
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
                    <h3 className="report-list-title">الصاعدون ({employees.length})</h3>
                    <div className="table-scroll" style={{ maxHeight: 260 }}>
                      <table>
                        <thead>
                          <tr><th>#</th><th>الكود</th><th>الاسم</th><th>الإدارة</th><th>الشركة</th><th>السكن</th><th>الحالة</th></tr>
                        </thead>
                        <tbody>
                          {employees.map((p, i) => (
                            <tr key={`${p.employee_code}-${i}`}>
                              <td>{i + 1}</td>
                              <td>{p.employee_code || "—"}</td>
                              <td><strong>{p.name || "—"}</strong></td>
                              <td>{p.department || "—"}</td>
                              <td>{p.company || "—"}</td>
                              <td>{p.housing_location || "—"}</td>
                              <td>{reportEmployeeStatus(p)}</td>
                            </tr>
                          ))}
                          {!employees.length && (
                            <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--muted)", padding: 16 }}>لم تُسجَّل قائمة صاعدين مع هذا التقرير.</td></tr>
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
    </AppShell>
  );
}