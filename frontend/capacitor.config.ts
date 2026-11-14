import type { CapacitorConfig } from "@capacitor/cli";

// خادم تحديثات الحزمة (OTA). نفس خادم النظام؛ يمكن تجاوزه محلياً عبر
// APP_UPDATE_BASE عند اختبار التحديثات على نسخة تجريبية.
const UPDATE_BASE = (process.env.APP_UPDATE_BASE || "https://driver-system-mcku.onrender.com").replace(/\/+$/, "");

const config: CapacitorConfig = {
  appId: "com.ycs.drivertransport",
  appName: "نظام الرحلات",
  webDir: "dist",
  server: {
    androidScheme: "https",
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    // تحديثات تلقائية لطبقة الويب (HTML/JS/CSS) دون إعادة تثبيت APK.
    // atBackground: يفحص عند كل عودة للتطبيق، ويُطبّق التحديث عند خروجه
    // للخلفية — فلا يُقاطع السائق أثناء رحلة جارية.
    CapacitorUpdater: {
      autoUpdate: "atBackground",
      updateUrl: `${UPDATE_BASE}/api/app/updates`,
      // فحص دوري كل ١٥ دقيقة (القيمة بالثواني، والافتراضي 0 = معطّل) حتى
      // يصل التحديث لمن يترك التطبيق مفتوحاً طوال اليوم دون خروجه منه.
      periodCheckDelay: 900,
      // لا إحصاءات ولا قنوات خارجية: كل شيء عبر خادمنا.
      statsUrl: "",
      channelUrl: "",
      // مهلة إشعار جاهزية الويب قبل الرجوع التلقائي للنسخة السابقة.
      appReadyTimeout: 20000,
      resetWhenUpdate: true,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
    },
  },
};

export default config;
