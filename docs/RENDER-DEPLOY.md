# النشر على Render + Supabase

هذه هي البنية المعتمدة للإصدار V1.0.1:

```text
Browser / Mobile
      |
      v
Next.js Frontend (Render)
      |
      v
FastAPI Backend (Render)
      |
      v
Supabase PostgreSQL
      |
      +--> Microsoft Power Automate / API
```

## 1) ارفع المشروع إلى GitHub

بعد فك ضغط المشروع، أنشئ مستودع GitHub وارفع مجلد المشروع كاملاً. ملف `render.yaml` موجود في جذر المستودع.

## 2) أنشئ مشروع Supabase

من Supabase افتح `Connect` واختر `Session pooler`، ثم انسخ connection string. هذا الخيار مناسب عندما يحتاج Backend إلى الاتصال من بيئة IPv4.

ضع كلمة مرور قاعدة البيانات في Render وليس داخل Git.

## 3) أنشئ Blueprint على Render

من Render اختر `New` ثم `Blueprint`، واربط مستودع GitHub الذي يحتوي على `render.yaml`. سيقرأ Render الخدمتين من الملف:

- `driver-transport-api` — Python/FastAPI
- `driver-transport-web` — Next.js

Render يدعم نشر الخدمات داخل مستودع واحد باستخدام `rootDir`، وتعمل أوامر البناء والتشغيل بالنسبة إلى مجلد كل خدمة.

## 4) عند إنشاء Blueprint

سيطلب Render المتغير السري:

```text
DATABASE_URL
```

الصقه من Supabase Session Pooler، مثال عام:

```text
postgresql://postgres.PROJECT_REF:PASSWORD@POOLER_HOST:5432/postgres?sslmode=require
```

الكود يحوّل تلقائياً `postgresql://` إلى صيغة SQLAlchemy `postgresql+psycopg://`.

وسيتم توليد `SECRET_KEY` و`MICROSOFT_INBOUND_API_KEY` تلقائياً بواسطة Render (زر **Generate**). 

> **أمان الإقلاع**: عند `ENVIRONMENT=production` يرفض Backend الإقلاع إذا كان `SECRET_KEY` ضعيفاً/معروفاً، وإذا كان `MICROSOFT_ENABLED=true` بمفتاح واردة ضعيف. تأكد أن القيم المولّدة سُجّلت (وليس الافتراضيات). التفاصيل: `docs/SECURITY.md`.
>
> **حسابات التجربة**: أي حساب يستخدم كلمة مرور افتراضية معروفة من `seed.py` يُضطر لتغييرها فوراً عند أول دخول في الإنتاج (يُحبس كل العمليات حتى ذلك).

## 5) عنوان Frontend وBackend

`render.yaml` يربط عنوان Backend بالـFrontend تلقائياً عبر `RENDER_EXTERNAL_URL`، ويربط عنوان Frontend بـCORS في Backend. لذلك لا تحتاج إلى نسخ روابط `onrender.com` يدوياً.

## 6) Microsoft / Power Automate

في البداية يبقى:

```text
MICROSOFT_ENABLED=false
```

وبعد تجهيز Power Automate، ضع رابط الـHTTP trigger في:

```text
MICROSOFT_OUTBOUND_URL
```

ثم غيّر:

```text
MICROSOFT_ENABLED=true
```

أما استقبال الرحلات المخططة فيستخدم:

```text
POST /api/integration/planned-trips
X-Integration-Key: <MICROSOFT_INBOUND_API_KEY>
```

## 7) الفحص بعد النشر

Backend:

```text
https://YOUR-API.onrender.com/health
```

Swagger:

```text
https://YOUR-API.onrender.com/docs
```

Frontend:

```text
https://YOUR-WEB.onrender.com
```

## ملاحظة مهمة

لا ترفع ملفات `.env` إلى GitHub. الحزمة المرسلة لا تحتوي على أسرار حقيقية؛ الموجود هو `.env.example` فقط.
