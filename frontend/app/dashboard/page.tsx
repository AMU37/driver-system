"use client";
import { useCallback, useEffect, useState } from "react";
import { BusFront, CheckCircle2, Clock3, Download, RefreshCw, Route, Send, Users2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { createManualTrip, getActiveLocalTrip, getAvailableBuses, getPlannedForDriver, isOnline, listLocalTrips, loadSnapshot, localStats, pendingSyncCount, refreshLiveData, syncNow, syncSnapshotFromServer, snapshotMeta, TRIP_LOCATIONS, TRIP_TYPES, type LocalTrip, type SnapshotBus, type SnapshotPlanned, type TripType } from "@/lib/offlineStore";
import { ActiveCard, PlannedCard } from "@/components/TripCard";
import { useAuthGuard } from "@/lib/authGuard";
import { routePath } from "@/lib/nav";

export default function DashboardPage() {
  const user = useAuthGuard(["driver"]);
  const [active, setActive] = useState<LocalTrip | null>(null);
  const [upcoming, setUpcoming] = useState<SnapshotPlanned[]>([]);
  const [stats, setStats] = useState({ today_total: 0, completed: 0, synced: 0, active_count: 0 });
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [routeLine, setRouteLine] = useState("");
  const [tripType, setTripType] = useState<TripType>("مغادر");
  const [bus, setBus] = useState("");
  const [buses, setBuses] = useState<SnapshotBus[]>([]);
  const [creating, setCreating] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [updating, setUpdating] = useState(false);
  const [meta, setMeta] = useState<{ built_at: string; counts: Record<string, number> } | null>(() => typeof window !== "undefined" ? snapshotMeta() : null);

  const refresh = useCallback(() => {
    if (!user) return;
    setActive(getActiveLocalTrip(user.username));
    setUpcoming(getPlannedForDriver(user.username, user.driver_code).slice(0, 10));
    setStats(localStats(user.username));
    setPending(pendingSyncCount(user.username));
    setOnline(isOnline());
    const completedList = listLocalTrips(user.username).filter((t) => t.status === "completed" && !t.synced_at);
    setPending(completedList.length);
  }, [user?.username]);

  useEffect(() => {
    loadSnapshot()
      .then(() => { setMeta(snapshotMeta()); refresh(); })
      .catch(() => setError("تعذر تحميل بيانات الرحلة الأساسية"))
      .finally(() => setReady(true));
    const on = () => { setOnline(true); refresh(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    if (user && isOnline() && typeof window !== "undefined" && window.localStorage.getItem("access_token")) {
      updateData(true);
    }
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [refresh, user?.username]);

  async function updateData(silent = false) {
    if (updating) return;
    setUpdating(true);
    if (!silent) { setMsg(""); setError(""); }
    try {
      const r = await syncSnapshotFromServer();
      if (r.ok) {
        if (user) await refreshLiveData(user).catch(() => {});
        setMeta(snapshotMeta());
        if (user) refresh();
        if (!silent) setMsg("تم تحديث بيانات التطبيق بنجاح" + (r.built_at ? ` — ${new Date(r.built_at).toLocaleString("ar-EG")}` : ""));
      } else if (!silent) {
        setError(r.error || "تعذر تحديث البيانات");
      }
    } finally {
      setUpdating(false);
    }
  }

  async function doSync() {
    if (!user || syncing) return;
    setSyncing(true);
    setMsg("");
    setError("");
    try {
      const r = await syncNow(user.username);
      setMsg(r.pushed ? `تم إرسال ${r.pushed} رحلة بنجاح` : r.lastError || "لا توجد رحلات بانتظار الإرسال");
      if (r.failed && r.failed > 0) setError(`تعذر إرسال ${r.failed} رحلة — سيعاد المحاولة تلقائياً`);
      refresh();
    } finally {
      setSyncing(false);
    }
  }

  async function startCreate() {
    if (!user) return;
    if (!routeLine.trim() || !bus) {
      setFormErr("أدخل رقم الباص وخط السير");
      return;
    }
    setCreating(true);
    setFormErr("");
    try {
      const trip = createManualTrip({ driverUsername: user.username, companyCode: user.company_code || "YCSR", routeLine: routeLine.trim(), busNumber: bus, tripType });
      setShowCreate(false);
      refresh();
      setActive(trip);
      setUpcoming([]);
      window.location.assign(routePath(`/trip?id=${encodeURIComponent(trip.id)}`));
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "تعذر إنشاء الرحلة");
    } finally {
      setCreating(false);
    }
  }

  return <AppShell>
<div className="page-head">
        <div>
          <div className="eyebrow">DRIVER PORTAL</div>
          <h1>لوحة القيادة</h1>
          <p>كل ما تحتاجه لتشغيل الرحلة من شاشة واحدة.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button className="primary-btn" onClick={() => { setBuses(getAvailableBuses()); setFormErr(""); setShowCreate(true); }}><Route size={18} style={{ verticalAlign: "-3px" }}/> بدء الرحلة</button>
          <button className="secondary-btn" onClick={() => updateData(false)} disabled={updating}><Download size={18} style={{ verticalAlign: "-3px" }}/> {updating ? "جارٍ التحديث..." : "تحديث البيانات"}</button>
          <div className={`online-pill ${online ? "" : "offline"}`}><span className="live-dot"></span>{online ? "متصل" : "بدون إنترنت"}</div>
        </div>
        {meta && <p className="muted">آخر تحديث للبيانات على هذا الجهاز: {new Date(meta.built_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</p>}
      </div>
    {error && <div className="alert danger">{error}</div>}
    {msg && <div className="alert success">{msg}</div>}
    {pending > 0 && (
      <button className="primary-btn full" onClick={doSync} disabled={syncing}>
        <Send size={18} style={{ verticalAlign: "-3px" }} /> {syncing ? "جارٍ الإرسال..." : `إرسال الرحلات المكتملة (${pending})`}
      </button>
    )}
    {!ready ? <div className="skeleton-grid"><div className="skeleton"></div><div className="skeleton"></div><div className="skeleton wide"></div></div> : <>
      <div className="stats-grid">
        <div className="metric"><BusFront/><div><span>رحلات هذا الجهاز</span><strong>{stats.today_total}</strong></div></div>
        <div className="metric"><CheckCircle2/><div><span>مكتملة</span><strong>{stats.completed}</strong></div></div>
        <div className="metric"><Clock3/><div><span>مُرسلة للنظام</span><strong>{stats.synced}</strong></div></div>
        <div className="metric"><Users2/><div><span>صعدوا في الرحلة الحالية</span><strong>{stats.active_count}</strong></div></div>
      </div>
      {active && <section className="section"><div className="section-title"><h2>الرحلة الحالية</h2></div><ActiveCard trip={active} /></section>}
      <section className="section">
        <div className="section-title"><h2>الرحلات القادمة</h2><span>{upcoming.length} رحلات</span></div>
        {upcoming.length ? <div className="cards-grid">{upcoming.map(t => <PlannedCard key={t.id} trip={t} />)}</div> : <div className="empty"><RefreshCw size={30}/><strong>لا توجد رحلات قادمة</strong><span>تُحمَّل الرحلات المخططة في بداية الدوام عند توفر الشبكة.</span></div>}
      </section>
    </>
    }
    {showCreate && (
      <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-head">
            <div>
              <div className="eyebrow">NEW TRIP</div>
              <h2>إنشاء رحلة جديدة</h2>
            </div>
            <button className="icon-btn" onClick={() => setShowCreate(false)}>×</button>
          </div>
          <div className="stack-lg">
            <label className="field"><span>خط السير</span>
              <div className="input-wrap"><Route size={19}/><input list="route-list" value={routeLine} onChange={e => setRouteLine(e.target.value)} placeholder="مثال: الحديدة → الشركة" /></div>
              <datalist id="route-list">{TRIP_LOCATIONS.map(l => <option key={l} value={l} />)}</datalist>
            </label>
            <label className="field"><span>نوع الرحلة</span>
              <div className="segmented-row">
                {TRIP_TYPES.map(t => <button key={t.value} type="button" className={tripType === t.value ? "primary-btn" : "secondary-btn"} onClick={() => setTripType(t.value)}>{t.label}</button>)}
              </div>
            </label>
            <label className="field"><span>رقم الباص</span>
              <div className="input-wrap"><BusFront size={19}/><select value={bus} onChange={e => setBus(e.target.value)}>
                <option value="">اختر الباص...</option>
                {buses.map(b => <option key={b.id} value={b.number}>الباص {b.number} — {b.plate_number || ""}</option>)}
              </select></div>
            </label>
            {formErr && <div className="alert danger">{formErr}</div>}
            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => setShowCreate(false)}>إلغاء</button>
              <button className="primary-btn" onClick={startCreate} disabled={creating}>{creating ? "جارٍ البدء..." : "بدء الرحلة"}</button>
            </div>
            <div className="hint">تُسجل الرحلة على هذا الجهاز. اضغط «بدء الرحلة» ثم أضف الموظفين، وتُرسل البيانات للنظام عند اكتمال الرحلة وتوفر الاتصال.</div>
          </div>
        </div>
      </div>
    )}
  </AppShell>;
}