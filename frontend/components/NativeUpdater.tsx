"use client";

import { useEffect } from "react";

/**
 * إشعار طبقة التحديث (OTA) بأن نسخة الويب أقلعت بنجاح.
 *
 * إضافة CapacitorUpdater تُرجِع تلقائياً إلى النسخة السابقة إن لم يصلها هذا
 * الإشعار خلال المهلة المحددة (appReadyTimeout)، لذا يجب أن يُنفَّذ مبكراً
 * في كل إقلاع للتطبيق. لا يفعل شيئاً على الويب/المتصفح العادي.
 */
export default function NativeUpdater() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
        if (cancelled) return;
        await CapacitorUpdater.notifyAppReady();
      } catch {
        /* لا نُفشل تشغيل التطبيق إن تعذّر الإشعار */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return null;
}
