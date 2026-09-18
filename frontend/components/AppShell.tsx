"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BusFront, CalendarClock, ClipboardList, History, LayoutDashboard, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { getStoredUser, logout } from "@/lib/api";
import { useEffect, useState } from "react";

const items = [
  ["/dashboard", "الرئيسية", LayoutDashboard],
  ["/planned", "الرحلات المخططة", CalendarClock],
  ["/history", "سجل الرحلات", History]
] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  useEffect(() => { setUser(getStoredUser()); }, []);
  const isAdmin = user && (user.role === "admin" || user.role === "supervisor");
  const nav = isAdmin ? ([["/admin", "إدارة النظام", ShieldCheck]] as const) : items;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><div className="brand-mini"><BusFront size={20}/></div><div><strong>رحلات الموظفين</strong><small>Driver System V1.0</small></div></div>
        <nav>
          {nav.map(([href, label, Icon]) => <Link key={href} href={href} className={pathname.startsWith(href) ? "nav-link active" : "nav-link"}><Icon size={19}/><span>{label}</span></Link>)}
        </nav>
        <div className="sidebar-footer"><div className="user-chip"><div className="avatar"><UserRound size={18}/></div><div><strong>{user?.full_name || "المستخدم"}</strong><small>{user?.role === "driver" ? "سائق" : user?.role === "supervisor" ? "مشرف" : "مدير"}</small></div></div><button className="logout-link" onClick={() => { logout(); router.push("/"); }}><LogOut size={18}/>خروج</button></div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
