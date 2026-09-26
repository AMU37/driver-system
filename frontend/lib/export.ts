import { isNativePlatform, type LocalTrip } from "@/lib/offlineStore";

export function esc(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar-EG", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return String(iso);
  }
}

function rs(cells: Array<{ v: string; t?: "String" | "Number" }>): string {
  return "<Row>" + cells.map((c) => `<Cell><Data ss:Type="${c.t || "String"}">${esc(c.v)}</Data></Cell>`).join("") + "</Row>";
}

function xlsHeader(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\r\n' +
    '<?mso-application progid="Excel.Sheet"?>\r\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'
  );
}

export function routeLabelOf(trip: LocalTrip): string {
  return trip.origin && trip.destination ? `${trip.origin} → ${trip.destination}` : (trip.route_name || "—");
}

export function tripToXlsText(trip: LocalTrip): string {
  const lines = [xlsHeader(), `<Worksheet ss:Name="رحلة ${esc(trip.trip_number)}">`, "<Table>"];
  lines.push(rs([{ v: "تقرير رحلة وسائل نقل الموظفين" }]));
  lines.push(rs([{ v: "رقم الرحلة" }, { v: trip.trip_number }]));
  lines.push(rs([{ v: "السائق" }, { v: trip.driver_username }]));
  lines.push(rs([{ v: "الباص" }, { v: trip.bus_number || trip.planned_bus_number || "—" }]));
  lines.push(rs([{ v: "الخط" }, { v: routeLabelOf(trip) }]));
  if (trip.trip_type) lines.push(rs([{ v: "نوع الرحلة" }, { v: trip.trip_type }]));
  lines.push(rs([{ v: "وقت البدء" }, { v: fmt(trip.started_at) }]));
  lines.push(rs([{ v: "وقت الإكمال" }, { v: fmt(trip.completed_at) }]));
  lines.push(rs([{ v: "عدد الصاعدين" }, { v: String(trip.passengers.length) }]));
  lines.push(rs([{ v: "" }]));
  lines.push(rs([{ v: "#" }, { v: "الكود" }, { v: "الاسم" }, { v: "الإدارة/الجهة" }, { v: "الشركة" }, { v: "الغرض" }, { v: "المصدر" }, { v: "الحالة" }]));
  trip.passengers.forEach((p, i) => {
    lines.push(rs([
      { v: String(i + 1), t: "Number" },
      { v: p.employee_code },
      { v: p.name },
      { v: p.department || "" },
      { v: p.company || "" },
      { v: p.visit_purpose || "" },
      { v: p.source || "" },
      { v: p.needs_review ? "للمراجعة" : "مؤكد" },
    ]));
  });
  lines.push("</Table>", "</Worksheet>", "</Workbook>");
  return lines.join("\r\n");
}

export function reportStatusLabel(s?: string): string {
  if (s === "success") return "مُرسل لنظام الإشعارات";
  if (s === "server_only") return "في النظام";
  if (s === "retrying") return "بانتظار إعادة الإرسال";
  if (s && s.startsWith("failed")) return "فشل الإرسال الخارجي";
  return "—";
}

export function reportsToXlsText(reports: any[]): string {
  const lines = [xlsHeader(), '<Worksheet ss:Name="رحلات السائقين">', "<Table>"];
  lines.push(rs([{ v: "#" }, { v: "الرحلة" }, { v: "السائق" }, { v: "الباص" }, { v: "الخط" }, { v: "الصاعدون" }, { v: "وصول التقرير" }, { v: "الحالة" }]));
  reports.forEach((r, i) => {
    const trip = (r.raw && r.raw.trip) || {};
    const route = trip.origin && trip.destination ? `${trip.origin} → ${trip.destination}` : (trip.route || "—");
    lines.push(rs([
      { v: String(i + 1), t: "Number" },
      { v: r.trip_number },
      { v: r.driver_name || r.driver_username || "—" },
      { v: trip.bus_number || "—" },
      { v: route },
      { v: String(r.employee_count ?? 0), t: "Number" },
      { v: fmt(r.received_at) },
      { v: reportStatusLabel(r.integration_status) },
    ]));
  });
  lines.push("</Table>", "</Worksheet>", "</Workbook>");
  return lines.join("\r\n");
}

