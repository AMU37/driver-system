"use client";

import { useEffect, useState } from "react";
import { BusFront, KeyRound, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { getStoredUser, type User } from "@/lib/api";
import { findDriver, hasLocalPin, isOnline, loadLocalSession, loadSnapshot, setLocalPin, storeLocalSession, tryOnlineLogin, verifyLocalPin, type SnapshotDriver } from "@/lib/offlineStore";
import { findLocalDriverAccount } from "@/lib/adminOps";
import { routePath } from "@/lib/nav";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pins, setPins] = useState(["", ""]);
  const [phase, setPhase] = useState<"signin" | "set_pin" | "verify_pin">("signin");
  const [pending, setPending] = useState<SnapshotDriver | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(true);

  const home = (user: User | { role: string }) => (user.role === "driver" ? "/dashboard" : "/admin");
  const go = (url: string) => { window.location.assign(routePath(url)); };

  useEffect(() => {
    setOnline(isOnline());
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    loadSnapshot().catch(() => {});
    const session = loadLocalSession();
    if (session) {
      go(home(session));
      return;
    }
    const backendUser = getStoredUser();
    if (backendUser) {
      storeLocalSession(backendUser);
      go(home(backendUser));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pinReady(): boolean {
    return phase === "verify_pin" ? pins[0].length === 4 : pins[0].length === 4 && pins[1].length === 4;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (phase === "set_pin" || phase === "verify_pin") return;
    setLoading(true);
    setError("");
    try {
      const res = await tryOnlineLogin(username, password);
      if (res.ok) {
        go(home(res.user));
        return;
      }
      if (res.code === "unauthorized") {
        setError("اسم المستخدم أو كلمة المرور غير صحيحة");
        return;
      }
      await loadSnapshot();
      const driver = findDriver(username.trim()) || findLocalDriverAccount(username.trim());
      if (!driver) {
        setError("تعذر التحقق من الحساب دون اتصال. تأكد من اسم المستخدم أو عُد عند توفر الشبكة.");
        return;
      }
      setPending(driver);
      if (hasLocalPin(driver.username)) {
        setPhase("verify_pin");
        setPins(["", ""]);
      } else {
        setPhase("set_pin");
        setPins(["", ""]);
      }
    } catch {
      setError("تعذر الاتصال بالخادم. حاول مجدداً.");
    } finally {
      setLoading(false);
    }
  }

  async function submitPin() {
    if (!pending || pins[0].length !== 4 || (phase === "set_pin" && pins[1].length !== 4)) return;
    setLoading(true);
    setError("");
    try {
      if (phase === "set_pin") {
        if (pins[0] !== pins[1]) {
          setError("رمز التأكيد غير مطابق — أعد إدخال الرمز");
          return;
        }
        await setLocalPin(pins[0], pending.username);
      } else if (!(await verifyLocalPin(pins[0], pending.username))) {
        setError("رمز الدخول غير صحيح");
        return;
      }
      storeLocalSession({ id: pending.id, username: pending.username, full_name: pending.full_name, role: pending.role, driver_code: pending.driver_code, company_code: pending.company_code });
      await loadSnapshot();
      go(home(pending));
    } finally {
      setLoading(false);
    }
  }

  function pinDigit(value: string) {
    return value.replace(/\D/g, "").slice(0, 4);
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark"><BusFront size={28} /></div>
        <div className="eyebrow">DRIVER TRANSPORT SYSTEM</div>
        <h1>نظام رحلات السائقين</h1>
        {phase === "signin" ? (
          <>
            <p className="muted">تسجيل الدخول للوصول إلى الرحلات والمهام التشغيلية</p>
            <form onSubmit={submit} className="stack-lg">
              <label className="field">
                <span>اسم المستخدم</span>
                <div className="input-wrap"><UserRound size={19} /><input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required /></div>
              </label>
              <label className="field">
                <span>كلمة المرور</span>
                <div className="input-wrap"><LockKeyhole size={19} /><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></div>
              </label>
              {error && <div className="alert danger">{error}</div>}
              <div className={`online-pill ${online ? "" : "offline"}`}><span className="live-dot"></span>{online ? "متصل بالشبكة" : "وضع العمل بدون إنترنت"}</div>
              <button className="primary-btn large" disabled={loading}>{loading ? "جارٍ الدخول..." : "تسجيل الدخول"}</button>
            </form>
          </>
        ) : (
          <>
            <p className="muted">الدخول دون اتصال — الحساب: <strong>{pending?.full_name}</strong> ({pending?.username})</p>
            <p className="muted">{phase === "set_pin" ? "اضبط رمز PIN مكوّن من 4 أرقام للدخول المحلي على هذا الجهاز" : "أدخل رمز PIN الخاص بهذا الجهاز"}</p>
            <div className="stack-lg">
              <label className="field">
                <span>{phase === "set_pin" ? "رمز PIN" : "رمز PIN"}</span>
                <div className="input-wrap"><KeyRound size={19} /><input inputMode="numeric" value={pins[0]} onChange={e => setPins([pinDigit(e.target.value), pins[1]])} placeholder="••••" /></div>
              </label>
              {phase === "set_pin" && (
                <label className="field">
                  <span>تأكيد رمز PIN</span>
                  <div className="input-wrap"><ShieldCheck size={19} /><input inputMode="numeric" value={pins[1]} onChange={e => setPins([pins[0], pinDigit(e.target.value)])} placeholder="••••" /></div>
                </label>
              )}
              {error && <div className="alert danger">{error}</div>}
              <button className="primary-btn large" onClick={submitPin} disabled={loading || !pinReady()}>{loading ? "جارٍ التحقق..." : phase === "set_pin" ? "حفظ والدخول" : "دخول"}</button>
              <button className="link-btn" onClick={() => { setPhase("signin"); setPending(null); setPins(["", ""]); }}>رجوع</button>
            </div>
          </>
        )}
        <div className="demo-box">
          <span className="muted">يعمل التطبيق بدون إنترنت أثناء الرحلة، وتُرسل البيانات تلقائياً عند توفر الاتصال.</span>
        </div>
      </section>
    </main>
  );
}