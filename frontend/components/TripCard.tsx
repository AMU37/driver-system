import Link from "next/link";
import { ArrowLeft, BusFront, Clock3, MapPin } from "lucide-react";
import StatusBadge from "./StatusBadge";
import type { PlannedTrip, Trip } from "@/lib/api";

export function PlannedCard({ trip }: { trip: PlannedTrip }) {
  return <div className="trip-card"><div className="trip-card-top"><div className="bus-icon"><BusFront size={21}/></div><StatusBadge status={trip.status}/></div><div className="trip-number">{trip.trip_number}</div><h3>{trip.route_name}</h3><div className="route-line"><MapPin size={15}/>{trip.origin} <ArrowLeft size={15}/> {trip.destination}</div><div className="trip-meta"><span><Clock3 size={15}/>{new Date(trip.scheduled_start_at).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })}</span><span><BusFront size={15}/>باص {trip.bus_number}</span></div><Link className="secondary-btn full" href={`/planned?id=${trip.id}`}>عرض الرحلة</Link></div>;
}

export function ActiveCard({ trip }: { trip: Trip }) {
  return <div className="active-card"><div><span className="live-dot"></span> الرحلة الحالية</div><strong>{trip.trip_number}</strong><div className="big-route">{trip.origin} <ArrowLeft size={22}/> {trip.destination}</div><div className="trip-meta"><span>الباص {trip.actual_bus_number || trip.planned_bus_number}</span><span>{trip.employee_count} موظف</span></div><Link className="primary-btn full" href={`/trips/${trip.id}`}>فتح الرحلة</Link></div>;
}