export function downloadContent(filename: string, content: string, mime: string) {
  const blob = new Blob(["\ufeff" + content], { type: `${mime};charset=utf-8` });
  if (isNativePlatform()) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        window.open(String(reader.result), "_system", "noopener");
      } catch {
        /* ignore */
      }
    };
    reader.readAsDataURL(blob);
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
}

export function tripText(trip: LocalTrip): string {
  const lines = [
    `رحلة ${trip.trip_number}`,
    `السائق: ${trip.driver_username}`,
    `الباص: ${trip.bus_number || trip.planned_bus_number || "—"}`,
    `الخط: ${routeLabelOf(trip)}`,
  ];
  if (trip.trip_type) lines.push(`النوع: ${trip.trip_type}`);
  lines.push(`البداية: ${fmt(trip.started_at)}`);
  if (trip.completed_at) lines.push(`الإكمال: ${fmt(trip.completed_at)}`);
  lines.push(`عدد الصاعدين: ${trip.passengers.length}`);
  if (trip.passengers.length) {
    lines.push("الصاعدون:");
    trip.passengers.forEach((p, i) => {
      const who = p.name || (p.employee_code ? `كود ${p.employee_code}` : "غير موظف");
      const extra = p.employee_code && p.name ? ` (${p.employee_code})` : "";
      let note = "";
      if (p.source === "non_employee") note = p.company ? ` — ${p.company}${p.visit_purpose ? ` / ${p.visit_purpose}` : ""}` : " — غير موظف";
      else if (p.needs_review) note = " — للمراجعة";
      lines.push(`${i + 1}) ${who}${extra}${note}`);
    });
  }
  return lines.join("\n");
}

export function tripWhatsAppUrl(trip: LocalTrip): string {
  return "https://wa.me/?text=" + encodeURIComponent(tripText(trip));
}

export function openWhatsApp(trip: LocalTrip) {
  const url = tripWhatsAppUrl(trip);
  window.open(url, isNativePlatform() ? "_system" : "_blank", "noopener");
}

