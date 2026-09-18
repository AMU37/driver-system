# أمثلة API

## تسجيل الدخول

```http
POST /api/auth/login
Content-Type: application/json
```

```json
{"username":"driver1","password":"Driver@12345"}
```

## البحث عن موظف

```http
GET /api/driver/employees/search?code=80045
Authorization: Bearer <access-token>
```

## إضافة موظف للرحلة

```http
POST /api/driver/trips/1/employees
Authorization: Bearer <access-token>
Content-Type: application/json
```

```json
{"employee_code":"80045","visit_purpose":"employee"}
```

## إضافة موظف جديد

```http
POST /api/driver/trips/1/new-employees
Authorization: Bearer <access-token>
Content-Type: application/json
```

```json
{
  "employee_code":"90012",
  "name":"محمد جديد",
  "job_title":"فني",
  "department":"الصيانة",
  "company":"YCSR",
  "visit_purpose":"contractor",
  "notes":"بيانات أولية بانتظار المراجعة"
}
```
