"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArchiveRestore, BookOpen, BusFront, CalendarClock, ChartColumn, History, LayoutDashboard, LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";
import { logout } from "@/lib/api";
import { autoPushPending, clearCredentials, clearLocalSession } from "@/lib/offlineStore";
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
  ["/admin?tab=dashboard", "شاشة العرض", ChartColumn],
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

/** زر إجراء سريع في القائمة الجانبية (يفتح لوحة محددة داخل /admin عبر ?action=). */
function QuickAction({ href, label, icon, match, pathname }: { href: string; label: string; icon: React.ReactNode; match: string; pathname: string }) {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const active = pathname.startsWith("/admin") && search.includes(match);
  return <a href={routePath(href)} className={active ? "nav-link active" : "nav-link"}>{icon}<span>{label}</span></a>;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const user = useAuthGuard();
  useEffect(() => { setMounted(true); }, []);
  const shellUser = mounted ? user : null;
  const isAdmin = !!shellUser && (shellUser.role === "admin" || shellUser.role === "supervisor");
  const isViewer = shellUser?.role === "viewer";
  const supervisorCanViewAdmin = shellUser?.role === "supervisor" ? canDo(shellUser, "view") : true;
  const nav = !mounted ? null : (isAdmin && supervisorCanViewAdmin ? adminItems : isViewer || (isAdmin && !supervisorCanViewAdmin) ? viewerItems : driverItems);
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
          {nav?.map(([href, label, Icon]) => {
            const [base, query] = href.split("?");
            const pathMatch = pathname === base || pathname.startsWith(base + "/");
            const search = typeof window !== "undefined" ? window.location.search : "";
            const active = pathMatch && (query ? search.includes(query) : base === "/admin" ? !search.includes("tab=") : true);
            return <a key={href} href={routePath(href)} className={active ? "nav-link active" : "nav-link"}><Icon size={19}/><span>{label}</span></a>;
          })}
        </nav>
        {isAdmin && supervisorCanViewAdmin && (
          <div className="sidebar-quick">
            <div className="sidebar-quick-title">إجراءات سريعة</div>
            <QuickAction href="/admin?action=backup" label="نسخ احتياطي للبيانات" icon={<ArchiveRestore size={19} />} match="action=backup" pathname={pathname} />
            <QuickAction href="/admin?action=plan" label="تخطيط رحلة للسائق" icon={<BusFront size={19} />} match="action=plan" pathname={pathname} />
          </div>
        )}
        <div className="sidebar-footer"><div className="user-chip"><div className="avatar"><UserRound size={18}/></div><div><strong>{shellUser?.full_name || "المستخدم"}</strong><small>{roleLabel(shellUser?.role)}</small></div></div><button className="logout-link" onClick={() => { logout(); clearLocalSession(); clearCredentials(); window.location.assign("/"); }}><LogOut size={18}/>خروج</button></div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}