"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { getPlannedForDriver, isOnline, loadSnapshot, refreshLiveData, startLocalTrip, type SnapshotPlanned } from "@/lib/offlineStore";
import StatusBadge from "@/components/StatusBadge";
import { useAuthGuard } from "@/lib/authGuard";
import { routePath } from "@/lib/nav";

export default function PlannedPage() {
  const user = useAuthGuard(["driver"]);
  const [items, setItems] = useState<SnapshotPlanned[]>([]);
  const [selected, setSelected] = useState<SnapshotPlanned | null>(null);
  const [bus, setBus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    loadSnapshot()
      .then(async () => {
        if (!user) return;
        if (isOnline() && typeof window !== "undefined" && window.localStorage.getItem("access_token")) {
          await refreshLiveData(user).catch(() => {});
        }
setItems(getPlannedForDriver(user.username, user.driver_code));
      })
      .catch(e => setError(e.message));
  }, [user]);
  async function start() {
    if (!selected || !user) return;
    setLoading(true);
    try {
      const trip = startLocalTrip(selected, user.username, bus);
      setItems(getPlannedForDriver(user.username, user.driver_code));
      window.location.assign(routePath(`/trip?id=${encodeURIComponent(trip.id)}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر بدء الرحلة");
    } finally {
      setLoading(false);
    }
  }
  function show(item: SnapshotPlanned) {
    setSelected(item);
    setBus(item.bus_number || "");
  }
  return (
    <AppShell>
      <div className="page-head">
        <div>
          <div className="eyebrow">PLANNED TRIPS</div>
          <h1>الرحلات المخططة</h1>
          <p>رحلاتك المجدولة على هذا الجهاز. تبدأ الرحلة بالضغط على التفاصيل ثم بدء الرحلة.</p>
        </div>
      </div>
      {error && <div className="alert danger">{error}</div>}
      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>رقم الرحلة</th><th>التاريخ والوقت</th><th>الباص</th><th>خط السير</th><th>الحالة</th><th></th></tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td><strong>{item.trip_number}</strong></td>
                  <td>{new Date(item.scheduled_start_at).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td>{item.bus_number}</td>
                  <td>{item.route_name}<small>{item.origin} ← {item.destination}</small></td>
                  <td><StatusBadge status={item.status}/></td>
                  <td><button className="secondary-btn" onClick={() => show(item)}>تفاصيل</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">TRIP DETAILS</div>
                <h2>{selected.trip_number}</h2>
              </div>
              <button className="icon-btn" onClick={() => setSelected(null)}>×</button>
            </div>
            <div className="detail-grid">
              <div><span>الباص</span><strong>{selected.bus_number}</strong></div>
              <div><span>خط السير</span><strong>{selected.route_name}</strong></div>
              <div><span>الانطلاق</span><strong>{new Date(selected.scheduled_start_at).toLocaleString("ar-EG")}</strong></div>
              <div><span>الاتجاه</span><strong>{selected.origin} → {selected.destination}</strong></div>
            </div>
            <label className="field"><span>رقم الباص الفعلي (اختياري عند الاستبدال)</span><input value={bus} onChange={e => setBus(e.target.value)} placeholder={selected.bus_number || "124"}/></label>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => setSelected(null)}>إلغاء</button>
              <button className="primary-btn" onClick={start} disabled={loading}>{loading ? "جارٍ البدء..." : "بدء الرحلة"}</button>
            </div>
            <div className="hint">تسجل الرحلة على هذا الجهاز محلياً، وتُرسل البيانات للنظام عند اكتمالها وتوفر الاتصال.</div>
          </div>
        </div>
      )}
    </AppShell>
  );
}