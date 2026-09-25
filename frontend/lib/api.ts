import { normalizeBaseUrl, isLocalHostUrl } from "./offlineStore";

export type User = { id: string; username: string; full_name: string; role: string; driver_code?: string | null; company_code: string; must_change_password?: boolean };
export type Passenger = { id: number; employee_code: string; name_snapshot: string; job_title_snapshot?: string | null; department_snapshot?: string | null; company_snapshot?: string | null; housing_location_snapshot?: string | null; visit_purpose: string; boarded_at: string; source: string; needs_review: boolean };
export type Trip = { id: number; trip_number: string; driver_id: string; company_code: string; status: string; started_at?: string | null; completed_at?: string | null; transferred_at?: string | null; employee_count: number; planned_bus_number?: string | null; actual_bus_number?: string | null; route_name?: string | null; origin?: string | null; destination?: string | null; scheduled_start_at?: string | null; release_at?: string | null; passengers?: Passenger[] };
export type PlannedTrip = { id: number; external_id?: string | null; trip_number: string; driver_id: string; company_code: string; trip_date: string; release_at?: string | null; scheduled_start_at: string; status: string; bus_number?: string | null; route_name?: string | null; origin?: string | null; destination?: string | null };

function getToken() { return typeof window !== "undefined" ? localStorage.getItem("access_token") : null; }
export function getStoredUser(): User | null { if (typeof window === "undefined") return null; const raw = localStorage.getItem("user"); return raw ? JSON.parse(raw) : null; }

let signedOut = false;
export function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    try {
      const cfg = JSON.parse(localStorage.getItem("ds_config") || "{}");
      const override = normalizeBaseUrl((cfg.server_url || "").trim());
      if (override) return override;
    } catch { /* ignore */ }
  }
  return API_URL.render();
}
export const API_URL = (() => {
  if (typeof window === "undefined") return { render: () => process.env.NEXT_PUBLIC_API_URL || "" };
  let configured = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/+$/, "");
  if (configured && !isLocalHostUrl(configured)) {
    return { render: () => configured };
  }
  if (configured) {
    const host = window.location.hostname;
    if (host && host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
      const port = new URL(configured).port || "8001";
      return { render: () => `http://${host}:${port}` };
    }
  }
  return { render: () => window.location.origin };
})();

function saveSession(data: { access_token: string; refresh_token: string; user: User }) {
  if (signedOut) return;
  localStorage.setItem("access_token", data.access_token);
  localStorage.setItem("refresh_token", data.refresh_token);
  localStorage.setItem("user", JSON.stringify(data.user));
}
export function logout() {
  signedOut = true;
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user");
}
export function markSignedIn() { signedOut = false; }

