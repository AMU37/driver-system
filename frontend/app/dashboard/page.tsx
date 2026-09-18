"use client";
import { useEffect, useState } from "react";
import { BusFront, CheckCircle2, Clock3, Users2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { getDashboard, type PlannedTrip, type Trip } from "@/lib/api";
import { ActiveCard, PlannedCard } from "@/components/TripCard";

export default function DashboardPage() {
  const [data, setData] = useState<{ upcoming: PlannedTrip[]; active_trip: Trip | null; stats: Record<string, number> } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { getDashboard().then(setData).catch(e => setError(e.message)); }, []);
  return <AppShell><div className="page-head"><div><div className="eyebrow">DRIVER PORTAL</div><h1>لوحة القيادة</h1><p>كل ما تحتاجه لتشغيل الرحلة من شاشة واحدة.</p></div><div className="online-pill"><span className="live-dot"></span>متصل</div></div>{error && <div className="alert danger">{error}</div>}{!data ? <div className="skeleton-grid"><div className="skeleton"></div><div className="skeleton"></div><div className="skeleton wide"></div></div> : <><div className="stats-grid"><div className="metric"><BusFront/><div><span>إجمالي الرحلات</span><strong>{data.stats.today_total}</strong></div></div><div className="metric"><CheckCircle2/><div><span>مكتملة</span><strong>{data.stats.completed}</strong></div></div><div className="metric"><Clock3/><div><span>مرحّلة</span><strong>{data.stats.transferred}</strong></div></div><div className="metric"><Users2/><div><span>الرحلة الحالية</span><strong>{data.active_trip?.employee_count ?? 0}</strong></div></div></div>{data.active_trip && <section className="section"><div className="section-title"><h2>الرحلة الحالية</h2></div><ActiveCard trip={data.active_trip}/></section>}<section className="section"><div className="section-title"><h2>الرحلات القادمة</h2><span>{data.upcoming.length} رحلات</span></div>{data.upcoming.length ? <div className="cards-grid">{data.upcoming.map(t => <PlannedCard key={t.id} trip={t}/>)}</div> : <div className="empty"><Clock3 size={30}/><strong>لا توجد رحلات قادمة</strong><span>ستظهر الرحلات القادمة عند استلامها وإتاحة وقتها.</span></div>}</section></>}</AppShell>;
}
