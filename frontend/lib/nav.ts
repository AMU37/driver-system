export function routePath(p: string): string {
  if (!p.startsWith("/")) return p;
  const q = p.indexOf("?");
  const base = q === -1 ? p : p.slice(0, q);
  const query = q === -1 ? "" : p.slice(q);
  if (base === "/" || base.endsWith(".html")) return p;
  return base + "/index.html" + query;
}

import { canDo } from "@/lib/permissions";

/** الصفحة الرئيسية لكل دور بعد تسجيل الدخول. */
export function homeForRole(role?: string | null, user?: { role?: string | null; permissions?: Record<string, boolean> | null } | null): string {
  if (role === "driver") return "/dashboard";
  if (role === "viewer") return "/reports";
  if (role === "supervisor" && user && !canDo(user, "view")) return "/reports";
  return "/admin";
}