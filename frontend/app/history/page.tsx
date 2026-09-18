"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import StatusBadge from "@/components/StatusBadge";
import { getMyTrips, type Trip } from "@/lib/api";
import Link from "next/link";

export default function HistoryPage() { const [items, setItems] = useState<Trip[]>([]); useEffect(() => { getMyTrips().then(setItems).catch(()=>{}); }, []); return <AppShell><div className="page-head"><div><div className="eyebrow">TRIP HISTORY</div><h1>سجل الرحلات</h1><p>جميع الرحلات التي تم تشغيلها من حسابك.</p></div></div><div className="table-card"><div className="table-scroll"><table><thead><tr><th>الرحلة</th><th>الباص</th><th>الخط</th><th>الموظفون</th><th>البداية</th><th>الحالة</th><th></th></tr></thead><tbody>{items.map(t=><tr key={t.id}><td><strong>{t.trip_number}</strong></td><td>{t.actual_bus_number || t.planned_bus_number}</td><td>{t.route_name}<small>{t.origin} → {t.destination}</small></td><td>{t.employee_count}</td><td>{t.started_at ? new Date(t.started_at).toLocaleTimeString("ar-EG", {hour:"2-digit", minute:"2-digit"}) : "—"}</td><td><StatusBadge status={t.status}/></td><td><Link className="secondary-btn" href={`/trips/${t.id}`}>عرض</Link></td></tr>)}</tbody></table></div></div></AppShell>; }
