"use client";
import { useEffect, useState } from "react";
import { FileSpreadsheet, MessageCircle, Pencil, Printer, Trash2, UserPlus, Users2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import StatusBadge from "@/components/StatusBadge";
import { addNewPassengerToTrip, addNonEmployeePassenger, addPassengerByCode, completeLocalTrip, getActiveLocalTrip, getAvailableDepartments, getConfig, getLocalTrip, isOnline, loadSnapshot, removePassengerFromTrip, syncNow, updatePassengerInTrip, type LocalPassenger, type LocalTrip, type SnapshotDepartment } from "@/lib/offlineStore";
import { downloadContent, openWhatsApp, printTripPdf, tripToXlsText } from "@/lib/export";
import { useAuthGuard, currentUser } from "@/lib/authGuard";
import { routePath } from "@/lib/nav";

/** مصادر الركاب غير المسجّلين في كشف الموظفين (يُعرض لهم نموذج البيانات كاملاً). */
const NON_MASTER_SOURCES = new Set(["non_employee", "new_employee", "code_only"]);

export default function TripClient({ id }: { id?: string | null }) {
  useAuthGuard(["driver"]);
  const [trip, setTrip] = useState<LocalTrip | null>(null);
  const [code, setCode] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ employee_code: "", name: "", coming_from: "", summoned_department: "", purpose: "work" });
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [editing, setEditing] = useState<LocalPassenger | null>(null);
  const [editForm, setEditForm] = useState({ employee_code: "", name: "", coming_from: "", summoned_department: "", purpose: "employee" });
  const [editError, setEditError] = useState("");
  const [departments, setDepartments] = useState<SnapshotDepartment[]>([]);

  const resetForm = () => setForm({ employee_code: "", name: "", coming_from: "", summoned_department: "", purpose: "work" });
  // علامة الحقول الإجبارية
  const REQ = <b style={{ color: "var(--danger)", marginInlineStart: 3 }}>*</b>;

  useEffect(() => {
    const user = currentUser();
    if (!user) {
      setError("لا توجد جلسة على هذا الجهاز — سجّل الدخول أولاً.");
      return;
    }
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
    setDepartments(getAvailableDepartments(found?.company_code ?? null));
    loadSnapshot()
      .then(() => setDepartments(getAvailableDepartments(found?.company_code ?? null)))
      .catch(() => {});
    setOnline(isOnline());
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // إرسال تلقائي للرحلة المكتملة: فور الإكمال إن توفرت الشبكة، وعند عودتها لاحقاً
  // دون أي تدخل من السائق. يُعاد المحاولة دورياً وبعودة التطبيق للمقدمة.
  useEffect(() => {
    const user = currentUser();
    if (!user || !trip) return;
    if (trip.status !== "completed" || trip.synced_at) return;
    let cancelled = false;
    const attempt = async () => {
      if (cancelled || !isOnline()) return;
      const r = await syncNow(user.username);
      if (cancelled || !r.pushed) return;
      setError("");
      setMsg("تم إرسال الرحلة إلى النظام تلقائياً");
      refresh(getLocalTrip(trip.id, user.username));
    };
    attempt();
    const onOnline = () => { attempt(); };
    const onVisible = () => { if (document.visibilityState === "visible") attempt(); };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(attempt, 30000);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, trip?.status, trip?.synced_at]);

  function refresh(t: LocalTrip | null) {
    const user = currentUser();
    if (!user || !t) return;
    setTrip(getLocalTrip(t.id, user.username));
  }

  function addByCode() {
    const user = currentUser();
    if (!trip || !user) return;
    const c = code.trim();
    if (!c) {
      setMsg("");
      setError("أدخل كود الموظف أولاً");
      return;
    }
    setError("");
    setMsg("");
    const res = addPassengerByCode(trip.id, user.username, c);
    if (res.duplicated) setMsg("هذا الكود مُسجَّل مسبقاً في الرحلة");
    else if (res.notFound) {
      setError(`الكود «${c}» غير موجود في قاعدة البيانات — تحقق من الرقم، أو أضف الراكب يدوياً من النموذج أدناه`);
      setForm({ employee_code: c, name: "", coming_from: "", summoned_department: "", purpose: "work" });
      setShowNew(true);
    } else if (res.trip) setMsg("تمت إضافة الموظف بنجاح");
    else setError("تعذر الإضافة — الرحلة غير نشطة");
    setCode("");
    refresh(res.trip);
  }

  function addNonEmp() {
    const user = currentUser();
    if (!trip || !user) return;
    const missing: string[] = [];
    if (!form.name.trim()) missing.push("الاسم");
    if (!form.coming_from.trim()) missing.push("الجهة القادم منها");
    if (!form.summoned_department.trim()) missing.push("الجهة التي استدعته");
    if (missing.length) {
      setMsg("");
      setError(`هذه الحقول إجبارية: ${missing.join("، ")}`);
      return;
    }
    setError("");
    const comingFrom = form.coming_from.trim();
    const summoned = form.summoned_department.trim();
    const t = form.employee_code.trim()
      ? addNewPassengerToTrip(trip.id, user.username, { employee_code: form.employee_code.trim(), name: form.name.trim(), coming_from: comingFrom, summoned_department: summoned, visit_purpose: form.purpose })
      : addNonEmployeePassenger(trip.id, user.username, { name: form.name.trim(), coming_from: comingFrom, summoned_department: summoned, purpose: form.purpose });
    if (!t) { setError("تعذر حفظ البيانات — أكمل الحقول الإجبارية وتأكد أن الرحلة نشطة"); return; }
    setMsg("تم حفظ بيانات الراكب");
    resetForm();
    setShowNew(false);
    refresh(t);
  }

  function startEdit(p: LocalPassenger) {
    setEditError("");
    setEditing(p);
    setEditForm({
      employee_code: p.employee_code || "",
      name: p.name || "",
      coming_from: p.coming_from || p.company || "",
      summoned_department: p.summoned_department || p.department || "",
      purpose: p.visit_purpose || (p.source === "non_employee" ? "work" : "employee"),
    });
  }

  function saveEdit() {
    const user = currentUser();
    if (!trip || !user || !editing) return;
    setEditError("");
    if (NON_MASTER_SOURCES.has(editing.source)) {
      const missing: string[] = [];
      if (!editForm.name.trim()) missing.push("الاسم");
      if (!editForm.coming_from.trim()) missing.push("الجهة القادم منها");
      if (!editForm.summoned_department.trim()) missing.push("الجهة التي استدعته");
      if (missing.length) { setEditError(`هذه الحقول إجبارية: ${missing.join("، ")}`); return; }
      const res = updatePassengerInTrip(trip.id, user.username, editing.client_uuid, {
        employee_code: editForm.employee_code.trim() || undefined,
        name: editForm.name,
        coming_from: editForm.coming_from,
        summoned_department: editForm.summoned_department,
        visit_purpose: editForm.purpose,
      });
      if (res.duplicated) { setEditError("هذا الكود مُسجَّل مسبقاً في الرحلة"); return; }
      if (!res.trip) { setEditError("تعذر حفظ التعديل — الرحلة غير نشطة أو مكتملة"); return; }
      setMsg("تم تحديث بيانات الراكب");
      setEditing(null);
      refresh(res.trip);
      return;
    }
    if (!editForm.employee_code.trim()) { setEditError("أدخل كود الموظف"); return; }
    const res = updatePassengerInTrip(trip.id, user.username, editing.client_uuid, {
      employee_code: editForm.employee_code,
      name: editForm.name,
      visit_purpose: editForm.purpose,
    });
    if (res.duplicated) { setEditError("هذا الكود مُسجَّل مسبقاً في الرحلة"); return; }
    if (!res.trip) { setEditError("تعذر حفظ التعديل — الرحلة غير نشطة أو مكتملة"); return; }
    setMsg("تم تحديث بيانات الموظف");
    setEditing(null);
    refresh(res.trip);
  }

  function removePassenger(p: LocalPassenger) {
    const user = currentUser();
    if (!trip || !user) return;
    const t = removePassengerFromTrip(trip.id, user.username, p.client_uuid);
    if (!t) { setError("لا يمكن حذف الصاعدين بعد إكمال الرحلة"); return; }
    setError("");
    setMsg("تم حذف الراكب من الرحلة");
    refresh(t);
  }

  async function complete() {
    const user = currentUser();
    if (!trip || !user) return;
    setBusy(true);
    setError("");
    try {
      const t = completeLocalTrip(trip.id, user.username);
      refresh(t);
      const canSend = isOnline() && (!!getConfig().power_automate_url.trim() || !!window.localStorage.getItem("access_token"));
      setMsg(canSend
        ? "تم إكمال الرحلة — جارٍ الإرسال إلى النظام..."
        : "تم إكمال الرحلة — بانتظار الشبكة، وستُرسل تلقائياً فور توفّرها دون أي إجراء.");
    } finally {
      setBusy(false);
    }
  }

  function purposeLabel(v?: string | null): string {
    const map: Record<string, string> = {
      employee: "موظف", visitor: "زائر", work: "عمل", contractor: "مقاول", meeting: "اجتماع",
      training: "تدريب", maintenance: "صيانة", delivery: "تسليم/شحن", business_mission: "مهمة عمل", other: "أخرى",
    };
    return v ? map[v] || v : "—";
  }

  function passengerTitle(p: LocalPassenger): string {
    if (p.source === "non_employee") return p.name || "راكب غير موظف";
    if (p.source === "new_employee") return p.name || `كود ${p.employee_code || "—"}`;
    if (p.employee_code && !p.name) return `كود ${p.employee_code}`;
    return p.name || p.employee_code || "غير مسجل";
  }

  function passengerSubtitle(p: LocalPassenger): string {
    if (p.source === "non_employee") {
      const bits = [];
      if (p.coming_from || p.company) bits.push(`القادم من: ${p.coming_from || p.company}`);
      if (p.summoned_department || p.department) bits.push(`استدعته: ${p.summoned_department || p.department}`);
      bits.push(`الغرض: ${purposeLabel(p.visit_purpose)}`);
      return bits.join(" · ") || "غير موظف — للمراجعة";
    }
    const bits = [];
    if (p.employee_code) bits.push(`كود ${p.employee_code}`);
    if (p.department) bits.push(p.department);
    if (p.source === "new_employee") bits.push("أُضيف يدوياً — للمراجعة من المشرف");
    if (!p.name && !p.department) bits.push("لم يُعثر عليه في قاعدة البيانات");
    return bits.join(" · ");
  }

  function passengerBadge(p: LocalPassenger): { label: string; cls: string } {
    if (p.source === "non_employee") return { label: "غير موظف", cls: "status-needs_review" };
    if (p.source === "code_only" || p.source === "new_employee") return { label: "تحتاج تأكيد", cls: "status-needs_review" };
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
                  <div><strong>{form.employee_code ? `إضافة موظف يدوياً — كود ${form.employee_code}` : "راكب غير موظف"}</strong><span>{form.employee_code ? "الرقم غير موجود في قاعدة البيانات، تُحفظ بياناته للمراجعة عند المشرف." : "تظهر بياناته للمشرف وتُحفظ على الجهاز."}</span></div>
                </div>
                <button className="link-btn" onClick={() => { setShowNew(false); resetForm(); }}>إلغاء</button>
              </div>
              <div className="form-grid">
                {!form.employee_code && <label className="field"><span>كود الموظف (اختياري)</span><input value={form.employee_code} onChange={e => setForm({ ...form, employee_code: e.target.value })} inputMode="numeric" placeholder="مثال: 80045" /></label>}
                <label className="field"><span>الاسم{REQ}</span><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus /></label>
                <label className="field"><span>الجهة القادم منها{REQ}</span><input value={form.coming_from} onChange={e => setForm({ ...form, coming_from: e.target.value })} placeholder="مثال: شركة المقاولات..." /></label>
                <label className="field"><span>الجهة التي استدعته{REQ}</span>
                  {departments.length ? (
                    <select value={form.summoned_department} onChange={e => setForm({ ...form, summoned_department: e.target.value })}>
                      <option value="">— اختر الإدارة —</option>
                      {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                  ) : (
                    <input value={form.summoned_department} onChange={e => setForm({ ...form, summoned_department: e.target.value })} placeholder="اسم الإدارة" />
                  )}
                </label>
                <label className="field"><span>الغرض</span>
                  <select value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })}>
                    <option value="work">عمل</option>
                    <option value="visitor">زائر</option>
                    <option value="employee">موظف</option>
                    <option value="meeting">اجتماع</option>
                    <option value="training">تدريب</option>
                    <option value="maintenance">صيانة</option>
                    <option value="delivery">تسليم/شحن</option>
                    <option value="other">أخرى</option>
                  </select>
                </label>
              </div>
              <div className="hint" style={{ marginBottom: 10 }}>الحقول المعلّمة بـ <b style={{ color: "var(--danger)" }}>*</b> إجبارية: الاسم، الجهة القادم منها، الجهة التي استدعته.</div>
              <button className="primary-btn" onClick={addNonEmp}>حفظ البيانات</button>
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
                  {active && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="icon-btn" style={{ width: 32, height: 32, fontSize: 16 }} title="تعديل" aria-label="تعديل" onClick={() => startEdit(p)}><Pencil size={16} /></button>
                      <button className="icon-btn" style={{ width: 32, height: 32, fontSize: 16 }} title="حذف" aria-label="حذف" onClick={() => removePassenger(p)}><Trash2 size={16} /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
      {synced && <div className="alert success">تم إرسال هذه الرحلة إلى النظام بنجاح.</div>}
      {trip.status === "completed" && !synced && (
        <div className={`alert ${hasDeliveryRoute ? "" : "warning"}`}>
          {!hasDeliveryRoute
            ? "لا يوجد اتصال بالخادم — سجّل الدخول عبر الشبكة أو عيّن رابط الإرسال، وستُرسل الرحلة تلقائياً بعد ذلك."
            : online
              ? "جارٍ إرسال الرحلة إلى النظام..."
              : "بانتظار الاتصال بالشبكة — ستُرسل الرحلة تلقائياً فور توفّرها دون أي إجراء منك."}
        </div>
      )}
      {active && <div className="hint">يمكنك تعديل أو حذف أي راكب أُضيف بالخطأ الآن. لا يمكن إرسال تقرير الرحلة إلى النظام إلا بعد إكمالها.</div>}
      {trip.status !== "boarding" && trip.passengers.length > 0 && (
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
      {active && (
        <section className="section actions-section">
          <button className="primary-btn" disabled={busy} onClick={complete}>
            {busy ? "جارٍ الإكمال والإرسال..." : "إكمال الرحلة وإرسالها"}
          </button>
        </section>
      )}
      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">EDIT PASSENGER</div>
                <h2>تعديل بيانات الراكب</h2>
              </div>
              <button className="icon-btn" onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="stack-lg">
              {NON_MASTER_SOURCES.has(editing.source) ? (
                <>
                  <label className="field"><span>كود الموظف (اختياري — إن وُجد يُطابَق مع كشف الموظفين)</span><input value={editForm.employee_code} onChange={e => setEditForm({ ...editForm, employee_code: e.target.value })} inputMode="numeric" /></label>
                  <label className="field"><span>الاسم{REQ}</span><input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} autoFocus /></label>
                  <label className="field"><span>الجهة القادم منها{REQ}</span><input value={editForm.coming_from} onChange={e => setEditForm({ ...editForm, coming_from: e.target.value })} placeholder="مثال: شركة المقاولات..." /></label>
                  <label className="field"><span>الجهة التي استدعته{REQ}</span>
                    {departments.length ? (
                      <select value={editForm.summoned_department} onChange={e => setEditForm({ ...editForm, summoned_department: e.target.value })}>
                        <option value="">— اختر الإدارة —</option>
                        {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                      </select>
                    ) : (
                      <input value={editForm.summoned_department} onChange={e => setEditForm({ ...editForm, summoned_department: e.target.value })} placeholder="اسم الإدارة" />
                    )}
                  </label>
                  <label className="field"><span>الغرض</span>
                    <select value={editForm.purpose} onChange={e => setEditForm({ ...editForm, purpose: e.target.value })}>
                      <option value="work">عمل</option>
                      <option value="visitor">زائر</option>
                      <option value="employee">موظف</option>
                      <option value="meeting">اجتماع</option>
                      <option value="training">تدريب</option>
                      <option value="maintenance">صيانة</option>
                      <option value="delivery">تسليم/شحن</option>
                      <option value="other">أخرى</option>
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <label className="field"><span>كود الموظف</span><input value={editForm.employee_code} onChange={e => setEditForm({ ...editForm, employee_code: e.target.value })} inputMode="numeric" autoFocus /></label>
                  <label className="field"><span>الاسم (يُملأ تلقائياً من كود الموظف)</span><input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></label>
                </>
              )}
              {editError && <div className="alert danger">{editError}</div>}
              <div className="modal-actions">
                <button className="secondary-btn" onClick={() => setEditing(null)}>إلغاء</button>
                <button className="primary-btn" onClick={saveEdit}>حفظ التعديل</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}