async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  if (typeof AbortController === "undefined") return fetch(input, init);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 30000);
  try {
    return await fetch(input, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const base = getBaseUrl();
  const res = await fetchWithTimeout(`${base}${path}`, { ...options, headers, cache: "no-store" });
  if (res.status === 401 && path !== "/api/auth/login") {
    const refresh = typeof window !== "undefined" ? localStorage.getItem("refresh_token") : null;
    if (refresh && !signedOut) {
      const refreshRes = await fetchWithTimeout(`${base}/api/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: refresh }) });
      if (refreshRes.ok) {
        const refreshed = await refreshRes.json();
        if (!signedOut) saveSession(refreshed);
        if (!signedOut) headers.set("Authorization", `Bearer ${refreshed.access_token}`);
        const retry = await fetchWithTimeout(`${base}${path}`, { ...options, headers, cache: "no-store" });
        if (retry.ok && retry.status !== 401) return retry.json();
      }
    }
    logout();
    if (typeof window !== "undefined") window.location.href = "/";
  }
  if (res.status === 403 && res.headers.get("x-must-change-password") === "true") {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/change-password")) {
      window.location.href = "/change-password";
    }
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || "حدث خطأ في الطلب");
  return body;
}

export async function apiLogin(username: string, password: string) {
  const res = await request<{ access_token: string; refresh_token: string; user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
  markSignedIn();
  saveSession(res);
  return res;
}
export function changePassword(current_password: string, new_password: string) {
  return request<User>("/api/auth/change-password", { method: "POST", body: JSON.stringify({ current_password, new_password }) });
}
export function getDashboard() { return request<{ upcoming: PlannedTrip[]; active_trip: Trip | null; stats: Record<string, number> }>("/api/driver/dashboard"); }
export function getPlannedTrips() { return request<PlannedTrip[]>("/api/driver/planned"); }
export function getMyTrips() { return request<Trip[]>("/api/driver/trips"); }
export function getTrip(id: string) { return request<Trip>(`/api/driver/trips/${id}`); }
export function startTrip(id: number, bus?: string) { return request<Trip>(`/api/driver/planned/${id}/start${bus ? `?actual_bus_number=${encodeURIComponent(bus)}` : ""}`, { method: "POST" }); }
export function searchEmployee(code: string) { return request<any>(`/api/driver/employees/search?code=${encodeURIComponent(code)}`); }
export function addEmployee(tripId: number, employee_code: string, visit_purpose = "employee") { return request<Passenger>(`/api/driver/trips/${tripId}/employees`, { method: "POST", body: JSON.stringify({ employee_code, visit_purpose }) }); }
export function addNewEmployee(tripId: number, payload: any) { return request<Passenger>(`/api/driver/trips/${tripId}/new-employees`, { method: "POST", body: JSON.stringify(payload) }); }
export function completeTrip(id: number | string) { return request<Trip>(`/api/driver/trips/${id}/complete`, { method: "POST" }); }
export function transferTrip(id: number | string) { return request<any>(`/api/driver/trips/${id}/transfer`, { method: "POST" }); }
export function getNotifications() { return request<any[]>("/api/driver/notifications"); }
export function getAdminDrivers() { return request<User[]>("/api/admin/drivers"); }
export function addDriver(payload: any) { return request<User>("/api/admin/drivers", { method: "POST", body: JSON.stringify(payload) }); }
export function getAdminBuses() { return request<any[]>("/api/admin/buses"); }
export function getAdminPlanned() { return request<PlannedTrip[]>("/api/admin/planned-trips"); }
export function createAdminPlan(payload: any) { return request<PlannedTrip>("/api/admin/planned-trips", { method: "POST", body: JSON.stringify(payload) }); }
export function getAdminEmployees(search?: string) { return request<any[]>(`/api/admin/employees${search ? `?search=${encodeURIComponent(search)}` : ""}`); }
export async function importEmployeesFile(file: File) {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${getBaseUrl()}/api/admin/employees/import`, { method: "POST", headers, body: form, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || "تعذر استيراد الملف");
  return body;
}
export function getNewEmployees() { return request<any[]>("/api/admin/new-employees"); }
export function getAdminTripReports() { return request<any[]>("/api/admin/trip-reports"); }
export function reviewNewEmployee(id: number, status: "approved" | "rejected") { return request<any>(`/api/admin/new-employees/${id}/review`, { method: "POST", body: JSON.stringify({ status }) }); }

export function updateDriver(id: string, payload: any) { return request<any>(`/api/admin/drivers/${id}`, { method: "PUT", body: JSON.stringify(payload) }); }
export function deleteDriver(id: string) { return request<any>(`/api/admin/drivers/${id}`, { method: "DELETE" }); }
export function addEmployeeMaster(payload: any) { return request<any>("/api/admin/employees", { method: "POST", body: JSON.stringify(payload) }); }
export function updateEmployeeMaster(id: number | string, payload: any) { return request<any>(`/api/admin/employees/${id}`, { method: "PUT", body: JSON.stringify(payload) }); }
export function deleteEmployeeMaster(id: number | string) { return request<any>(`/api/admin/employees/${id}`, { method: "DELETE" }); }
export function addBus(payload: any) { return request<any>("/api/admin/buses", { method: "POST", body: JSON.stringify(payload) }); }
export function updateBus(id: number | string, payload: any) { return request<any>(`/api/admin/buses/${id}`, { method: "PUT", body: JSON.stringify(payload) }); }
export function deleteBus(id: number | string) { return request<any>(`/api/admin/buses/${id}`, { method: "DELETE" }); }
export function getRoutes() { return request<any[]>("/api/admin/routes"); }
export function addRoute(payload: any) { return request<any>("/api/admin/routes", { method: "POST", body: JSON.stringify(payload) }); }
export function updateRoute(id: number | string, payload: any) { return request<any>(`/api/admin/routes/${id}`, { method: "PUT", body: JSON.stringify(payload) }); }
export function deleteRoute(id: number | string) { return request<any>(`/api/admin/routes/${id}`, { method: "DELETE" }); }
export function getCompanies() { return request<any[]>("/api/admin/companies"); }
export function addCompany(payload: any) { return request<any>("/api/admin/companies", { method: "POST", body: JSON.stringify(payload) }); }
export function updateCompany(id: number | string, payload: any) { return request<any>(`/api/admin/companies/${id}`, { method: "PUT", body: JSON.stringify(payload) }); }
export function deleteCompany(id: number | string) { return request<any>(`/api/admin/companies/${id}`, { method: "DELETE" }); }
export function getDepartments() { return request<any[]>("/api/admin/departments"); }
export function addDepartment(payload: any) { return request<any>("/api/admin/departments", { method: "POST", body: JSON.stringify(payload) }); }
export function updateDepartment(id: number | string, payload: any) { return request<any>(`/api/admin/departments/${id}`, { method: "PUT", body: JSON.stringify(payload) }); }
export function deleteDepartment(id: number | string) { return request<any>(`/api/admin/departments/${id}`, { method: "DELETE" }); }
export function getJobs() { return request<any[]>("/api/admin/jobs"); }
export function addJob(payload: any) { return request<any>("/api/admin/jobs", { method: "POST", body: JSON.stringify(payload) }); }
export function updateJob(id: number | string, payload: any) { return request<any>(`/api/admin/jobs/${id}`, { method: "PUT", body: JSON.stringify(payload) }); }
export function deleteJob(id: number | string) { return request<any>(`/api/admin/jobs/${id}`, { method: "DELETE" }); }
export function getHousing() { return request<any[]>("/api/admin/housing"); }
export function addHousing(payload: any) { return request<any>("/api/admin/housing", { method: "POST", body: JSON.stringify(payload) }); }
export function updateHousing(id: number | string, payload: any) { return request<any>(`/api/admin/housing/${id}`, { method: "PUT", body: JSON.stringify(payload) }); }
export function deleteHousing(id: number | string) { return request<any>(`/api/admin/housing/${id}`, { method: "DELETE" }); }
