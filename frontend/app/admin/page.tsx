"use client";
import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { createAdminPlan, getAdminDrivers, getAdminEmployees, getAdminPlanned, getNewEmployees, importEmployeesFile, reviewNewEmployee, type PlannedTrip, type User } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import { BusFront, RefreshCw, Plus, Upload, UserCheck } from "lucide-react";

export default function AdminPage() {
  const [drivers, setDrivers] = useState<User[]>([]);
  const [plans, setPlans] = useState<PlannedTrip[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [newEmployees, setNewEmployees] = useState<any[]>([]);
  const [tab, setTab] = useState("plans");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<any>({ driver_code: "", bus_number: "124", route_name: "الحوك - الشركة", origin: "الحوك", destination: "الشركة", scheduled_start_at: "", release_hours: "8" });

  async function load(showDrivers = false) {
    try {
      const results: any[] = [];
      if (showDrivers) results.push(getAdminDrivers());
      results.push(getAdminPlanned(), getAdminEmployees(), getNewEmployees());
      const [d, p, e, n] = await Promise.all(results);
      if (d) setDrivers(d);
      setPlans(p);
      setEmployees(e);
      setNewEmployees(n);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "تعذر التحميل");
    }
  }
  useEffect(() => { initialize(); }, []);
  async function initialize() {
    setLoading(true);
    await load(true);
    setLoading(false);
  }
  async function createTrip() {
    if (!form.driver_code) { setMsg("اختر السائق أولاً"); return; }
    if (!form.scheduled_start_at) { setMsg("حدد موعد الانطلاق"); return; }
    setLoading(true);
    setMsg("");
    try {
      await createAdminPlan({
        driver_code: form.driver_code,
        bus_number: form.bus_number,
        route_name: form.route_name,
        origin: form.origin,
        destination: form.destination,
        scheduled_start_at: new Date(form.scheduled_start_at).toISOString(),
        release_hours: form.release_hours ? Number(form.release_hours) : undefined,
      });
      setMsg("تم تخطيط الرحلة للسائق بنجاح");
      setForm((f: any) => ({ ...f, scheduled_start_at: "" }));
      load(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذر إنشاء الرحلة");
    } finally {
      setLoading(false);
    }
  }
  async function uploadFile(file: File) {
    setLoading(true);
    setMsg("");
    try {
      const result = await importEmployeesFile(file);
      setMsg(`تم الاستيراد: ${result.created} جديد، ${result.updated} محدث${result.skipped?.length ? `، ${result.skipped.length} مرفوض` : ""}`);
      if (fileRef.current) fileRef.current.value = "";
      load(false);
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
      load(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذر حفظ المراجعة");
    }
  }
  return (
    <AppShell>
      <div className="page-head">
        <div>
          <div className="eyebrow">SUPERVISOR CONSOLE</div>
          <h1>إدارة النظام</h1>
          <p>تخطيط الرحلات للسائقين، إدارة الموظفين، ومراجعة طلبات الموظفين الجدد.</p>
        </div>
        <button className="secondary-btn" onClick={initialize} disabled={loading}><RefreshCw size={17}/>تحديث</button>
      </div>
      {msg && <div className="alert success">{msg}</div>}
      <div className="form-panel">
        <div className="panel-title">
          <div>
            <BusFront size={22}/>
            <div>
              <h2>تخطيط رحلة للسائق</h2>
              <span>السائق سيضيف الموظفين الصاعدين من صفحة الرحلة المخصصة له.</span>
            </div>
          </div>
        </div>
        <div className="form-grid">
          <label className="field"><span>السائق</span><select value={form.driver_code} onChange={e => setForm({ ...form, driver_code: e.target.value })}><option value="">— اختر السائق —</option>{drivers.map(d => <option key={d.id} value={d.driver_code ?? ""}>{d.full_name} ({d.driver_code ?? ""})</option>)}</select></label>
          <label className="field"><span>رقم الباص</span><input value={form.bus_number} onChange={e => setForm({ ...form, bus_number: e.target.value })}/></label>
          <label className="field"><span>خط السير</span><input value={form.route_name} onChange={e => setForm({ ...form, route_name: e.target.value })}/></label>
          <label className="field"><span>مكان الانطلاق</span><input value={form.origin} onChange={e => setForm({ ...form, origin: e.target.value })}/></label>
          <label className="field"><span>مكان الوصول</span><input value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })}/></label>
          <label className="field"><span>موعد الانطلاق</span><input type="datetime-local" value={form.scheduled_start_at} onChange={e => setForm({ ...form, scheduled_start_at: e.target.value })}/></label>
          <label className="field"><span>وقت الإتاحة قبل الانطلاق</span><select value={form.release_hours} onChange={e => setForm({ ...form, release_hours: e.target.value })}><option value="2">ساعتان</option><option value="4">4 ساعات</option><option value="8">8 ساعات</option><option value="0">فوراً</option></select></label>
        </div>
        <button className="primary-btn" onClick={createTrip} disabled={loading || !form.scheduled_start_at}><Plus size={18}/>{loading ? "جارٍ الحفظ..." : "تخطيط الرحلة"}</button>
      </div>
      <div className="admin-tabs">
        <button className={tab === "plans" ? "active" : ""} onClick={() => setTab("plans")}>الرحلات المخططة ({plans.length})</button>
        <button className={tab === "employees" ? "active" : ""} onClick={() => setTab("employees")}>الموظفون ({employees.length})</button>
        <button className={tab === "new" ? "active" : ""} onClick={() => setTab("new")}>طلبات الموظفين الجدد ({newEmployees.length})</button>
      </div>
      {tab === "plans" ? (
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
                    <td>{drivers.find(d => d.id === p.driver_id)?.full_name || "—"}</td>
                    <td>{p.bus_number}</td>
                    <td>{p.route_name}<small>{p.origin} → {p.destination}</small></td>
                    <td>{new Date(p.scheduled_start_at).toLocaleString("ar-EG")}</td>
                    <td><StatusBadge status={p.status}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === "employees" ? (
        <>
          <div className="form-panel">
            <div className="panel-title">
              <div>
                <Upload size={22}/>
                <div>
                  <h2>استيراد ملف الموظفين</h2>
                  <span>رفع ملف CSV أو Excel. الأعمدة: كود الموظف، الاسم، الوظيفة، الإدارة، الشركة، السكن.</span>
                </div>
              </div>
            </div>
            <div className="add-row">
              <input ref={fileRef} type="file" accept=".csv,.xlsx" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])}/>
            </div>
          </div>
          <div className="table-card">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>الكود</th><th>الاسم</th><th>الوظيفة</th><th>الإدارة</th><th>الشركة</th><th>السكن</th></tr>
                </thead>
                <tbody>
                  {employees.map(emp => (
                    <tr key={emp.id}>
                      <td><strong>{emp.employee_code}</strong></td>
                      <td>{emp.name}</td>
                      <td>{emp.job_title || "—"}</td>
                      <td>{emp.department_name || "—"}</td>
                      <td>{emp.company_name || "—"}</td>
                      <td>{emp.housing_location || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
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
                          <button className="secondary-btn" onClick={() => review(req.id, "approved")}><UserCheck size={16}/>اعتماد</button>
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
    </AppShell>
  );
}