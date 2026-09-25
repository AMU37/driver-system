# دليل الأمان — نظام رحلات السائقين

خلاصة من تعزيزات أمنية أُجريت لتقييد سطح الهجوم وإغلاق الثغرات المكتشفة خلال المراجعة الأمنية.

## الفحص الأمني المعالج

| الثغرة | المعالجة | الموقع |
|---|---|---|
| مفتاح JWT افتراضي/معروف (`change-me-in-production`) → إمكانية تزوير توكن أي مستخدم | رفض الإقلاع في الإنتاج بأي مفتاح ضعيف/معروف (< 32 حرفاً)؛ تحذير في التطوير | `app/core/config.py` |
| حسابات تجريبية بكلمات مرور معروفة (admin/supervisor/driver1) | اكتشاف تلقائي عند بدء الخدمة في الإنتاج، وفرض `must_change_password` بحبس كل العمليات حتى التغيير | `app/main.py`، `app/api/deps.py` |
| Brute force على تسجيل الدخول | تحدّي معدل: 10 محاولات فاشلة/5د لكل (IP+مستخدم) + 60/5د لكل IP (مضاد تجربة أسماء المستخدمين)؛ تُصفّر عند نجاح الدخول | `app/core/ratelimit.py`، `app/api/auth.py` |
| مفتاح `/api/integration/*` معروف ويُقارن بـ`==` | مقارنة ثابتة الزمن `hmac.compare_digest`؛ رفض الإقلاع في الإنتاج بمفتاح ضعيف؛ تعطيل النقطة عند غياب المفتاح (503)؛ تحديد معدل 60/د لكل IP | `app/api/integration.py` |
| رفع ملفات خارج الحد (DoS) وحقن صيغ Excel (`=`, `+`, `-`, `@`) | سقف 5 ميجابايت (قراءة محصورة) و50,000 صف؛ تعطيل بدايات صيغ الخلايا بإضافة `'` | `app/api/admin.py`، `app/services/employees.py` |
| كشف `/docs` في الإنتاج | إغلاق `docs_url/redoc_url/openapi_url` عند `ENVIRONMENT=production` | `app/main.py` |
| غياب ترويسات الأمان | `X-Content-Type-Options: nosniff`، `X-Frame-Options: DENY`، `Referrer-Policy`، `Permissions-Policy`، و`Cache-Control: no-store` على كل `/api/*` (Backend + Next.js `headers()`) | `app/main.py`، `frontend/next.config.ts` |
| كلمات مرور ضعيفة | فرض 8 أحرف + حروف وأرقام عند الإنشاء والتغيير؛ `scrypt` مع سقف معرّفات الحساب المضبوطة | `app/schemas/schemas.py`، `app/core/security.py` |
| حبس الحساب عند التغيير الإجباري | العمود `users.must_change_password` + نقطة `/api/auth/change-password` + توجيه الواجهة تلقائياً | `app/api/auth.py`، الواجهة |
| كشف بيانات الدخول التجريبية خارج المحلي | عرض "حسابات التجربة" على صفحة الدخول فقط على المضيفات المحلية | `frontend/app/page.tsx` |

> ملاحظة: هناك نقطة واحدة متبقية لأنها تتطلب إعادة تصميم للجلسات: **تخزين التوكن في `localStorage`**. تقليلياً أُضيفت `Content-Security-Policy` وتوجيه "تغيير كلمة المرور عند الطلب"، لكن الانتقال إلى Cookies آمنة (`HttpOnly`) هو تطور مستقبلي مُوصى به.

## متطلبات الإنتاج (تُفرض تلقائياً عند الإقلاع)

```env
ENVIRONMENT=production
# قيمة عشوائية ≥ 32 حرفاً (في Render: المدير → Variables → Generate)
SECRET_KEY=...
# ضعها فقط إذا فعّلت التكامل القادم من Power Automate (≥ 24 حرفاً عشوائياً)
MICROSOFT_ENABLED=false
MICROSOFT_INBOUND_API_KEY=
```

- مع `ENVIRONMENT=production` + `SECRET_KEY` ضعيف/معروف → الخدمة **لن تعمل** (خطأ إقلاع واضح).
- مع `MICROSOFT_ENABLED=true` + مفتاح ضعيف → الخدمة **لن تعمل**.
- أي حساب بكلمة مرور من القائمة الافتراضية (`Admin@12345`, `Supervisor@12345`, `Driver@12345`) يُحرَّر ليُغيّر كلمته فوراً.

## نقاط تتعرض لتقييد المعدل

| النقطة | الحد |
|---|---|
| `POST /api/auth/login` | 10 فاشلة / 5 د لكل (IP+مستخدم)؛ 60 / 5 د لكل IP |
| `POST /api/auth/refresh` | 30 / د لكل IP |
| `POST|GET /api/integration/*` | 60 / د لكل IP |

الرد عند التجاوز: `429` مع `Retry-After`. التحديد في الذاكرة الحية — مناسب للنسخة أحادية العقدة (Render free/standard)؛ عند التوسع متعدد العقد استُبدل بمخزن مشترك (Redis).

## حدود التحقق من الرفع

- حجم ملف الاستيراد: ≤ 5 ميجابايت (قراءة `read(MAX+1)` محصورة).
- عدد الصفوف: ≤ 50,000.
- طول كل حقل: ≤ 200 حرف (اقتطاع).
- قيم صيغ Excel تُفسَّد (تُنفَّذ كبيانات لا صيغ).

## الاختبارات

`backend/tests/test_security.py` يغطي: رفض التوكن المزوّر، تحديد معدل الدخول وإعادة التعيين بعد النجاح، مفتاح التكامل الخاطئ، حبس الحساب وفتحه بعد تغيير كلمة المرور، رفض تغيير كلمة المرور الحالية الخاطئة وضعيفة، تحييد حقن صيغ CSV، وكشف المفتاح الضعيف في الإنتاج.

```
cd backend
.venv\Scripts\python.exe -m pytest tests -q
```

## لا تفعل في الإنتاج

1. لا تضع `ENVIRONMENT=development`.
2. لا تستخدم `SECRET_KEY` من كود أو وثائق كمثال.
3. لا تحتفظ بحسابات التجربة بأسماء/كلمات معروفة — أنشئ مستخدمين حقيقيين.
4. لا تكشف `X-Integration-Key` في ملفات أو تدفقات Power Automate.
5. لا ترفع `backend/.env` أو `frontend/.env*` إلى المستودع (مستبعدة في `.gitignore`).