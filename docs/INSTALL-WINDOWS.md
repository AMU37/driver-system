# تشغيل النظام على Windows بدون Docker

الإصدار الحالي يعتمد على Supabase PostgreSQL، لذلك لا تحتاج إلى Docker أو PostgreSQL محلياً.

## المتطلبات

- Python 3.13
- Node.js 24 LTS/current supported line
- حساب Supabase مع مشروع PostgreSQL

## 1) إعداد Backend

```powershell
cd backend
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

ثم افتح `backend\.env` وضع `DATABASE_URL` من Supabase Session Pooler.

## 2) إعداد Frontend

```powershell
cd ..\frontend
npm install
copy .env.example .env
```

## 3) التشغيل

PowerShell الأول:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

PowerShell الثاني:

```powershell
cd frontend
npm run dev
```

ثم:

- الواجهة: `http://localhost:3000`
- API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`

## 4) بيانات التجربة

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python seed.py
```

حسابات V1 التجريبية موجودة داخل README. لا تستخدمها في الإنتاج.
