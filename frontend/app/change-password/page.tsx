"use client";
import { useEffect, useState } from "react";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import AppShell from "@/components/AppShell";
import { changePassword, getStoredUser } from "@/lib/api";
import { routePath } from "@/lib/nav";

export default function ChangePasswordPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) window.location.assign(routePath("/"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (next.length < 8) {
      setError("يجب ألا تقل كلمة المرور الجديدة عن 8 أحرف");
      return;
    }
    if (!/[A-Za-z\u0600-\u06FF]/.test(next) || !/\d/.test(next)) {
      setError("يجب أن تحتوي كلمة المرور على حروف وأرقام");
      return;
    }
    if (next !== confirm) {
      setError("تأكيد كلمة المرور غير مطابق");
      return;
    }
    setLoading(true);
    try {
      const user = await changePassword(current, next);
      localStorage.setItem("user", JSON.stringify(user));
      setSuccess("تم تغيير كلمة المرور بنجاح");
      setTimeout(() => window.location.assign(routePath(user.role === "driver" ? "/dashboard" : "/admin")), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تغيير كلمة المرور");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <div className="eyebrow">ACCOUNT SECURITY</div>
          <h1>تغيير كلمة المرور</h1>
          <p>لأمان حسابك، يجب تغيير كلمة المرور الافتراضية أو المؤقتة قبل المتابعة.</p>
        </div>
      </div>
      <div className="table-card" style={{ maxWidth: "560px" }}>
        <div className="modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <ShieldCheck size={26} />
            <h2 style={{ margin: 0 }}>إنشاء كلمة مرور جديدة</h2>
          </div>
        </div>
        <div className="stack-lg">
          <form onSubmit={submit} className="stack-lg">
            {error && <div className="alert danger">{error}</div>}
            {success && <div className="alert success">{success}</div>}
            <label className="field">
              <span>كلمة المرور الحالية</span>
              <div className="input-wrap"><KeyRound size={19} /><input type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" required /></div>
            </label>
            <label className="field">
              <span>كلمة المرور الجديدة</span>
              <div className="input-wrap"><LockKeyhole size={19} /><input type="password" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" required /></div>
            </label>
            <label className="field">
              <span>تأكيد كلمة المرور الجديدة</span>
              <div className="input-wrap"><LockKeyhole size={19} /><input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required /></div>
            </label>
            <div className="hint">يجب أن تحتوي كلمة المرور على حروف وأرقام ولا تقل عن 8 أحرف.</div>
            <button className="primary-btn large" disabled={loading}>{loading ? "جارٍ الحفظ..." : "حفظ كلمة المرور الجديدة"}</button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}