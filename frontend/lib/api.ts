function resolveApiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
  if (typeof window !== "undefined" && configured.includes("localhost")) {
    const host = window.location.hostname;
    if (host && host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
      const port = new URL(configured).port || "8001";
      return `http://${host}:${port}`;
    }
  }
  return configured;
}

export const API_URL = resolveApiUrl();

export type User = { id: string; username: string; full_name: string; role: string; driver_code?: string | null; company_code: string };
export type Passenger = { id: number; employee_code: string; name_snapshot: string; job_title_snapshot?: string | null; department_snapshot?: string | null; company_snapshot?: string | null; housing_location_snapshot?: string | null; visit_purpose: string; boarded_at: string; source: string; needs_review: boolean };
export type Trip = { id: number; trip_number: string; driver_id: string; company_code: string; status: string; started_at?: string | null; completed_at?: string | null; transferred_at?: string | null; employee_count: number; planned_bus_number?: string | null; actual_bus_number?: string | null; route_name?: string | null; origin?: string | null; destination?: string | null; scheduled_start_at?: string | null; release_at?: string | null; passengers?: Passenger[] };
export type PlannedTrip = { id: number; external_id?: string | null; trip_number: string; driver_id: string; company_code: string; trip_date: string; release_at?: string | null; scheduled_start_at: string; status: string; bus_number?: string | null; route_name?: string | null; origin?: string | null; destination?: string | null };

function getToken() { return typeof window !== "undefined" ? localStorage.getItem("access_token") : null; }
export function getStoredUser(): User | null { if (typeof window === "undefined") return null; const raw = localStorage.getItem("user"); return raw ? JSON.parse(raw) : null; }
function saveSession(data: { access_token: string; refresh_token: string; user: User }) { localStorage.setItem("access_token", data.access_token); localStorage.setItem("refresh_token", data.refresh_token); localStorage.setItem("user", JSON.stringify(data.user)); }
export function logout() { localStorage.removeItem("access_token"); localStorage.removeItem("refresh_token"); localStorage.removeItem("user"); }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_URL}${path}`, { ...options, headers, cache: "no-store" });
  if (res.status === 401 && path !== "/api/auth/login") {
    const refresh = typeof window !== "undefined" ? localStorage.getItem("refresh_token") : null;
    if (refresh) {
      const refreshRes = await fetch(`${API_URL}/api/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: refresh }) });
      if (refreshRes.ok) {
        const refreshed = await refreshRes.json();
        saveSession(refreshed);
        headers.set("Authorization", `Bearer ${refreshed.access_token}`);
        const retry = await fetch(`${API_URL}${path}`, { ...options, headers, cache: "no-store" });
        if (retry.ok) return retry.json();
      }
    }
    logout();
    if (typeof window !== "undefined") window.location.href = "/";
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || "حدث خطأ في الطلب");
  return body;
}

export async function apiLogin(username: string, password: string) {
  const res = await request<{ access_token: string; refresh_token: string; user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
  saveSession(res);
  return res;
}
export function getDashboard() { return request<{ upcoming: PlannedTrip[]; active_trip: Trip | null; stats: Record<string, number> }>("/api/driver/dashboard"); }
export function getPlannedTrips() { return request<PlannedTrip[]>("/api/driver/planned"); }
export function getMyTrips() { return request<Trip[]>("/api/driver/trips"); }
export function getTrip(id: string) { return request<Trip>(`/api/driver/trips/${id}`); }
export function startTrip(id: number, bus?: string) { return request<Trip>(`/api/driver/planned/${id}/start${bus ? `?actual_bus_number=${encodeURIComponent(bus)}` : ""}`, { method: "POST" }); }
export function searchEmployee(code: string) { return request<any>(`/api/driver/employees/search?code=${encodeURIComponent(code)}`); }
export function addEmployee(tripId: number, employee_code: string, visit_purpose = "employee") { return request<Passenger>(`/api/driver/trips/${tripId}/employees`, { method: "POST", body: JSON.stringify({ employee_code, visit_purpose }) }); }
export function addNewEmployee(tripId: number, payload: any) { return request<Passenger>(`/api/driver/trips/${tripId}/new-employees`, { method: "POST", body: JSON.stringify(payload) }); }
export function completeTrip(id: number) { return request<Trip>(`/api/driver/trips/${id}/complete`, { method: "POST" }); }
export function transferTrip(id: number) { return request<any>(`/api/driver/trips/${id}/transfer`, { method: "POST" }); }
export function getNotifications() { return request<any[]>("/api/driver/notifications"); }
export function getAdminDrivers() { return request<User[]>("/api/admin/drivers"); }
export function getAdminPlanned() { return request<PlannedTrip[]>("/api/admin/planned-trips"); }
export function createAdminPlan(payload: any) { return request<PlannedTrip>("/api/admin/planned-trips", { method: "POST", body: JSON.stringify(payload) }); }
export function getAdminEmployees() { return request<any[]>("/api/admin/employees"); }
export async function importEmployeesFile(file: File) {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_URL}/api/admin/employees/import`, { method: "POST", headers, body: form, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || "تعذر استيراد الملف");
  return body;
}
export function getNewEmployees() { return request<any[]>("/api/admin/new-employees"); }
export function reviewNewEmployee(id: number, status: "approved" | "rejected") { return request<any>(`/api/admin/new-employees/${id}/review`, { method: "POST", body: JSON.stringify({ status }) }); }
