import { Capacitor, CapacitorHttp } from "@capacitor/core";

export const TRIP_LOCATIONS = ["الحديدة", "الصليف", "الولي", "الزحيفي", "الضبره", "الشركة"] as const;
export type TripLocation = (typeof TRIP_LOCATIONS)[number];
export type TripType = "قادم" | "مغادر";
export const TRIP_TYPES: { value: TripType; label: string }[] = [
  { value: "مغادر", label: "مغادر (من الشركة)" },
  { value: "قادم", label: "قادم (إلى الشركة)" },
];

export type SnapshotEmployee = {
  id: number;
  employee_code: string;
  name: string;
  job_title?: string | null;
  department_name?: string | null;
  company_name?: string | null;
  housing_location?: string | null;
  is_active: boolean;
};
export type SnapshotBus = { id: number; number: string; plate_number?: string | null; capacity: number; company_code: string; is_active: boolean };
export type SnapshotDriver = { id: string; username: string; full_name: string; role: string; driver_code?: string | null; company_code: string };
export type SnapshotPlanned = {
  id: number; external_id?: string | null; trip_number: string; driver_id: string; driver_username?: string | null;
  company_code: string; bus_number?: string | null; route_name?: string | null; origin?: string | null; destination?: string | null;
  trip_date?: string | null; release_at?: string | null; scheduled_start_at: string; status: string;
};
export type Snapshot = {
  version: number; built_at: string; counts: Record<string, number>;
  employees: SnapshotEmployee[]; buses: SnapshotBus[]; drivers: SnapshotDriver[]; planned: SnapshotPlanned[];
  routes?: { id: number; name: string; origin?: string | null; destination?: string | null; company_code: string; is_active: boolean }[];
  config?: { power_automate_url?: string };
};

export type LocalPassenger = {
  client_uuid: string;
  employee_code: string;
  name: string;
  job_title?: string | null;
  department?: string | null;
  company?: string | null;
  housing_location?: string | null;
  visit_purpose: string;
  boarded_at: string;
  source: string;
  needs_review: boolean;
};
export type LocalTrip = {
  id: string;
  planned_trip_id?: number | null;
  trip_number: string;
  driver_username: string;
  company_code: string;
  status: "boarding" | "completed" | "synced";
  started_at: string;
  completed_at?: string | null;
  bus_number?: string | null;
  planned_bus_number?: string | null;
  route_name?: string | null;
  origin?: string | null;
  destination?: string | null;
  trip_type?: TripType | null;
  scheduled_start_at?: string | null;
  passengers: LocalPassenger[];
  synced_at?: string | null;
  last_error?: string | null;
};
export type OfflineUser = { id: string; username: string; full_name: string; role: string; driver_code?: string | null; company_code: string };
export type AppConfig = { power_automate_url: string; power_automate_key: string; server_url?: string; last_sync_at?: string | null };

const KEY_SESSION = "ds_session";
const KEY_PIN_PREFIX = "ds_pin_user_";
const KEY_SNAPSHOT = "ds_snapshot";
const KEY_TRIPS = "ds_trips";
const KEY_CONFIG = "ds_config";
const KEY_LIVE_PLANNED = "ds_planned_live";
const KEY_LIVE_EMPLOYEES = "ds_employees_live";
const KEY_ADMIN_PLANS = "ds_admin_plans";

function pinKey(username: string): string {
  return KEY_PIN_PREFIX + encodeURIComponent(username);
}

export function isNativePlatform(): boolean {
  return typeof Capacitor !== "undefined" && !!Capacitor.isNativePlatform && Capacitor.isNativePlatform();
}

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export function isOnline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine;
}

