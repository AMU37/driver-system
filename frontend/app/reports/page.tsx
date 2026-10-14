"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import AnalyticsCharts from "@/components/AnalyticsCharts";
import { getAdminTripReports, getNewEmployees } from "@/lib/api";
import { useAuthGuard } from "@/lib/authGuard";
import {
  downloadContent, downloadTable, openReportTripWhatsApp, openWhatsAppText,
  printTableReport, printTripReport, purposeLabelOf, reportEmployeeStatus, reportRouteLabel,
  reportStatusLabel, reportTripOf, reportTripText, reportsToXlsText, tableToText, tableToXlsText,
} from "@/lib/export";
import { Copy, Eye, FileSpreadsheet, MessageCircle, Printer, RefreshCw, TrendingUp, UserCheck, Users } from "lucide-react";

type Report = any;

function isNonEmployee(p: any): boolean {
  return p.is_employee === false || p.source === "non_employee";
}

export default function ReportsPage() {
  useAuthGuard(["viewer", "admin", "supervisor"]);
  const [reports, setReports] = useState<Report[]>([]);
  const [newEmployees, setNewEmployees] = useState<any[]>([]);
  const [viewReport, setViewReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [r, n] = await Promise.allSettled([getAdminTripReports(), getNewEmployees()]);
      if (r.status === "fulfilled") setReports(r.value ?? []);
      else setError("تعذر تحميل تقارير الرحلات — تحقق من الاتصال بالخادم.");
      if (n.status === "fulfilled") setNewEmployees(n.value ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const totals = (() => {
    let passengers = 0;
    let nonEmployees = 0;
    let review = 0;
    for (const r of reports) {
      const { employees } = reportTripOf(r);
      passengers += employees.length;
      nonEmployees += employees.filter(isNonEmployee).length;
      review += employees.filter((p: any) => p.needs_review).length;
    }
    return { trips: reports.length, passengers, nonEmployees, review, newRequests: newEmployees.length };
  })();

  function summaryRows(): Array<Array<string | number>> {
    return [
      ["عدد الرحلات المسلّمة", totals.trips],
      ["إجمالي الصاعدين", totals.passengers],
      ["ركّاب غير موظفين", totals.nonEmployees],
      ["بحاجة لمراجعة", totals.review],
      ["طلبات موظفين جدّد", totals.newRequests],
    ];
  }

  const reportsRows = () =>
    reports.map((r) => [
      r.trip_number,
      r.driver_name || r.driver_username || "—",
      (r.raw && r.raw.trip && r.raw.trip.bus_number) || "—",
      reportRouteLabel(r),
      r.employee_count ?? 0,
      r.received_at ? new Date(r.received_at).toLocaleString("ar-EG") : "—",
      reportStatusLabel(r.integration_status),
    ]);
  const reportsHeaders = ["الرحلة", "السائق", "الباص", "الخط", "الصاعدون", "وصول التقرير", "الحالة"];

  const newEmpRows = () =>
    newEmployees.map((row) => {
      const req = row.request || {};
      return [req.employee_code || "—", req.name || "—", req.coming_from || "—", req.summoned_department || "—", req.job_title || "—", req.company || "—", row.trip_number, row.created_by_name || "—", req.status || "—"];
    });
  const newEmpHeaders = ["الكود", "الاسم", "الجهة القادم منها", "الجهة التي استدعته", "الوظيفة", "الشركة", "الرحلة", "أضافه", "الحالة"];

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <div className="eyebrow">REPORTS &amp; SUMMARIES</div>
          <h1>التقارير والخلاصات</h1>
          <p>استعراض واطلاع فقط — يمكنك تصدير التقارير والخلاصات (Excel / PDF / واتساب) دون أي إضافة أو تعديل.</p>
        </div>
        <div className="row-actions">
          <button className="secondary-btn" onClick={load} disabled={loading}><RefreshCw size={16} /> {loading ? "جارٍ التحديث..." : "تحديث"}</button>
        </div>
      </div>
      {error && <div className="alert danger">{error}</div>}
      {msg && <div className="alert success">{msg}</div>}

      <div className="stats-grid">
        <div className="metric"><TrendingUp size={20} /><div><span>الرحلات المسلّمة</span><strong>{totals.trips}</strong></div></div>
        <div className="metric"><Users size={20} /><div><span>إجمالي الصاعدين</span><strong>{totals.passengers}</strong></div></div>
        <div className="metric"><Users size={20} /><div><span>ركّاب غير موظفين</span><strong>{totals.nonEmployees}</strong></div></div>
        <div className="metric"><UserCheck size={20} /><div><span>طلبات موظفين جدّد</span><strong>{totals.newRequests}</strong></div></div>
      </div>

      <AnalyticsCharts reports={reports} onRefresh={load} />

      <section className="section">
        <div className="section-title">
          <div><h2>خلاصة عامة</h2><span>ملخّص أرقام الرحلات والصاعدين — قابل للتصدير والطباعة.</span></div>
          <div className="row-actions">
            <button className="secondary-btn" onClick={() => downloadContent("خلاصة-التقارير.xls", tableToXlsText("الخلاصة", ["البند", "القيمة"], summaryRows()), "application/vnd.ms-excel")}><FileSpreadsheet size={16} /> Excel</button>
            <button className="secondary-btn" onClick={() => printTableReport("خلاصة التقارير", `عدد الرحلات: ${totals.trips}`, ["البند", "القيمة"], summaryRows())}><Printer size={16} /> طباعة / PDF</button>
            <button className="secondary-btn" onClick={() => openWhatsAppText(tableToText("خلاصة التقارير", `${totals.trips} رحلة`, ["البند", "القيمة"], summaryRows()))}><MessageCircle size={16} /> واتساب</button>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title">
          <div><h2>تقارير الرحلات</h2><span>التقارير الواصلة من أجهزة السائقين — اضغط «عرض» لاستعراض كامل مع التصدير.</span></div>
          <div className="row-actions">
            <button className="secondary-btn" onClick={() => downloadContent("تقارير-الرحلات.xls", reportsToXlsText(reports), "application/vnd.ms-excel")}><FileSpreadsheet size={16} /> Excel</button>
            <button className="secondary-btn" onClick={() => printTableReport("تقارير الرحلات", `عدد التقارير: ${reports.length}`, reportsHeaders, reportsRows())}><Printer size={16} /> طباعة / PDF</button>
            <button className="secondary-btn" onClick={() => downloadTable("تقارير الرحلات", "تقارير-الرحلات.xls", reportsHeaders, reportsRows())}><FileSpreadsheet size={16} /> تصدير الجدول</button>
          </div>
        </div>
        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead><tr>{reportsHeaders.map((h) => <th key={h}>{h}</th>)}<th>الإجراء</th></tr></thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.trip_number}</strong></td>
                    <td>{r.driver_name || r.driver_username || "—"}</td>
                    <td>{(r.raw && r.raw.trip && r.raw.trip.bus_number) || "—"}</td>
                    <td>{reportRouteLabel(r)}<small>{(r.raw && r.raw.trip && r.raw.trip.trip_type) ? `النوع: ${r.raw.trip.trip_type}` : ""}</small></td>
                    <td>{r.employee_count ?? 0}</td>
                    <td>{r.received_at ? new Date(r.received_at).toLocaleString("ar-EG") : "—"}</td>
                    <td><span className="status status-planned">{reportStatusLabel(r.integration_status)}</span></td>
                    <td><button className="secondary-btn" onClick={() => setViewReport(r)}><Eye size={15} />عرض</button></td>
                  </tr>
                ))}
                {!reports.length && <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>لا توجد تقارير بعد.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title">
          <div><h2>طلبات الموظفين الجدد</h2><span>بيانات الركّاب المضافين من غير الموظفين — للاطلاع فقط.</span></div>
          <div className="row-actions">
            <button className="secondary-btn" onClick={() => downloadTable("طلبات الموظفين", "طلبات-موظفين-جدد.xls", newEmpHeaders, newEmpRows())}><FileSpreadsheet size={16} /> Excel</button>
            <button className="secondary-btn" onClick={() => printTableReport("طلبات الموظفين الجدد", `العدد: ${newEmployees.length}`, newEmpHeaders, newEmpRows())}><Printer size={16} /> طباعة / PDF</button>
          </div>
        </div>
        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead><tr>{newEmpHeaders.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {newEmployees.map((row) => {
                  const req = row.request || {};
                  return (
                    <tr key={req.id}>
                      <td>{req.employee_code || "—"}</td>
                      <td><strong>{req.name || "—"}</strong></td>
                      <td>{req.coming_from || "—"}</td>
                      <td>{req.summoned_department || "—"}</td>
                      <td>{req.job_title || "—"}</td>
                      <td>{req.company || "—"}</td>
                      <td>{row.trip_number}</td>
                      <td>{row.created_by_name || "—"}</td>
                      <td>{req.status || "—"}</td>
                    </tr>
                  );
                })}
                {!newEmployees.length && <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>لا توجد طلبات.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {viewReport && (() => {
        const { trip, employees } = reportTripOf(viewReport);
        const f = (v: any) => (v ? new Date(v).toLocaleString("ar-EG") : "—");
        const meta: Array<[string, string]> = [
          ["السائق", viewReport.driver_name || viewReport.driver_username || "—"],
          ["الباص", trip.bus_number || "—"],
          ["الخط", reportRouteLabel(viewReport)],
          ...(trip.trip_type ? [["النوع", trip.trip_type] as [string, string]] : []),
          ...(trip.company_code ? [["الشركة", trip.company_code] as [string, string]] : []),
          ["البداية", f(trip.started_at)],
          ["الإكمال", f(trip.completed_at)],
          ["وصول التقرير", f(viewReport.received_at)],
          ["الحالة", reportStatusLabel(viewReport.integration_status)],
        ];
        return (
          <div className="modal-backdrop" onClick={() => setViewReport(null)}>
            <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <div><div className="eyebrow">TRIP REPORT</div><h2>تقرير رحلة {viewReport.trip_number}</h2></div>
                <button className="icon-btn" onClick={() => setViewReport(null)}>×</button>
              </div>
              <div className="stack-lg">
                <div className="report-meta">
                  {meta.map(([k, v]) => <div className="report-meta-item" key={k}><span>{k}</span><strong>{v}</strong></div>)}
                </div>
                <h3 className="report-list-title">الصاعدون ({employees.length})</h3>
                <div className="table-scroll" style={{ maxHeight: 320 }}>
                  <table>
                    <thead><tr><th>#</th><th>الكود</th><th>الاسم</th><th>الجهة القادم منها</th><th>الجهة التي استدعته</th><th>الإدارة</th><th>الشركة</th><th>الوظيفة</th><th>الغرض</th><th>الحالة</th></tr></thead>
                    <tbody>
                      {employees.map((p: any, i: number) => {
                        const nonEmp = isNonEmployee(p);
                        return (
                          <tr key={`${p.employee_code}-${i}`}>
                            <td>{i + 1}</td>
                            <td>{p.employee_code || "—"}</td>
                            <td><strong>{p.name || "—"}</strong></td>
                            <td>{p.coming_from || (nonEmp ? (p.company || "—") : "—")}</td>
                            <td>{p.summoned_department || (nonEmp ? (p.department || "—") : "—")}</td>
                            <td>{nonEmp ? "—" : (p.department || "—")}</td>
                            <td>{nonEmp ? "—" : (p.company || "—")}</td>
                            <td>{p.job || "—"}</td>
                            <td>{purposeLabelOf(p.visit_purpose)}</td>
                            <td>{reportEmployeeStatus(p)}</td>
                          </tr>
                        );
                      })}
                      {!employees.length && <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--muted)", padding: 16 }}>لم تُسجَّل قائمة صاعدين مع هذا التقرير.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="modal-actions" style={{ flexWrap: "wrap" }}>
                  <button className="secondary-btn" onClick={() => openReportTripWhatsApp(viewReport)}><MessageCircle size={16} /> إرسال واتساب</button>
                  <button className="secondary-btn" onClick={() => printTripReport(viewReport)}><Printer size={16} /> طباعة / PDF</button>
                  <button className="secondary-btn" onClick={() => {
                    try { navigator.clipboard.writeText(reportTripText(viewReport)); setMsg("تم نسخ نص التقرير."); }
                    catch { setMsg("تعذر النسخ التلقائي — استخدم الطباعة أو واتساب."); }
                  }}><Copy size={16} /> نسخ النص</button>
                  <button className="primary-btn" onClick={() => setViewReport(null)}>إغلاق</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </AppShell>
  );
}
