"use client";

import { usePathname } from "next/navigation";
import { BookOpen, BusFront, CalendarClock, History, LayoutDashboard, LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";
import { logout } from "@/lib/api";
import { clearLocalSession } from "@/lib/offlineStore";
import { useAuthGuard } from "@/lib/authGuard";
import { routePath } from "@/lib/nav";

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

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useAuthGuard();
  const isAdmin = user && (user.role === "admin" || user.role === "supervisor");
  const nav = isAdmin ? adminItems : driverItems;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><div className="brand-mini"><BusFront size={20}/></div><div><strong>رحلات الموظفين</strong><small>Driver System V1.0</small></div></div>
        <nav>
          {nav.map(([href, label, Icon]) => <a key={href} href={routePath(href)} className={pathname === href || pathname.startsWith(href + "/") ? "nav-link active" : "nav-link"}><Icon size={19}/><span>{label}</span></a>)}
        </nav>
        <div className="sidebar-footer"><div className="user-chip"><div className="avatar"><UserRound size={18}/></div><div><strong>{user?.full_name || "المستخدم"}</strong><small>{user?.role === "driver" ? "سائق" : user?.role === "supervisor" ? "مشرف" : "مدير"}</small></div></div><button className="logout-link" onClick={() => { logout(); clearLocalSession(); window.location.assign("/"); }}><LogOut size={18}/>خروج</button></div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}