"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import StatusBadge from "@/components/StatusBadge";
import { listLocalTrips, type LocalTrip } from "@/lib/offlineStore";
import { useAuthGuard } from "@/lib/authGuard";
import { routePath } from "@/lib/nav";

export default function HistoryPage() {
  const user = useAuthGuard(["driver"]);
  const [items, setItems] = useState<LocalTrip[]>([]);
  useEffect(() => { if (user) setItems(listLocalTrips(user.username)); }, [user]);
  return <AppShell><div className="page-head"><div><div className="eyebrow">TRIP HISTORY</div><h1>سجل الرحلات</h1><p>جميع الرحلات التي سُجلت على هذا الجهاز.</p></div></div><div className="table-card"><div className="table-scroll"><table><thead><tr><th>الرحلة</th><th>الباص</th><th>الخط</th><th>الموظفون</th><th>البداية</th><th>الحالة</th><th></th></tr></thead><tbody>{items.map(t => <tr key={t.id}><td><strong>{t.trip_number}</strong></td><td>{t.bus_number || t.planned_bus_number}</td><td>{t.route_name}<small>{t.origin} → {t.destination}</small></td><td>{t.passengers.length}</td><td>{t.started_at ? new Date(t.started_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) : "—"}</td><td><StatusBadge status={t.status}/></td><td><a className="secondary-btn" href={routePath(`/trip?id=${encodeURIComponent(t.id)}`)}>عرض</a></td></tr>)}</tbody></table></div></div>{!items.length && <div className="empty" style={{ marginTop: 16 }}><strong>لا توجد رحلات مسجلة بعد</strong><span>ابدأ رحلتك من صفحة الرحلات المخططة.</span></div>}</AppShell>; }