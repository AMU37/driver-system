# التحديثات التلقائية لتطبيق الجوال (OTA)

الهدف: عندما يتغيّر أي شيء في واجهة الويب (HTML/CSS/JS) أو منطق العمل داخل
`frontend/`، يصل التحديث إلى أجهزة السائقين **تلقائياً** عند أول تشغيل أو عودة
للتطبيق — دون إعادة بناء APK أو إرساله لهم مرة أخرى.

## كيف تعمل

```text
npm run build   →   frontend/dist
npm run bundle  →   backend/updates/web-<version>.zip + latest.json
        ↓
   git push  →  Render ينشر الخادم + الحزمة
        ↓
التطبيق يسأل POST /api/app/updates عند كل إقلاع/عودة للخلفية
        ↓
إن وُجدت نسخة أحدث: يحمّل /api/app/bundle/web-<version>.zip
        ↓
يفك الضغط ويتحقق من SHA-256، ثم يُطبّق عند خروج التطبيق للخلفية
```

المكوّنات:

| المكوّن | الملف |
| --- | --- |
| إضافة التحديث على الجهاز | `frontend/node_modules/@capgo/capacitor-updater` (مثبّتة في `package.json`) |
| إعدادات الإضافة | `frontend/capacitor.config.ts` → `plugins.CapacitorUpdater` |
| إشعار جاهزية الويب | `frontend/components/NativeUpdater.tsx` (مضمّن في `app/layout.tsx`) |
| بناء الحزمة | `frontend/scripts/make-web-bundle.mjs` (`npm run bundle`) |
| خادم الحزم | `backend/app/api/app_updates.py` |
| الحزمة المنشورة | `backend/updates/web-<version>.zip` + `backend/updates/latest.json` |

الإعداد في `capacitor.config.ts`:

- `autoUpdate: "atBackground"` — يفحص عند كل عودة للتطبيق، ويُطبّق التحديث عند
  خروجه للخلفية، فلا يُقاطع السائق في منتصف رحلة.
- `updateUrl` يشير إلى `https://driver-system-mcku.onrender.com/api/app/updates`.
- `statsUrl` و `channelUrl` فارغان: لا اتصال بأي خادم خارجي.
- `appReadyTimeout: 20000` — إن لم تُقلع النسخة الجديدة بنجاح خلال المهلة،
  ترجع الإضافة تلقائياً للنسخة السابقة (حماية من حزمة معطوبة).

## إصدار تحديث جديد (الروتين المعتاد)

```powershell
cd frontend
npm run build          # يبني الواجهة إلى dist
npm run bundle         # ينتج backend/updates/web-<version>.zip + latest.json

cd ..
git add -A && git commit -m "web update <version>" && git push
```

بعد انتهاء Render من النشر سيحصل السائقون على النسخة الجديدة تلقائياً. لا حاجة
لأي إجراء على الأجهزة.

مهم: `npm run bundle` يقرأ الرقم من `VERSION.txt`. لتغيير رقم النسخة:

1. حدّث `VERSION.txt`.
2. حدّث `APP_VERSION` في `backend/app/main.py`.
3. حدّث `frontend/app/about/page.tsx`.
4. ثم `npm run build && npm run bundle`.

الرقم يجب أن يتغيّر في كل إصدار: الإضافة تقارن النسخ كنصوص، فإن بقيت كما هي
فلن يُحمَّل شيء.

## متى نحتاج APK جديد (استثناء)

التحديث التلقائي يشمل **ملفات الويب فقط**. يلزم APK جديد عند:

- إضافة/ترقية إضافة Capacitor أصلية (مثل الكاميرا، الملفات، الإشعارات).
- تغيير `appId` أو صلاحيات `AndroidManifest.xml`.
- تغيير `versionCode` في `frontend/android/app/build.gradle`.
- تغيير إعدادات الإضافة نفسها في `capacitor.config.ts` (تُقرأ من الحزمة الأصلية).

في هذه الحالات فقط:

```powershell
cd frontend
npm run build
npx cap sync android
cd android
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat clean assembleDebug
```

الملف الناتج: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`.
`clean` ضروري، وإلا بقي حجم زائد داخل APK بعد تقليص الأصول.

## فحص الخادم يدوياً

```powershell
# بيان آخر نسخة منشورة
Invoke-RestMethod http://127.0.0.1:8001/api/app/latest

# محاكاة جهاز على نسخة قديمة — يجب أن يرجع version/url/checksum
Invoke-RestMethod http://127.0.0.1:8001/api/app/updates -Method POST `
  -ContentType "application/json" -Body '{"version_name":"builtin","version_build":"1.0.11"}'

# جهاز محدّث — يجب ألا يرجع version
Invoke-RestMethod http://127.0.0.1:8001/api/app/updates -Method POST `
  -ContentType "application/json" -Body '{"version_name":"1.0.12","version_build":"1.0.12"}'
```

على الخادم المنشور استبدل `http://127.0.0.1:8001` بـ
`https://driver-system-mcku.onrender.com`. الروابط المُرجَعة يجب أن تكون `https`
لأن الإضافة ترفض غير المشفّر افتراضياً.

## التراجع (Rollback)

1. احتفظ بحزمة النسخة السابقة: `npm run bundle` يبقي آخر 3 حزم فقط.
2. للرجوع: عدّل `backend/updates/latest.json` ليشير إلى النسخة السابقة
   (`version` و`file` و`checksum` و`size`)، ثم ارفع وادفع. ستلتقطها الأجهزة في
   الفحص التالي.
3. إن كانت الحزمة نفسها معطوبة (لا تُقلع)، ترجع الإضافة تلقائياً للنسخة
   السابقة لأن `notifyAppReady()` لم يصل خلال `appReadyTimeout`.
4. الأسوأ حالةً: إعادة تثبيت APK — لكن هذا لا يحدث إلا إذا تغيّر الغلاف الأصلي.

## ملاحظات أمنية

- الحزم تُخدَّم عبر HTTPS فقط، ويُتحقق من SHA-256 قبل التطبيق.
- `statsUrl` فارغ: لا تُرسَل أي بيانات استخدام إلى Capgo أو غيره.
- `/api/app/updates` و`/api/app/bundle/*` عامّان بلا مصادقة (كما تتطلب الإضافة)،
  ولا يكشفان سوى نسخة الويب العامة نفسها التي يراها أي متصفح.
- لا تضع أسراراً في `frontend/dist` أو في متغيّرات `NEXT_PUBLIC_*`؛ فهي تُشحن
  داخل الحزمة.