export function normalizeBaseUrl(url: string): string {
  const trimmed = (url || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function isLocalHostUrl(url: string): boolean {
  return /(^|\.)localhost$|127\.0\.0\.1|::1/.test(url.split("://").pop() || "");
}

export function backendBaseUrl(): string {
  const cfg = getConfig();
  const raw = (cfg.server_url || "").trim();
  if (raw) return normalizeBaseUrl(raw);
  const configured = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/+$/, "");
  if (configured && !isLocalHostUrl(configured)) return configured;
  if (isNativePlatform()) return "";
  return typeof window !== "undefined" ? window.location.origin : "";
}

export async function nativeRequest(input: string, init: { method?: string; headers?: Record<string, string>; body?: unknown; timeoutMs?: number } = {}): Promise<{ status: number; ok: boolean; data: any }> {
  const headers = { "Content-Type": "application/json", ...(init.headers || {}) };
  const body = init.body !== undefined ? (typeof init.body === "string" ? init.body : JSON.stringify(init.body)) : undefined;
  const timeout = init.timeoutMs ?? 90000;
  if (isNativePlatform()) {
    const method = (init.method || "GET").toUpperCase();
    if (method === "GET") {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeout);
      try {
        const res = await CapacitorHttp.get({ url: input, headers, connectTimeout: timeout, readTimeout: timeout });
        return parseNativeResponse(res);
      } finally {
        clearTimeout(timer);
      }
    }
    if (method === "DELETE") {
      const res = await CapacitorHttp.request({ url: input, method, headers, connectTimeout: timeout, readTimeout: timeout });
      return parseNativeResponse(res);
    }
    const res = await CapacitorHttp.post({ url: input, headers, data: body, connectTimeout: timeout, readTimeout: timeout });
    return parseNativeResponse(res);
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(input, { method: init.method || "GET", headers, body, signal: ctl.signal });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, ok: res.ok, data };
  } finally {
    clearTimeout(timer);
  }
}

function parseNativeResponse(res: { status?: number; data?: any }): { status: number; ok: boolean; data: any } {
  let parsed: any = res.data;
  if (typeof res.data === "string") {
    try {
      parsed = JSON.parse(res.data);
    } catch {
      parsed = res.data;
    }
  }
  const status = res.status ?? 0;
  return { status, ok: status >= 200 && status < 300, data: parsed };
}

/* ---------- snapshot ---------- */
let snapshotMem: Snapshot | null = null;

export async function loadSnapshot(): Promise<Snapshot> {
  const mem = getCachedSnapshot();
  if (mem) return mem;
  const res = await fetch("/data/snapshot.json", { cache: "force-cache" });
  const data = (await res.json()) as Snapshot;
  storeSnapshot(data);
  return data;
}
export function getCachedSnapshot(): Snapshot | null {
  if (snapshotMem) return snapshotMem;
  const cached = loadJSON<Snapshot | null>(KEY_SNAPSHOT, null);
  if (cached) {
    snapshotMem = cached;
    return cached;
  }
  return null;
}
export function storeSnapshot(data: Snapshot) {
  snapshotMem = data;
  saveJSON(KEY_SNAPSHOT, data);
}
export function snapshotMeta(): { built_at: string; counts: Record<string, number> } | null {
  const s = getCachedSnapshot();
  return s ? { built_at: s.built_at, counts: s.counts } : null;
}

export async function syncSnapshotFromServer(): Promise<{ ok: boolean; built_at?: string; counts?: Record<string, number>; error?: string }> {
  const base = backendBaseUrl();
  if (!base) return { ok: false, error: "لا يوجد رابط خادم مضبوط — اضبطه في الإعدادات ثم سجّل الدخول عبر الشبكة." };
  const token = typeof window !== "undefined" ? window.localStorage.getItem("access_token") : null;
  if (!token) return { ok: false, error: "لا توجد جلسة متصلة بالخادم — سجّل الدخول عبر الشبكة أولاً." };
  try {
    const res = await nativeRequest(`${base}/api/sync/snapshot`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok && res.data && Array.isArray(res.data.employees)) {
      const data = res.data as Snapshot;
      storeSnapshot(data);
      mergeSnapshotConfig(data);
      return { ok: true, built_at: data.built_at, counts: data.counts };
    }
    return { ok: false, error: res.status === 401 ? "انتهت الجلسة — سجّل الدخول عبر الشبكة مجدداً." : `استجابة الخادم غير صالحة (${res.status})` };
  } catch {
    return { ok: false, error: "تعذر الاتصال بالخادم لتنزيل بيانات التحديث." };
  }
}

