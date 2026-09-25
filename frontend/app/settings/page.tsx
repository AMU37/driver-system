"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { Archive, Download, KeyRound, RefreshCw, Save, Send, Server, Settings2, ShieldCheck } from "lucide-react";
import { getConfig, hasLocalPin, isOnline, listLocalTrips, loadLocalSession, pendingSyncCount, refreshLiveData, saveConfig, setLocalPin, snapshotMeta, syncNow, syncSnapshotFromServer, verifyLocalPin, type AppConfig } from "@/lib/offlineStore";
import { useAuthGuard } from "@/lib/authGuard";

export default function SettingsPage() {
  useAuthGuard(["admin", "supervisor"]);
  const [user] = useState(() => loadLocalSession());
  const [config, setConfig] = useState<AppConfig>(() => getConfig());
  const [url, setUrl] = useState(config.power_automate_url);
  const [key, setKey] = useState(config.power_automate_key);
  const [server, setServer] = useState(config.server_url || "");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [meta, setMeta] = useState(snapshotMeta());
  const [pinMode, setPinMode] = useState(false);
  const [pinCur, setPinCur] = useState("");
  const [pinNew, setPinNew] = useState("");
  const [pinNew2, setPinNew2] = useState("");

  useEffect(() => {
    setOnline(isOnline());
    if (user) setPending(pendingSyncCount(user.username));
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [user]);

  function save() {
    const next: AppConfig = { power_automate_url: url.trim(), power_automate_key: key.trim(), server_url: server.trim(), last_sync_at: config.last_sync_at };
    saveConfig(next);
    setConfig(next);
    setMsg("تم حفظ الإعدادات");
    setError("");
  }

  async function doSync() {
    if (!user || busy) return;
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const r = await syncNow(user.username);
      if (r.pushed) setMsg(`تم إرسال ${r.pushed} رحلة بنجاح`);
      else setError(r.lastError || "لا توجد رحلات بانتظار الإرسال");
      setPending(pendingSyncCount(user.username));
    } finally {
      setBusy(false);
    }
  }

  async function doRefresh() {
    if (!user || busy) return;
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const r = await refreshLiveData(user);
      setMsg(r.refreshed ? "تم تحديث الرحلات وقائمة الموظفين" : "لا يوجد اتصال بالخادم أو لا توجد جلسة — استخدم بيانات الجهاز الحالية");
      setMeta(snapshotMeta());
    } finally {
      setBusy(false);
    }
  }

  async function doPin() {
    if (!user) return;
    if (pinNew.length !== 4 || pinNew !== pinNew2) {
      setError("رمز التأكيد غير مطابق أو غير مكتمل");
      return;
    }
    if (hasLocalPin(user.username) && !(await verifyLocalPin(pinCur, user.username))) {
      setError("رمز PIN الحالي غير صحيح");
      return;
    }
    await setLocalPin(pinNew, user.username);
    setMsg("تم تحديث رمز PIN");
    setPinMode(false);
    setError("");
    setPinCur(""); setPinNew(""); setPinNew2("");
  }

  async function doUpdateFromServer() {
    if (busy) return;
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const r = await syncSnapshotFromServer();
      if (r.ok) {
        if (user) await refreshLiveData(user).catch(() => {});
        setMeta(snapshotMeta());
        if (user) setPending(pendingSyncCount(user.username));
        setMsg("تم تحديث بيانات التطبيق من الخادم" + (r.built_at ? ` — ${new Date(r.built_at).toLocaleString("ar-EG")}` : ""));
      } else {
        setError(r.error || "تعذر تحديث البيانات");
      }
    } finally {
      setBusy(false);
    }
  }

  return <AppShell>
    <div className="page-head"><div><div className="eyebrow">SETTINGS</div><h1>الإعدادات</h1><p>إعدادات الجهاز، النظام الخارجي، والمزامنة.</p></div><div className={`online-pill ${online ? "" : "offline"}`}><span className="live-dot"></span>{online ? "متصل" : "بدون إنترنت"}</div></div>
    {(msg || error) && <div className={`alert ${error ? "danger" : "success"}`}>{error || msg}</div>}
    <section className="section">
      <div className="section-title"><div><h2>الربط بنظام مايكروسوفت</h2><span>رابط طلب HTTP في Power Automate لاستقبال بيانات الرحلات</span></div><Settings2 size={18}/></div>
      <div className="stack-lg" style={{ maxWidth: 640 }}>
        <label className="field"><span>رابط Power Automate (HTTP POST)</span><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://prod-XX.westus.logic.azure.com/workflows/..."/></label>
        <label className="field"><span>مفتاح إضافي (اختياري — يرسل في ترويسة x-pa-key)</span><input value={key} onChange={e => setKey(e.target.value)} placeholder="اختياري"/></label>
        <div className="modal-actions"><button className="secondary-btn" onClick={save}><Save size={16} style={{ verticalAlign: "-3px" }}/> حفظ الإعدادات</button><button className="primary-btn" onClick={doSync} disabled={busy}><Send size={16} style={{ verticalAlign: "-3px" }}/> {busy ? "جارٍ الإرسال..." : `مزامنة الآن (${pending})`}</button></div>
      </div>
    </section>
    <section className="section">
      <div className="section-title"><div><h2>الخادم الحي (اختياري)</h2><span>رابط الخادم لتسجيل الدخول عبر الشبكة وتحديث بيانات الرحلات والموظفين. يُترك فارغاً للعمل بالبيانات المدمجة دون إنترنت.</span></div><Server size={18}/></div>
      <div className="stack-lg" style={{ maxWidth: 640 }}>
        <label className="field"><span>رابط الخادم (مثال: https://driver-system-mcku.onrender.com)</span><input value={server} onChange={e => setServer(e.target.value)} placeholder="اتركه فارغاً للاتصال بخادم النظام تلقائياً"/></label>
        <div className="modal-actions"><button className="secondary-btn" onClick={save}><Save size={16} style={{ verticalAlign: "-3px" }}/> حفظ الإعدادات</button></div>
        <div className="hint">الإصدار الحالي يتصل بخادم النظام تلقائياً دون ربطه هنا. يمكن ضبط رابط مخصص (http://IP:8001 لخادم محلي على نفس الشبكة).</div>
      </div>
    </section>
    <section className="section">
      <div className="section-title"><div><h2>بيانات الجهاز</h2><span>تُحمَّل الرحلات والموظفون عند توفر الشبكة ثم يعمل التطبيق بدون إنترنت</span></div><Archive size={18}/></div>
      {meta ? <div className="detail-grid" style={{ maxWidth: 640 }}><div><span>تاريخ بيانات الجهاز</span><strong>{new Date(meta.built_at).toLocaleString("ar-EG")}</strong></div><div><span>الموظفون</span><strong>{meta.counts.employees ?? 0}</strong></div><div><span>الباصات</span><strong>{meta.counts.buses ?? 0}</strong></div><div><span>رحلات مخططة</span><strong>{meta.counts.planned ?? 0}</strong></div></div> : <div className="hint">لا توجد بيانات بعد — اتصل بالشبكة مرة واحدة لتحميل البيانات.</div>}
      <div className="modal-actions"><button className="secondary-btn" onClick={doUpdateFromServer} disabled={busy}><Download size={16} style={{ verticalAlign: "-3px" }}/> {busy ? "جارٍ التحديث..." : "تحديث بيانات التطبيق من الخادم"}</button><button className="secondary-btn" onClick={doRefresh} disabled={busy}><RefreshCw size={16} style={{ verticalAlign: "-3px" }}/> تحديث الرحلات والموظفين</button></div>
    </section>
    <section className="section">
      <div className="section-title"><div><h2>الدخول المحلي</h2><span>رمز PIN لفك قفل الجهاز عند العمل دون إنترنت</span></div><KeyRound size={18}/></div>
      {!pinMode ? (
        <button className="secondary-btn" onClick={() => { setPinMode(true); setError(""); }}>
          <ShieldCheck size={16} style={{ verticalAlign: "-3px" }}/> {user && hasLocalPin(user.username) ? "تغيير رمز PIN" : "ضبط رمز PIN"}
        </button>
      ) : (
        <div className="stack-lg" style={{ maxWidth: 480 }}>
          {user && hasLocalPin(user.username) && <label className="field"><span>رمز PIN الحالي</span><input inputMode="numeric" value={pinCur} onChange={e => setPinCur(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••"/></label>}
          <label className="field"><span>رمز PIN الجديد</span><input inputMode="numeric" value={pinNew} onChange={e => setPinNew(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••"/></label>
          <label className="field"><span>تأكيد رمز PIN</span><input inputMode="numeric" value={pinNew2} onChange={e => setPinNew2(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••"/></label>
          <div className="modal-actions"><button className="secondary-btn" onClick={doPin}>حفظ الرمز</button><button className="secondary-btn" onClick={() => setPinMode(false)}>إلغاء</button></div>
        </div>
      )}
    </section>
  </AppShell>;
}