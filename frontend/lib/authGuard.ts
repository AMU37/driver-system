"use client";
import { useEffect, useMemo, useRef } from "react";
import { getStoredUser } from "@/lib/api";
import { loadLocalSession, type OfflineUser } from "@/lib/offlineStore";
import { routePath } from "@/lib/nav";

export function currentUser(): OfflineUser | null {
  if (typeof window === "undefined") return null;
  return getStoredUser() || loadLocalSession();
}

export function useAuthGuard(roles?: Array<"driver" | "supervisor" | "admin">): OfflineUser | null {
  const user = useMemo<OfflineUser | null>(() => currentUser(), [
    typeof window === "undefined"
      ? ""
      : `${window.localStorage.getItem("user")}\u0000${window.localStorage.getItem("ds_session")}`,
  ]);
  const redirected = useRef(false);
  useEffect(() => {
    if (redirected.current) return;
    if (!user) {
      redirected.current = true;
      window.location.assign(routePath("/"));
      return;
    }
    if (roles && !roles.includes(user.role as any)) {
      redirected.current = true;
      window.location.assign(routePath(user.role === "driver" ? "/dashboard" : "/admin"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, roles]);
  return user;
}