export function searchEmployee(code: string): SnapshotEmployee | null {
  const c = code.trim();
  const live = liveEmployees().find((e) => e.employee_code === c);
  if (live) return live;
  const s = getCachedSnapshot();
  if (!s) return null;
  return s.employees.find((e) => e.employee_code === c) || null;
}

/* ---------- session ---------- */
export function loadLocalSession(): OfflineUser | null {
  return loadJSON<OfflineUser | null>(KEY_SESSION, null);
}
export function storeLocalSession(user: OfflineUser) {
  saveJSON(KEY_SESSION, user);
}
export function clearLocalSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY_SESSION);
}

async function sha256Hex(text: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(text + "::" + salt);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function setLocalPin(pin: string, username: string) {
  const salt = uuid().slice(0, 8);
  saveJSON(pinKey(username), { salt, hash: await sha256Hex(pin, salt) });
}
export async function verifyLocalPin(pin: string, username: string): Promise<boolean> {
  const rec = loadJSON<{ salt: string; hash: string } | null>(pinKey(username), null);
  if (!rec) return false;
  return (await sha256Hex(pin, rec.salt)) === rec.hash;
}
export function hasLocalPin(username: string): boolean {
  return !!loadJSON<{ salt: string; hash: string } | null>(pinKey(username), null);
}

export async function tryOnlineLogin(username: string, password: string): Promise<{ ok: true; user: OfflineUser } | { ok: false; code: "unauthorized" | "unreachable" }> {
  const base = backendBaseUrl();
  if (!base) return { ok: false, code: "unreachable" };
  try {
    const res = await nativeRequest(`${base}/api/auth/login`, { method: "POST", body: { username, password } });
    if (res.ok) {
      const user = res.data?.user as OfflineUser;
      if (user) {
        storeLocalSession(user);
        if (typeof window !== "undefined") {
          window.localStorage.setItem("access_token", res.data.access_token);
          window.localStorage.setItem("refresh_token", res.data.refresh_token);
          window.localStorage.setItem("user", JSON.stringify(user));
        }
      }
      return { ok: true, user };
    }
    return { ok: false, code: res.status === 401 ? "unauthorized" : "unreachable" };
  } catch {
    return { ok: false, code: "unreachable" };
  }
}

export function findDriver(username: string): SnapshotDriver | null {
  const s = getCachedSnapshot();
  if (!s) return null;
  return s.drivers.find((d) => d.username === username) || null;
}

/* ---------- config ---------- */
export function getConfig(): AppConfig {
  return loadJSON<AppConfig>(KEY_CONFIG, { power_automate_url: "", power_automate_key: "" });
}
export function saveConfig(config: AppConfig) {
  saveJSON(KEY_CONFIG, config);
}
function mergeSnapshotConfig(data: Snapshot): boolean {
  const url = (data.config && data.config.power_automate_url) || "";
  if (!url.trim()) return false;
  const cur = getConfig();
  if (cur.power_automate_url.trim()) return false;
  cur.power_automate_url = url.trim();
  saveConfig(cur);
  return true;
}

/* ---------- live refresh from backend (عند توفر الشبكة والجلسة) ---------- */
export async function refreshLiveData(user: OfflineUser): Promise<{ refreshed: boolean; planned: boolean; employees: boolean }> {
  const base = backendBaseUrl();
  if (!base || typeof window === "undefined") return { refreshed: false, planned: false, employees: false };
  const token = window.localStorage.getItem("access_token");
  if (!token) return { refreshed: false, planned: false, employees: false };
  let planned = false;
  let employees = false;
  try {
    const p = await nativeRequest(`${base}/api/driver/planned`, { headers: { Authorization: `Bearer ${token}` } });
    if (p.ok && Array.isArray(p.data)) {
      const mapped: SnapshotPlanned[] = p.data.map((x: any) => ({
        id: x.id, external_id: x.external_id, trip_number: x.trip_number, driver_id: x.driver_id,
        driver_username: user.username, company_code: x.company_code, bus_number: x.bus_number,
        route_name: x.route_name, origin: x.origin, destination: x.destination,
        trip_date: x.trip_date, release_at: x.release_at, scheduled_start_at: x.scheduled_start_at, status: x.status,
      }));
      saveJSON(KEY_LIVE_PLANNED, mapped);
      planned = true;
    }
  } catch {
    /* ignore */
  }
  try {
    const e = await nativeRequest(`${base}/api/driver/employees`, { headers: { Authorization: `Bearer ${token}` } });
    if (e.ok && Array.isArray(e.data)) {
      const mapped: SnapshotEmployee[] = e.data.map((x: any) => ({
        id: x.id, employee_code: x.employee_code, name: x.name, job_title: x.job_title,
        department_name: x.department_name, company_name: x.company_name, housing_location: x.housing_location, is_active: true,
      }));
      saveJSON(KEY_LIVE_EMPLOYEES, mapped);
      employees = true;
    }
  } catch {
    /* ignore */
  }
  return { refreshed: planned || employees, planned, employees };
}

function livePlanned(): SnapshotPlanned[] {
  return loadJSON<SnapshotPlanned[]>(KEY_LIVE_PLANNED, []);
}
function liveEmployees(): SnapshotEmployee[] {
  return loadJSON<SnapshotEmployee[]>(KEY_LIVE_EMPLOYEES, []);
}

/* ---------- local trips ---------- */
export type LocalAdminPlan = {
  client_id: string;
  driver_code: string;
  driver_name?: string;
  bus_number?: string;
  route_name?: string;
  origin?: string;
  destination?: string;
  scheduled_start_at: string;
  release_hours?: number;
  created_at: string;
};

export function queueAdminPlan(plan: Omit<LocalAdminPlan, "client_id" | "created_at">): LocalAdminPlan {
  const rec: LocalAdminPlan = { ...plan, client_id: "AP-" + uuid().slice(0, 8), created_at: new Date().toISOString() };
  const list = loadJSON<LocalAdminPlan[]>(KEY_ADMIN_PLANS, []);
  list.push(rec);
  saveJSON(KEY_ADMIN_PLANS, list);
  return rec;
}
export function getLocalAdminPlans(): LocalAdminPlan[] {
  return loadJSON<LocalAdminPlan[]>(KEY_ADMIN_PLANS, []);
}
export function removeLocalAdminPlan(clientId: string) {
  const list = loadJSON<LocalAdminPlan[]>(KEY_ADMIN_PLANS, []);
  saveJSON(KEY_ADMIN_PLANS, list.filter((p) => p.client_id !== clientId));
}

function tripsForDriver(driverUsername: string): LocalTrip[] {
  return loadJSON<LocalTrip[]>(KEY_TRIPS, []).filter((t) => t.driver_username === driverUsername);
}
function persistTrips(list: LocalTrip[]) {
  saveJSON(KEY_TRIPS, list);
}

export function getPlannedForDriver(driverUsername: string, driverCode?: string | null): SnapshotPlanned[] {
  const s = getCachedSnapshot();
  const snapshotPlanned = s ? s.planned.filter((p) => p.driver_username === driverUsername || p.driver_username == null) : [];
  const map = new Map<number, SnapshotPlanned>();
  for (const p of livePlanned()) map.set(p.id, p);
  for (const p of snapshotPlanned) if (!map.has(p.id)) map.set(p.id, p);
  if (driverCode) {
    getLocalAdminPlans()
      .filter((p) => p.driver_code === driverCode)
      .forEach((p, i) => {
        map.set(900000 + i, {
          id: 900000 + i,
          trip_number: p.client_id,
          driver_id: p.driver_code,
          driver_username: driverUsername,
          company_code: "YCSR",
          bus_number: p.bus_number || null,
          route_name: p.route_name || null,
          origin: p.origin || null,
          destination: p.destination || null,
          scheduled_start_at: p.scheduled_start_at,
          status: "planned",
          local: true,
        } as SnapshotPlanned);
      });
  }
  const startedNumbers = new Set(tripsForDriver(driverUsername).map((t) => t.trip_number));
  const hiddenStatus = new Set(["started", "cancelled", "completed"]);
  return Array.from(map.values())
    .filter((p) => !startedNumbers.has(p.trip_number))
    .filter((p) => !hiddenStatus.has(p.status))
    .sort((a, b) => (a.scheduled_start_at || "").localeCompare(b.scheduled_start_at || ""));
}

export function startLocalTrip(planned: SnapshotPlanned, driverUsername: string, actualBus?: string): LocalTrip {
  const list = loadJSON<LocalTrip[]>(KEY_TRIPS, []);
  const trip: LocalTrip = {
    id: "LT-" + uuid().slice(0, 8),
    planned_trip_id: planned.id,
    trip_number: planned.trip_number,
    driver_username: driverUsername,
    company_code: planned.company_code,
    status: "boarding",
    started_at: new Date().toISOString(),
    bus_number: actualBus?.trim() || planned.bus_number,
    planned_bus_number: planned.bus_number,
    route_name: planned.route_name,
    origin: planned.origin,
    destination: planned.destination,
    scheduled_start_at: planned.scheduled_start_at,
    passengers: [],
  };
  list.push(trip);
  persistTrips(list);
  return trip;
}

export function getAvailableBuses(): SnapshotBus[] {
  const s = getCachedSnapshot();
  if (!s) return [];
  return s.buses.filter((b) => b.is_active);
}

export function createManualTrip(input: {
  driverUsername: string;
  companyCode: string;
  routeLine: string;
  busNumber: string;
  tripType: TripType;
}): LocalTrip {
  const list = loadJSON<LocalTrip[]>(KEY_TRIPS, []);
  const parts = (input.routeLine || "").split("→");
  const origin = (parts[0] || input.routeLine || "").trim();
  const destination = (parts[1] || "").trim() || null;
  const trip: LocalTrip = {
    id: "LT-" + uuid().slice(0, 8),
    planned_trip_id: null,
    trip_number: "MAN-" + Date.now().toString(36).toUpperCase(),
    driver_username: input.driverUsername,
    company_code: input.companyCode,
    status: "boarding",
    started_at: new Date().toISOString(),
    bus_number: input.busNumber,
    planned_bus_number: input.busNumber,
    route_name: input.routeLine || null,
    origin,
    destination,
    trip_type: input.tripType,
    passengers: [],
  };
  list.push(trip);
  persistTrips(list);
  return trip;
}

export function getLocalTrip(id: string, driverUsername: string): LocalTrip | null {
  return loadJSON<LocalTrip[]>(KEY_TRIPS, []).find((t) => t.id === id && t.driver_username === driverUsername) || null;
}

export function getActiveLocalTrip(driverUsername: string): LocalTrip | null {
  return loadJSON<LocalTrip[]>(KEY_TRIPS, []).find((t) => t.driver_username === driverUsername && t.status === "boarding") || null;
}

export function addPassengerToTrip(tripId: string, driverUsername: string, employee: SnapshotEmployee, visitPurpose = "employee"): LocalTrip | null {
  const list = loadJSON<LocalTrip[]>(KEY_TRIPS, []);
  const trip = list.find((t) => t.id === tripId && t.driver_username === driverUsername);
  if (!trip || trip.status !== "boarding") return null;
  if (trip.passengers.some((p) => p.employee_code === employee.employee_code)) return trip;
  trip.passengers.push({
    client_uuid: uuid(),
    employee_code: employee.employee_code,
    name: employee.name,
    job_title: employee.job_title,
    department: employee.department_name,
    company: employee.company_name,
    housing_location: employee.housing_location,
    visit_purpose: visitPurpose,
    boarded_at: new Date().toISOString(),
    source: "employee_master",
    needs_review: false,
  });
  persistTrips(list);
  return trip;
}

export function addNewPassengerToTrip(tripId: string, driverUsername: string, form: { employee_code?: string; name: string; job_title?: string; department?: string; company?: string; visit_purpose?: string }): LocalTrip | null {
  const list = loadJSON<LocalTrip[]>(KEY_TRIPS, []);
  const trip = list.find((t) => t.id === tripId && t.driver_username === driverUsername);
  if (!trip || trip.status !== "boarding") return null;
  trip.passengers.push({
    client_uuid: uuid(),
    employee_code: form.employee_code?.trim() || "",
    name: form.name,
    job_title: form.job_title?.trim() || null,
    department: form.department?.trim() || null,
    company: form.company?.trim() || null,
    housing_location: null,
    visit_purpose: form.visit_purpose || "employee",
    boarded_at: new Date().toISOString(),
    source: "new_employee",
    needs_review: true,
  });
  persistTrips(list);
  return trip;
}

export function addPassengerByCode(tripId: string, driverUsername: string, code: string): { trip: LocalTrip | null; matched: boolean; duplicated: boolean } {
  const c = code.trim();
  const list = loadJSON<LocalTrip[]>(KEY_TRIPS, []);
  const trip = list.find((t) => t.id === tripId && t.driver_username === driverUsername);
  if (!trip || trip.status !== "boarding" || !c) return { trip: null, matched: false, duplicated: false };
  if (trip.passengers.some((p) => p.employee_code === c)) return { trip, matched: false, duplicated: true };
  const emp = searchEmployee(c);
  if (emp) {
    trip.passengers.push({
      client_uuid: uuid(),
      employee_code: emp.employee_code,
      name: emp.name,
      job_title: emp.job_title,
      department: emp.department_name,
      company: emp.company_name,
      housing_location: emp.housing_location,
      visit_purpose: "employee",
      boarded_at: new Date().toISOString(),
      source: "employee_master",
      needs_review: false,
    });
  } else {
    trip.passengers.push({
      client_uuid: uuid(),
      employee_code: c,
      name: "",
      job_title: null,
      department: null,
      company: null,
      housing_location: null,
      visit_purpose: "unknown",
      boarded_at: new Date().toISOString(),
      source: "code_only",
      needs_review: true,
    });
  }
  persistTrips(list);
  return { trip, matched: !!emp, duplicated: false };
}

export function addNonEmployeePassenger(tripId: string, driverUsername: string, data: { name: string; entity: string; purpose: string }): LocalTrip | null {
  const list = loadJSON<LocalTrip[]>(KEY_TRIPS, []);
  const trip = list.find((t) => t.id === tripId && t.driver_username === driverUsername);
  if (!trip || trip.status !== "boarding") return null;
  trip.passengers.push({
    client_uuid: uuid(),
    employee_code: "",
    name: data.name.trim(),
    job_title: null,
    department: null,
    company: data.entity.trim() || null,
    housing_location: null,
    visit_purpose: data.purpose || "other",
    boarded_at: new Date().toISOString(),
    source: "non_employee",
    needs_review: true,
  });
  persistTrips(list);
  return trip;
}

export function completeLocalTrip(tripId: string, driverUsername: string): LocalTrip | null {
  const list = loadJSON<LocalTrip[]>(KEY_TRIPS, []);
  const trip = list.find((t) => t.id === tripId && t.driver_username === driverUsername);
  if (!trip || trip.status !== "boarding") return null;
  trip.status = "completed";
  trip.completed_at = new Date().toISOString();
  persistTrips(list);
  return trip;
}

export function listLocalTrips(driverUsername: string): LocalTrip[] {
  return tripsForDriver(driverUsername).sort((a, b) => (b.started_at || "").localeCompare(a.started_at || ""));
}

export function localStats(driverUsername: string) {
  const trips = tripsForDriver(driverUsername);
  return {
    today_total: trips.length,
    completed: trips.filter((t) => t.status === "completed").length,
    synced: trips.filter((t) => t.status === "synced").length,
    active_count: trips.find((t) => t.status === "boarding")?.passengers.length ?? 0,
  };
}

/* ---------- sync to Power Automate ---------- */
export function buildTripPayload(trip: LocalTrip): Record<string, unknown> {
  return {
    event_type: "trip.completed",
    trip: {
      trip_id: trip.trip_number,
      internal_id: trip.planned_trip_id ?? null,
      company_code: trip.company_code,
      driver_id: trip.driver_username,
      bus_number: trip.bus_number || trip.planned_bus_number,
      route: trip.route_name,
      origin: trip.origin,
      destination: trip.destination,
      trip_type: trip.trip_type ?? null,
      scheduled_start_at: trip.scheduled_start_at ?? null,
      started_at: trip.started_at ?? null,
      completed_at: trip.completed_at ?? null,
      employee_count: trip.passengers.length,
      employees: trip.passengers.map((p) => ({
        employee_code: p.employee_code,
        name: p.name,
        job: p.job_title,
        department: p.department,
        company: p.company,
        housing_location: p.housing_location,
        visit_purpose: p.visit_purpose,
        boarded_at: p.boarded_at,
        source: p.source,
        needs_review: p.needs_review,
        is_employee: p.source !== "non_employee",
      })),
    },
  };
}

export async function reportTripToBackend(trip: LocalTrip): Promise<{ ok: boolean; error?: string }> {
  const base = backendBaseUrl();
  const token = typeof window !== "undefined" ? window.localStorage.getItem("access_token") : null;
  if (!base || !token) return { ok: false, error: "لا يوجد خادم أو جلسة متصلة" };
  try {
    const res = await nativeRequest(`${base}/api/driver/trips/report`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: buildTripPayload(trip),
      timeoutMs: 10000,
    });
    return res.ok ? { ok: true } : { ok: false, error: `الخادم رفض التقرير (${res.status})` };
  } catch {
    return { ok: false, error: "لا يوجد اتصال بالخادم" };
  }
}

