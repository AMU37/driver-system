"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, BusFront, CalendarClock, ChartColumn, History, LayoutDashboard, LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";
import { logout } from "@/lib/api";
import { autoPushPending, clearLocalSession } from "@/lib/offlineStore";
import { useAuthGuard } from "@/lib/authGuard";
import { routePath } from "@/lib/nav";
import { canDo } from "@/lib/permissions";

const driverItems = [
  ["/dashboard", "الرئيسية", LayoutDashboard],
  ["/planned", "الرحلات المخططة", CalendarClock],
  ["/history", "سجل الرحلات", History],
  ["/about", "الدليل", BookOpen]
] as const;

const adminItems = [
  ["/admin", "إدارة النظام", ShieldCheck],
  ["/settings", "الإعدادات", Settings],
  ["/about", "الدليل", BookOpen]
] as const;

const viewerItems = [
  ["/reports", "التقارير والخلاصات", ChartColumn],
  ["/about", "الدليل", BookOpen]
] as const;

/** تسمية دور المستخدم بالعربية في شريط الحساب. */
export function roleLabel(role?: string | null): string {
  if (role === "driver") return "سائق";
  if (role === "supervisor") return "مشرف";
  if (role === "viewer") return "مستعرض";
  return "مدير";
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useAuthGuard();
  const isAdmin = user && (user.role === "admin" || user.role === "supervisor");
  const isViewer = user?.role === "viewer";
  const supervisorCanViewAdmin = user?.role === "supervisor" ? canDo(user, "view") : true;
  const nav = isAdmin && supervisorCanViewAdmin ? adminItems : isViewer || (isAdmin && !supervisorCanViewAdmin) ? viewerItems : driverItems;
  useEffect(() => {
    if (!user || user.role !== "driver") return;
    const username = user.username;
    const run = () => { autoPushPending(username).catch(() => {}); };
    run();
    window.addEventListener("online", run);
    const onVisible = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(run, 60000);
    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.username]);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><div className="brand-mini"><BusFront size={20}/></div><div><strong>رحلات الموظفين</strong><small>Driver System V1.0</small></div></div>
        <nav>
          {nav.map(([href, label, Icon]) => <a key={href} href={routePath(href)} className={pathname === href || pathname.startsWith(href + "/") ? "nav-link active" : "nav-link"}><Icon size={19}/><span>{label}</span></a>)}
        </nav>
        <div className="sidebar-footer"><div className="user-chip"><div className="avatar"><UserRound size={18}/></div><div><strong>{user?.full_name || "المستخدم"}</strong><small>{roleLabel(user?.role)}</small></div></div><button className="logout-link" onClick={() => { logout(); clearLocalSession(); window.location.assign("/"); }}><LogOut size={18}/>خروج</button></div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}