export function printTripPdf(trip: LocalTrip) {
  const w = window.open("", "_blank");
  if (!w) return;
  const rows = trip.passengers
    .map(
      (p, i) =>
        `<tr><td>${i + 1}</td><td>${esc(p.employee_code)}</td><td>${esc(p.name)}</td><td>${esc(p.department || "")}</td><td>${esc(p.company || "")}</td><td>${esc(p.visit_purpose || "")}</td><td>${p.needs_review ? "للمراجعة" : "مؤكد"}</td></tr>`
    )
    .join("");
  const route = routeLabelOf(trip);
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>رحلة ${esc(trip.trip_number)}</title>
<style>
 body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;margin:24px;color:#17202b}
 h1{font-size:20px;margin:0 0 4px}
 .meta{color:#55606e;font-size:13px;margin-bottom:14px;line-height:1.8}
 table{width:100%;border-collapse:collapse;font-size:13px}
 th,td{border:1px solid #cfd6dd;padding:8px 10px;text-align:right}
 th{background:#eef4ff}
 h2{font-size:15px;margin:20px 0 8px}
 @media print{body{margin:10mm}}
</style></head><body>
<h1>تقرير رحلة ${esc(trip.trip_number)}</h1>
<div class="meta">السائق: ${esc(trip.driver_username)} · الباص: ${esc(trip.bus_number || trip.planned_bus_number || "—")} · الخط: ${esc(route)}${trip.trip_type ? " · النوع: " + esc(trip.trip_type) : ""}</div>
<div class="meta">البداية: ${esc(fmt(trip.started_at))}${trip.completed_at ? " · الإكمال: " + esc(fmt(trip.completed_at)) : ""}</div>
<h2>الصاعدون (${trip.passengers.length})</h2>
<table><thead><tr><th>#</th><th>الكود</th><th>الاسم</th><th>الإدارة/الجهة</th><th>الشركة</th><th>الغرض</th><th>الحالة</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(() => {
    w.focus();
    w.print();
  }, 350);
}

/* ---- تنسيق تقارير الرحلات الواصلة من السائقين (للمشرف/المدير) ---- */

export function reportTripOf(report: any): { trip: Record<string, any>; employees: any[] } {
  const trip = (report && report.raw && report.raw.trip) || {};
  return { trip, employees: Array.isArray(trip.employees) ? trip.employees : [] };
}

export function reportRouteLabel(report: any): string {
  const { trip } = reportTripOf(report);
  return trip.origin && trip.destination ? `${trip.origin} → ${trip.destination}` : (trip.route || report.route || "—");
}

export function reportEmployeeStatus(p: any): string {
  if (p.needs_review) return "للمراجعة";
  if (p.is_employee === false || p.source === "non_employee") return "غير موظف";
  return "مؤكد";
}

export function reportTripText(report: any): string {
  const { trip, employees } = reportTripOf(report);
  const lines = [
    `تقرير رحلة ${report.trip_number}`,
    `السائق: ${report.driver_name || report.driver_username || "—"}`,
    `الباص: ${trip.bus_number || "—"}`,
    `الخط: ${reportRouteLabel(report)}`,
  ];
  if (trip.trip_type) lines.push(`النوع: ${trip.trip_type}`);
  if (trip.company_code) lines.push(`الشركة: ${trip.company_code}`);
  if (trip.scheduled_start_at) lines.push(`الانطلاق المخطط: ${fmt(trip.scheduled_start_at)}`);
  if (trip.started_at) lines.push(`البداية: ${fmt(trip.started_at)}`);
  if (trip.completed_at) lines.push(`الإكمال: ${fmt(trip.completed_at)}`);
  lines.push(`عدد الصاعدين: ${employees.length}`);
  if (employees.length) {
    lines.push("الصاعدون:");
    employees.forEach((p, i) => {
      const who = p.name || (p.employee_code ? `كود ${p.employee_code}` : "غير موظف");
      const extra = p.employee_code && p.name ? ` (${p.employee_code})` : "";
      const note = ` — ${reportEmployeeStatus(p)}`;
      lines.push(`${i + 1}) ${who}${extra}${note}`);
    });
  }
  return lines.join("\n");
}

export function reportTripWhatsAppUrl(report: any): string {
  return "https://wa.me/?text=" + encodeURIComponent(reportTripText(report));
}

export function openReportTripWhatsApp(report: any) {
  window.open(reportTripWhatsAppUrl(report), isNativePlatform() ? "_system" : "_blank", "noopener");
}

export function printTripReport(report: any) {
  const { trip, employees } = reportTripOf(report);
  const w = window.open("", "_blank");
  if (!w) return;
  const rows = employees
    .map(
      (p, i) =>
        `<tr><td>${i + 1}</td><td>${esc(p.employee_code || "")}</td><td>${esc(p.name || "—")}</td><td>${esc(p.department || "")}</td><td>${esc(p.company || "")}</td><td>${esc(p.job || "")}</td><td>${esc(p.housing_location || "")}</td><td>${esc(reportEmployeeStatus(p))}</td></tr>`
    )
    .join("");
  const route = reportRouteLabel(report);
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>رحلة ${esc(report.trip_number)}</title>
<style>
 body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;margin:24px;color:#17202b}
 h1{font-size:20px;margin:0 0 4px}
 .meta{color:#55606e;font-size:13px;margin-bottom:14px;line-height:1.8}
 table{width:100%;border-collapse:collapse;font-size:13px}
 th,td{border:1px solid #cfd6dd;padding:8px 10px;text-align:right}
 th{background:#eef4ff}
 h2{font-size:15px;margin:20px 0 8px}
 @media print{body{margin:10mm}}
</style></head><body>
<h1>تقرير رحلة ${esc(report.trip_number)}</h1>
<div class="meta">السائق: ${esc(report.driver_name || report.driver_username || "—")} · الباص: ${esc(trip.bus_number || "—")} · الخط: ${esc(route)}${trip.trip_type ? " · النوع: " + esc(trip.trip_type) : ""}${trip.company_code ? " · الشركة: " + esc(trip.company_code) : ""}</div>
<div class="meta">الانطلاق المخطط: ${esc(fmt(trip.scheduled_start_at))} · البداية: ${esc(fmt(trip.started_at))}${trip.completed_at ? " · الإكمال: " + esc(fmt(trip.completed_at)) : ""}</div>
<h2>الصاعدون (${employees.length})</h2>
<table><thead><tr><th>#</th><th>الكود</th><th>الاسم</th><th>الإدارة</th><th>الشركة</th><th>الوظيفة</th><th>السكن</th><th>الحالة</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(() => {
    w.focus();
    w.print();
  }, 350);
}