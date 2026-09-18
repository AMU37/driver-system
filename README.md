# نظام رحلات السائقين — V1.0.1

نظام ويب متكامل لإدارة رحلات نقل الموظفين، مبني بفصل مستقل بين Backend وFrontend، مع PostgreSQL على Supabase وتكامل REST مع Microsoft / Power Automate، ومجهز للنشر على Render.

## البنية المعتمدة

- Backend: Python 3.13 + FastAPI + SQLAlchemy + psycopg
- Frontend: Next.js + TypeScript + React + RTL
- Database: Supabase PostgreSQL
- Deployment: Render Native Web Services (بدون Docker)
- Integration: Microsoft Power Automate / HTTP API
- Authentication: JWT access + refresh tokens

## المشروع

```text
driver-transport-system/
├── backend/                 # FastAPI
├── frontend/                # Next.js
├── docs/                    # المواصفات ودليل النشر
├── scripts/                 # أدوات Windows
├── render.yaml              # Blueprint للنشر على Render
├── VERSION.txt
└── README.md
```

## النشر على Render

1. ارفع المشروع إلى GitHub.
2. أنشئ Project في Supabase.
3. خذ `Session pooler` connection string من `Supabase -> Connect`.
4. في Render اختر `New -> Blueprint` واربط مستودع GitHub.
5. عند أول مزامنة، أدخل `DATABASE_URL` فقط عندما يطلبه Render.
6. Render ينشئ خدمتي Backend وFrontend من `render.yaml` ويربطهما تلقائياً.

راجع `docs/RENDER-DEPLOY.md`.

## التشغيل المحلي بدون Docker

### Backend

```powershell
cd backend
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8001
```

### Frontend

في PowerShell آخر:

```powershell
cd frontend
npm install
copy .env.example .env
npm run dev -- -p 3333
```

ثم افتح `http://localhost:3333`.

## الأدوار

- **المشرف/المدير**: تخطيط الرحلات للسائقين، إدارة واستيراد الموظفين، اعتماد/رفض الموظفين الجدد.
- **السائق**: يبدأ رحلاته المخططة، ويضيف الموظفين الصاعدين، ويكمل الرحلة، وينقلها إلى مكتب مايكروسوفت.

## بيانات الموظفين

يمكن استيراد ملف الموظفين الحقيقي (CSV أو Excel) من صفحة "إدارة النظام → الموظفون"، أو عبر:

```http
POST /api/admin/employees/import
Authorization: Bearer <token>
Content-Type: multipart/form-data
file: employees.csv | employees.xlsx
```

الأعمدة المدعومة: `employee_code, name, job_title, department_name, company_name, housing_location` (بالإنجليزية أو العربية). راجع `docs/EMPLOYEE-IMPORT.md`.

## البيانات التجريبية

بعد تشغيل Backend:

```powershell
cd backend
python seed.py
```

الحسابات التجريبية في بيئة التطوير:

| الدور | المستخدم | كلمة المرور |
|---|---|---|
| سائق | driver1 | Driver@12345 |
| مشرف | supervisor | Supervisor@12345 |
| مدير | admin | Admin@12345 |

غيّر كلمات المرور قبل الاستخدام الفعلي.

## Microsoft / Power Automate

يبقى التكامل معطلاً في البداية:

```env
MICROSOFT_ENABLED=false
```

بعد تجهيز التدفق، ضع رابط HTTP trigger في `MICROSOFT_OUTBOUND_URL` ثم فعّل التكامل. استقبال الرحلات المخططة يتم عبر `POST /api/integration/planned-trips` باستخدام `X-Integration-Key`.

## الأمان

- لا ترفع `.env` إلى GitHub.
- كلمة مرور Supabase لا توضع في Frontend.
- استخدم HTTPS على Render.
- استخدم Session pooler من Supabase للاتصال بين Backend وقاعدة البيانات.
- لا تستخدم حسابات التجربة في الإنتاج.
