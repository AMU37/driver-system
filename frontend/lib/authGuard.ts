"use client";
import { useEffect, useRef, useState } from "react";
import { getStoredUser } from "@/lib/api";
import { loadLocalSession, type OfflineUser } from "@/lib/offlineStore";
import { homeForRole, routePath } from "@/lib/nav";

export function currentUser(): OfflineUser | null {
  if (typeof window === "undefined") return null;
  return getStoredUser() || loadLocalSession();
}

/**
 * جلسة المستخدم الحالي.
 *
 * مهم: أول رسم على العميل يجب أن يطابق HTML المرسل من الخادم (حيث لا توجد جلسة)،
 * لذلك نبدأ بـ null ونقرأ localStorage بعد التركيب فقط. قراءة الجلسة أثناء الرسم
 * كانت تسبب Hydration mismatch على /admin ثم تبقى الصفحة على شاشة «لا تملك صلاحية».
 */
export function useAuthGuard(roles?: Array<"driver" | "supervisor" | "admin" | "viewer">): OfflineUser | null {
  const [user, setUser] = useState<OfflineUser | null>(null);
  const [ready, setReady] = useState(false);
  const redirected = useRef(false);

  useEffect(() => {
    setUser(currentUser());
    setReady(true);
    // تحديث الجلسة إن تغيّرت من تبويب آخر (تسجيل خروج/دخول).
    const onStorage = (e: StorageEvent) => {
      if (e.key === "user" || e.key === "ds_session") setUser(currentUser());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!ready || redirected.current) return;
    if (!user) {
      redirected.current = true;
      window.location.assign(routePath("/"));
      return;
    }
    // كلمة مرور مؤقتة/افتراضية: الخادم يرفض بقية الطلبات حتى تُغيَّر.
    if (user.must_change_password && window.location.pathname !== "/change-password") {
      redirected.current = true;
      window.location.assign(routePath("/change-password"));
      return;
    }
    if (roles && !roles.includes(user.role as any)) {
      redirected.current = true;
      window.location.assign(routePath(homeForRole(user.role)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, roles]);
  return user;
}