"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

type BundleState = { bundle: string; native: string };

/**
 * حالة تحديثات الواجهة على الجهاز + فحص يدوي فوري.
 *
 * الغرض: التحقق العملي من أن التحديث التلقائي يعمل — يُظهر رقم نسخة الواجهة
 * العاملة فعلاً (لا رقم APK)، وزر «التحقق الآن» يجلب أحدث نسخة وينزّلها ويجعلها
 * جاهزة للتطبيق عند إعادة فتح التطبيق.
 */
export default function UpdateStatus() {
  const [state, setState] = useState<BundleState | null>(null);
  const [isNative, setIsNative] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadUpdater = useCallback(async () => {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
    return CapacitorUpdater;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const updater = await loadUpdater();
        if (cancelled) return;
        if (!updater) {
          setIsNative(false);
          return;
        }
        setIsNative(true);
        const current = await updater.current();
        if (cancelled) return;
        setState({ bundle: current.bundle.version, native: current.native });
      } catch {
        if (!cancelled) setIsNative(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadUpdater]);

  const checkNow = async () => {
    setBusy(true);
    setMessage("");
    try {
      const updater = await loadUpdater();
      if (!updater) {
        setMessage("التحديث التلقائي يعمل داخل تطبيق الجوال فقط، وليس في المتصفح.");
        return;
      }
      const current = await updater.current();
      setState({ bundle: current.bundle.version, native: current.native });

      let latest: { version?: string; url?: string; checksum?: string } = {};
      try {
        latest = await updater.getLatest();
      } catch (error) {
        setMessage("تعذّر الوصول إلى خادم التحديثات: " + errorText(error));
        return;
      }

      if (!latest?.version || latest.version === current.bundle.version) {
        setMessage(`لا يوجد تحديث أحدث — النسخة العاملة ${current.bundle.version}.`);
        return;
      }
      if (!latest.url) {
        setMessage(`النسخة ${latest.version} متاحة لكن رابط الحزمة غير مكتمل.`);
        return;
      }

      setMessage(`جارٍ تنزيل النسخة ${latest.version}…`);
      const downloaded = await updater.download({
        url: latest.url,
        version: latest.version,
        checksum: latest.checksum,
      });
      await updater.next({ id: downloaded.id });
      setState({ bundle: current.bundle.version, native: current.native });
      setMessage(`تم تنزيل النسخة ${latest.version}. أغلق التطبيق تماماً ثم افتحه لتصبح فعّالة.`);
    } catch (error) {
      setMessage("تعذّر إتمام التحديث: " + errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section">
      <div className="section-title">
        <div>
          <h2>تحديثات التطبيق</h2>
          <span>نسخة الواجهة العاملة على هذا الجهاز</span>
        </div>
        <RefreshCw size={18} />
      </div>

      <div className="detail-grid">
        <div>
          <span>نسخة الواجهة (تُحدَّث تلقائياً)</span>
          <strong>{state ? state.bundle : isNative === false ? "—" : "…"}</strong>
        </div>
        <div>
          <span>نسخة التطبيق المثبتة</span>
          <strong>{state ? state.native : isNative === false ? "—" : "…"}</strong>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 12 }}>
        يتحقق التطبيق من التحديثات تلقائياً عند كل فتح أو عودة للواجهة، وينزّلها في الخلفية، ثم يطبّقها عند الخروج من التطبيق.
        لا حاجة لإعادة تثبيت التطبيق.
      </p>

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <button className="primary-btn" onClick={checkNow} disabled={busy || isNative === false}>
          {busy ? "جارٍ الفحص…" : "التحقق من التحديثات الآن"}
        </button>
      </div>

      {message && (
        <div className="hint" style={{ marginTop: 12 }} role="status">
          {message}
        </div>
      )}
    </section>
  );
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === "string") return value;
  }
  return "خطأ غير معروف";
}