export async function syncNow(driverUsername: string): Promise<{ pending: number; pushed: number; failed: number; lastError?: string }> {
  const config = getConfig();
  const url = config.power_automate_url.trim();
  const base = backendBaseUrl();
  const token = typeof window !== "undefined" ? window.localStorage.getItem("access_token") : null;
  const hasBackend = !!base && !!token;
  if (!url && !hasBackend) {
    return {
      pending: listLocalTrips(driverUsername).filter((t) => t.status === "completed" && !t.synced_at).length,
      pushed: 0,
      failed: 0,
      lastError: "لم يُضبط رابط إرسال ولا يوجد اتصال بالخادم — عيّن الرابط في الإعدادات أو سجّل الدخول عبر الشبكة ثم أعد الإرسال",
    };
  }
  const list = loadJSON<LocalTrip[]>(KEY_TRIPS, []).filter((t) => t.driver_username === driverUsername && t.status === "completed" && !t.synced_at);
  let pushed = 0;
  let failed = 0;
  let lastError: string | undefined;
  for (const trip of list) {
    const errors: string[] = [];
    let delivered = false;
    if (url) {
      try {
        const headers: Record<string, string> = { "X-Request-ID": uuid() };
        if (config.power_automate_key.trim()) headers["x-pa-key"] = config.power_automate_key.trim();
        const res = await nativeRequest(url, { method: "POST", headers, body: buildTripPayload(trip) });
        if (res.ok) delivered = true;
        else errors.push(`نظام الإشعارات: HTTP ${res.status}`);
      } catch {
        errors.push("نظام الإشعارات: لا يوجد اتصال");
      }
    }
    if (hasBackend) {
      const r = await reportTripToBackend(trip);
      if (r.ok) delivered = true;
      else if (r.error) errors.push(r.error);
    }
    const stored = loadJSON<LocalTrip[]>(KEY_TRIPS, []);
    const target = stored.find((t) => t.id === trip.id);
    if (delivered && target) {
      target.status = "synced";
      target.synced_at = new Date().toISOString();
      target.last_error = null;
      persistTrips(stored);
      pushed += 1;
    } else if (target) {
      target.last_error = errors.length ? errors.join(" و") : "تعذر الإرسال";
      persistTrips(stored);
      failed += 1;
      lastError = target.last_error;
    } else {
      failed += 1;
      lastError = errors.length ? errors.join(" و") : "تعذر الإرسال";
    }
  }
  const pending = listLocalTrips(driverUsername).filter((t) => t.status === "completed" && !t.synced_at).length;
  const configRec = getConfig();
  configRec.last_sync_at = new Date().toISOString();
  saveConfig(configRec);
  return { pending, pushed, failed, lastError };
}

export function pendingSyncCount(driverUsername: string): number {
  return tripsForDriver(driverUsername).filter((t) => t.status === "completed" && !t.synced_at).length;
}