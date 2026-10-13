export function routePath(p: string): string {
  if (!p.startsWith("/")) return p;
  const q = p.indexOf("?");
  const base = q === -1 ? p : p.slice(0, q);
  const query = q === -1 ? "" : p.slice(q);
  if (base === "/" || base.endsWith(".html")) return p;
  return base + "/index.html" + query;
}

/** الصفحة الرئيسية لكل دور بعد تسجيل الدخول. */
export function homeForRole(role?: string | null): string {
  if (role === "driver") return "/dashboard";
  if (role === "viewer") return "/reports";
  return "/admin";
}