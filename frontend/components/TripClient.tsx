"use client";
import { useEffect, useState } from "react";
import { FileSpreadsheet, MessageCircle, Printer, Send, UserPlus, Users2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import StatusBadge from "@/components/StatusBadge";
import { addNonEmployeePassenger, addPassengerByCode, completeLocalTrip, getActiveLocalTrip, getConfig, getLocalTrip, isOnline, loadSnapshot, syncNow, type LocalPassenger, type LocalTrip } from "@/lib/offlineStore";
import { downloadContent, openWhatsApp, printTripPdf, tripToXlsText } from "@/lib/export";
import { useAuthGuard, currentUser } from "@/lib/authGuard";
import { routePath } from "@/lib/nav";

export default function TripClient({ id }: { id?: string | null }) {
  useAuthGuard(["driver"]);
  const [trip, setTrip] = useState<LocalTrip | null>(null);
  const [code, setCode] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", entity: "", purpose: "visitor" });
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const user = currentUser();
    if (!user) {
      setError("لا توجد جلسة على هذا الجهاز — سجّل الدخول أولاً.");
      return;
    }
    loadSnapshot().catch(() => {});
    let found: LocalTrip | null = null;
    if (id) {
      found = getLocalTrip(id, user.username);
    }
    if (!found) {
      found = getActiveLocalTrip(user.username);
    }
    if (found) {
      setTrip(found);
    } else {
      setError(id ? "الرحلة غير موجودة على هذا الجهاز" : "لا توجد رحلة نشطة — ابدأ رحلة من لوحة القيادة أو الرحلات المخططة");
    }
    setOnline(isOnline());
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function refresh(t: LocalTrip | null) {
    const user = currentUser();
    if (!user || !t) return;
    setTrip(getLocalTrip(t.id, user.username));
  }

  function addByCode() {
    const user = currentUser();
    if (!trip || !user) return;
    const c = code.trim();
    if (!c) return;
    setError("");
    const res = addPassengerByCode(trip.id, user.username, c);
    if (res.duplicated) setMsg("هذا الكود مُسجَّل مسبقاً في الرحلة");
    else if (res.trip) setMsg(res.matched ? "تمت إضافة الموظف بنجاح" : "سُجِّل الكود محلياً — لم يظهر في قاعدة البيانات على هذا الجهاز وسيُعرض للمراجعة");
    else setError("تعذر الإضافة — الرحلة غير نشطة");
    setCode("");
    refresh(res.trip);
  }

  function addNonEmp() {
    const user = currentUser();
    if (!trip || !user || !form.name.trim()) return;
    const t = addNonEmployeePassenger(trip.id, user.username, { name: form.name, entity: form.entity, purpose: form.purpose });
    setMsg("تم حفظ بيانات الراكب غير الموظف");
    setForm({ name: "", entity: "", purpose: "visitor" });
    setShowNew(false);
    refresh(t);
  }

  async function complete() {
    const user = currentUser();
    if (!trip || !user) return;
    setBusy(true);
    try {
      const t = completeLocalTrip(trip.id, user.username);
      setMsg("تم إكمال الرحلة محلياً. يمكنك الآن إرسالها إلى النظام عند توفر الاتصال.");
      refresh(t);
      if (isOnline()) {
        const r = await syncNow(user.username);
        if (r.pushed) setMsg(`تم إكمال الرحلة وإرسالها إلى النظام (${r.pushed})`);
        else if (r.lastError) setError(r.lastError);
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendNow() {
    const user = currentUser();
    if (!trip || !user) return;
    setBusy(true);
    setError("");
    try {
      const r = await syncNow(user.username);
      if (r.pushed) setMsg("تم إرسال الرحلة إلى النظام بنجاح");
      else setError(r.lastError || "لا توجد بيانات بانتظار الإرسال");
      refresh(getLocalTrip(trip.id, user.username));
    } finally {
      setBusy(false);
    }
  }

  function passengerTitle(p: LocalPassenger): string {
    if (p.source === "non_employee") return p.name || "راكب غير موظف";
    if (p.employee_code && !p.name) return `كود ${p.employee_code}`;
    return p.name || p.employee_code || "غير مسجل";
  }

  function passengerSubtitle(p: LocalPassenger): string {
    if (p.source === "non_employee") {
      const bits = [];
      if (p.company) bits.push(`الجهة: ${p.company}`);
      if (p.visit_purpose && p.visit_purpose !== "other") bits.push(`الغرض: ${p.visit_purpose}`);
      return bits.join(" · ") || "غير موظف — للمراجعة";
    }
    const bits = [];
    if (p.employee_code) bits.push(`كود ${p.employee_code}`);
    if (p.department) bits.push(p.department);
    if (!p.name && !p.department) bits.push("لم يُعثر عليه في قاعدة البيانات");
    return bits.join(" · ");
  }

  function passengerBadge(p: LocalPassenger): { label: string; cls: string } {
    if (p.source === "non_employee") return { label: "غير موظف", cls: "status-needs_review" };
    if (p.source === "code_only") return { label: "تحتاج تأكيد", cls: "status-needs_review" };
    return { label: "مؤكد", cls: "status-completed" };
  }

  if (!trip) {
    return (
      <AppShell>
        <div className="loader-page">
          {error ? error : "جارٍ تحميل الرحلة..."}
          {error && (
            <div className="empty-actions">
              <a className="primary-btn" href={routePath("/dashboard")}>العودة للوحة القيادة</a>
            </div>
          )}
        </div>
      </AppShell>
    );
  }
  const active = trip.status === "boarding";
  const synced = trip.status === "synced";
  const readyToSend = trip.status === "completed" && !synced;
  const hasDeliveryRoute = !!getConfig().power_automate_url.trim() || (typeof window !== "undefined" && !!window.localStorage.getItem("access_token"));
  const routeLabel = trip.origin && trip.destination ? `${trip.origin} → ${trip.destination}` : (trip.route_name || "—");
  return (
    <AppShell>
      <div className="page-head">
        <div>
          <div className="eyebrow">ACTIVE TRIP</div>
          <h1>{trip.trip_number}</h1>
          <p>{trip.route_name} — الباص {trip.bus_number || trip.planned_bus_number} — {new Date(trip.scheduled_start_at || trip.started_at).toLocaleDateString("ar-EG", { dateStyle: "medium" })}</p>
        </div>
        <StatusBadge status={trip.status} />
      </div>
      <div className={`online-pill ${online ? "" : "offline"}`} style={{ marginBottom: 12 }}>
        <span className="live-dot"></span>
        {online ? "متصل" : "بدون إنترنت — تُحفظ البيانات على الجهاز"}
      </div>
      {(error || msg) && <div className={`alert ${error ? "danger" : "success"}`}>{error || msg}</div>}
      <div className="trip-summary">
        <div><span>الخط</span><strong>{routeLabel}</strong></div>
        {trip.trip_type && <div><span>نوع الرحلة</span><strong>{trip.trip_type}</strong></div>}
        <div><span>الشركة</span><strong>{trip.company_name || trip.company_code || "—"}</strong></div>
        <div><span>التاريخ</span><strong>{new Date(trip.scheduled_start_at || trip.started_at).toLocaleDateString("ar-EG", { dateStyle: "medium" })}</strong></div>
        <div><span>عدد الصاعدين</span><strong>{trip.passengers.length}</strong></div>
        <div><span>وقت البدء</span><strong>{trip.started_at ? new Date(trip.started_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) : "—"}</strong></div>
      </div>
      {active && (
        <section className="section">
          <div className="section-title">
            <div>
              <h2>إضافة الموظفين الصاعدين</h2>
              <span>أدخل كود الموظف ثم اضغط «أضافة»</span>
            </div>
            <span className="count-pill"><Users2 size={16} />{trip.passengers.length}</span>
          </div>
          <div className="add-row">
            <div className="input-wrap big">
              <input value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === "Enter" && addByCode()} placeholder="كود الموظف (مثال: 80045)" inputMode="numeric" />
              <button className="primary-btn" onClick={addByCode} disabled={!code.trim()}>أضافة</button>
            </div>
          </div>
          {showNew && (
            <div className="new-card">
              <div className="new-card-head">
                <div>
                  <UserPlus size={22} />
                  <div><strong>راكب غير موظف</strong><span>تظهر بياناته للمشرف وتُحفظ على الجهاز.</span></div>
                </div>
                <button className="link-btn" onClick={() => setShowNew(false)}>إلغاء</button>
              </div>
              <div className="form-grid">
                <label className="field"><span>الاسم</span><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus /></label>
                <label className="field"><span>الجهة التي استدعته</span><input value={form.entity} onChange={e => setForm({ ...form, entity: e.target.value })} placeholder="مثال: شركة المقاولات..." /></label>
                <label className="field"><span>الغرض</span>
                  <select value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })}>
                    <option value="visitor">زائر</option>
                    <option value="contractor">مقاول</option>
                    <option value="meeting">اجتماع</option>
                    <option value="training">تدريب</option>
                    <option value="maintenance">صيانة</option>
                    <option value="delivery">تسليم/شحن</option>
                    <option value="other">أخرى</option>
                  </select>
                </label>
              </div>
              <button className="primary-btn" onClick={addNonEmp} disabled={!form.name.trim()}>حفظ البيانات</button>
            </div>
          )}
          <button
            className="secondary-btn full"
            style={{ marginTop: 12 }}
            onClick={() => setShowNew(v => !v)}
          >
            <UserPlus size={16} style={{ verticalAlign: "-3px" }} /> {showNew ? "إلغاء إضافة غير الموظف" : "إضافة راكب غير موظف"}
          </button>
        </section>
      )}
      {trip.passengers && (
        <section className="section">
          <div className="section-title">
            <div>
              <h2>الصاعدون في الرحلة</h2>
              <span>يُسجَّلون على هذا الجهاز وتصل بياناتهم للمشرف عند الإكمال.</span>
            </div>
          </div>
          <div className="passenger-list">
            {trip.passengers.map((p, i) => {
              const badge = passengerBadge(p);
              return (
                <div className="passenger" key={p.client_uuid}>
                  <div className="pass-num">{i + 1}</div>
                  <div className="pass-main">
                    <strong>{passengerTitle(p)}</strong>
                    <span>{passengerSubtitle(p)}</span>
                  </div>
                  <span className={`status ${badge.cls}`}>{badge.label}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {synced && <div className="alert success">تم إرسال هذه الرحلة إلى النظام بنجاح.</div>}
      {trip.status === "completed" && !synced && !hasDeliveryRoute && <div className="hint">لم يُضبط رابط إرسال ولا توجد جلسة خادم — عيّن رابط الإرسال في الإعدادات أو سجّل الدخول عبر الشبكة ثم أعد الإرسال من هذا الجهاز.</div>}
      {trip.passengers.length > 0 && (
        <section className="section">
          <div className="section-title">
            <div>
              <h2>مشاركة وتصدير الرحلة</h2>
              <span>أرسل بيانات الرحلة عبر واتساب، أو صدّرها ملف Excel أو ملف PDF.</span>
            </div>
          </div>
          <div className="share-btns">
            <button className="primary-btn" onClick={() => openWhatsApp(trip)}><MessageCircle size={16} style={{ verticalAlign: "-3px" }} /> واتساب</button>
            <button className="secondary-btn" onClick={() => { downloadContent(`${trip.trip_number}.xls`, tripToXlsText(trip), "application/vnd.ms-excel"); setMsg("تم تجهيز ملف Excel — افتحه من التنزيلات/الخطوة التالية."); }}><FileSpreadsheet size={16} style={{ verticalAlign: "-3px" }} /> Excel</button>
            <button className="secondary-btn" onClick={() => printTripPdf(trip)}><Printer size={16} style={{ verticalAlign: "-3px" }} /> PDF</button>
          </div>
        </section>
      )}
      <section className="section actions-section">
        <button className="secondary-btn" disabled={!active || busy} onClick={complete}>إكمال الرحلة</button>
        <button className="primary-btn" disabled={!readyToSend || busy} onClick={sendNow}><Send size={16} style={{ verticalAlign: "-3px" }} /> إرسال إلى النظام</button>
      </section>
    </AppShell>
  );
}