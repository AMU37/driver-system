"use client";
import AppShell from "@/components/AppShell";
import { BookOpen, BusFront, FileCheck2, Info, ShieldCheck } from "lucide-react";
import { useAuthGuard } from "@/lib/authGuard";
import { snapshotMeta, TRIP_LOCATIONS } from "@/lib/offlineStore";

export default function AboutPage() {
  const user = useAuthGuard();
  if (!user) return null;
  const meta = snapshotMeta();
  return (
    <AppShell>
      <div className="page-head">
        <div>
          <div className="eyebrow">HELP & ABOUT</div>
          <h1>حول النظام والدليل</h1>
          <p>تعريف بالنظام، تعليمات الاستخدام، والتعريفات والضوابط.</p>
        </div>
      </div>
      <div className="about-content">
        <section className="section">
          <div className="section-title"><div><h2>حول النظام</h2><span>نظام رحلات سيارات الموظفين — الإصدار 1.0.1</span></div><Info size={18}/></div>
          <p className="muted">نظام مخصص لإدارة حركة نقل الموظفين بين مواقع العمل (الحديدة، الصليف، الولي، الزحيفي، الضبره، الشركة). يعمل التطبيق على أجهزة السائقين حتى بدون إنترنت، وتُحفظ قواعد البيانات الأساسية داخل التطبيق نفسه، وتُرسل بيانات الرحلات المكتملة تلقائياً إلى نظام مايكروسوفت (Power Automate) عند توفر الاتصال.</p>
          {meta && <div className="detail-grid"><div><span>تاريخ بيانات الجهاز</span><strong>{new Date(meta.built_at).toLocaleString("ar-EG")}</strong></div><div><span>الموظفون</span><strong>{meta.counts.employees ?? 0}</strong></div><div><span>الباصات</span><strong>{meta.counts.buses ?? 0}</strong></div><div><span>الرحلات المخططة</span><strong>{meta.counts.planned ?? 0}</strong></div></div>}
        </section>

        <section className="section">
          <div className="section-title"><div><h2>تعليمات الاستخدام</h2><span>خطوات التشغيل اليومية</span></div><BookOpen size={18}/></div>
          <div className="about-steps">
            <div className="about-step"><span>1</span><div><strong>تسجيل الدخول</strong><p>أدخل اسم المستخدم وكلمة المرور. عند غياب الشبكة يُستخدم رمز PIN المحلي (يُضبط من أول دخول) للعمل دون إنترنت.</p></div></div>
            <div className="about-step"><span>2</span><div><strong>الرحلات المخططة</strong><p>من صفحة «الرحلات المخططة» تُعرض رحلات اليوم؛ اضغط «تفاصيل» ثم «بدء الرحلة» أو غيّر الباص عند الاستبدال.</p></div></div>
            <div className="about-step"><span>3</span><div><strong>إنشاء رحلة يدوية</strong><p>من «الرئيسية» اضغط «إنشاء رحلة»، اختر الموقع الحالي، جهة الرحلة، نوع الرحلة (قادم/مغادر)، ورقم الباص ثم «بدء الرحلة».</p></div></div>
            <div className="about-step"><span>4</span><div><strong>إضافة الموظفين</strong><p>أدخل كود الموظف واضغط «بحث» ثم «إضافة للرحلة». الموظفون الجدد يدخلون ببياناتهم وتُرسل للمراجعة الإشرافية.</p></div></div>
            <div className="about-step"><span>5</span><div><strong>إكمال الرحلة والإرسال</strong><p>اضغط «إكمال الرحلة». تُرسل البيانات إلى النظام تلقائياً عند توفر الاتصال، أو يدوياً من «إرسال الرحلات المكتملة» أو صفحة الإعدادات.</p></div></div>
            <div className="about-step"><span>6</span><div><strong>إدارة النظام</strong><p>واجهة «إدارة النظام» مخصصة للمشرف ومدير النظام: تخطيط الرحلات، إدارة السائقين والباصات والموظفين والخطوط، والربط بنظام مايكروسوفت من «الإعدادات».</p></div></div>
          </div>
        </section>

        <section className="section">
          <div className="section-title"><div><h2>التعريفات</h2><span>المصطلحات المعتمدة في النظام</span></div><BookOpen size={18}/></div>
          <div className="about-defs">
            <div><strong>الرحلة</strong><span>حركة نقل مجموعة من الموظفين بين نقطتين في وقت محدد على باص معين.</span></div>
            <div><strong>الموقع الحالي / الجهة</strong><span>مواقع العمل المعتمدة: {TRIP_LOCATIONS.join("، ")}.</span></div>
            <div><strong>نوع الرحلة</strong><span>«مغادر» نقل الموظفين من الشركة إلى مواقع العمل، و«قادم» نقلهم من مواقع العمل إلى الشركة.</span></div>
            <div><strong>الموظف</strong><span>شخص مُسجل في النظام يُنقل بين المواقع، ويُعرَّف برمز وظيفي فريد.</span></div>
            <div><strong>المزامنة</strong><span>إرسال بيانات الرحلات المكتملة إلى نظام مايكروسوفت (Power Automate) عند توفر الاتصال بالشبكة.</span></div>
            <div><strong>رمز PIN</strong><span>رمز محلي مكوّن من 4 أرقام يسمح بالدخول على جهاز معين دون اتصال بالشبكة.</span></div>
            <div><strong>البيانات المدمجة</strong><span>نسخة من قاعدة البيانات الأساسية (الموظفون والباصات والرحلات) تُخزَّن داخل التطبيق عند البناء.</span></div>
          </div>
        </section>

        <section className="section">
          <div className="section-title"><div><h2>الضوابط والالتزام</h2><span>ممارسات وفق الأنظمة والمعايير العالمية</span></div><ShieldCheck size={18}/></div>
          <div className="about-defs">
            <div><strong><BusFront size={16} style={{ verticalAlign: "-3px" }}/> سلامة النقل البري</strong><span>تُطبق ممارسات موافقة لتوجهات إدارة سلامة النقل البري (ISO 39001): توثيق كل رحلة بوقت البدء والإكمال، وتحديد السائق والباص والمسار والجهة.</span></div>
            <div><strong><ShieldCheck size={16} style={{ verticalAlign: "-3px" }}/> أمن المعلومات</strong><span>تُتبع مبادئ حماية البيانات وفق ISO/IEC 27001: لا تُخزَّن كلمات المرور في التطبيق، وتُرسل البيانات عبر اتصالات مشفرة (HTTPS) عند توفرها.</span></div>
            <div><strong><FileCheck2 size={16} style={{ verticalAlign: "-3px" }}/> حماية البيانات الشخصية</strong><span>تُعالج بيانات الموظفين لأغراض التشغيل فقط وفق مبادئ تقليل البيانات، وتُحفظ محلياً على الجهاز ولا تُشارك إلا لغرض إرسال الرحلات إلى النظام المعتمد.</span></div>
          </div>
        </section>

        <div className="hint" style={{ marginTop: 14 }}>لضبط رابط نظام مايكروسوفت (Power Automate) أو رابط الخادم الحي، استخدم صفحة «الإعدادات» المتاحة للمشرف ومدير النظام.</div>
      </div>
    </AppShell>
  );
}