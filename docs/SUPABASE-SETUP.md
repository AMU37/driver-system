# إعداد Supabase للنظام

يستخدم النظام Supabase كقاعدة PostgreSQL الرئيسية، بينما يبقى Backend Python هو المسؤول عن المصادقة والمنطق وقواعد العمل. لا يضع Frontend أي كلمة مرور لقاعدة البيانات.

## الاتصال

من Supabase: `Connect` -> `Session pooler`. انسخ الرابط كما يظهر في اللوحة. استخدم المنفذ `5432` لوضع Session pooler.

الصيغة العامة:

```text
postgresql://postgres.PROJECT_REF:PASSWORD@POOLER_HOST:5432/postgres?sslmode=require
```

يدعم التطبيق أيضاً مباشرة:

```text
postgresql+psycopg://...
```

إذا كان الرابط يبدأ بـ`postgresql://` أو `postgres://` فسيحوّله التطبيق تلقائياً إلى Dialect مناسب لـSQLAlchemy.

## لماذا Session pooler؟

لأن خدمة FastAPI على Render تحتاج اتصالاً موثوقاً من بيئة خادم وقد تكون البيئة IPv4. Session pooler خيار عملي لهذا السيناريو. لا تستخدم Transaction pooler هنا إلا بعد ضبط عميل PostgreSQL على تعطيل prepared statements.

## بعد وضع DATABASE_URL

تشغيل النظام محلياً ينشئ جداول V1.0 تلقائياً عبر SQLAlchemy عند بدء Backend.

في Render لا يوضع `DATABASE_URL` داخل Git أو `render.yaml`; يتم إدخاله كـsecret من لوحة Render.
