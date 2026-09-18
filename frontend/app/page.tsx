"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BusFront, LockKeyhole, UserRound } from "lucide-react";
import { apiLogin, getStoredUser, type User } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (user) router.replace(user.role === "driver" ? "/dashboard" : "/admin");
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await apiLogin(username, password);
      router.replace(data.user.role === "driver" ? "/dashboard" : "/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark"><BusFront size={28} /></div>
        <div className="eyebrow">DRIVER TRANSPORT SYSTEM</div>
        <h1>نظام رحلات السائقين</h1>
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
          <button className="primary-btn large" disabled={loading}>{loading ? "جارٍ الدخول..." : "تسجيل الدخول"}</button>
        </form>
        <div className="demo-box">
          <strong>حسابات التجربة</strong>
          <span>driver1 / Driver@12345</span>
          <span>supervisor / Supervisor@12345</span>
          <span>admin / Admin@12345</span>
        </div>
      </section>
    </main>
  );
}
