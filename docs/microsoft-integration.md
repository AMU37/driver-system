# تكامل Microsoft / Power Automate

## 1. الاتجاهات

### Microsoft -> Driver System

Power Automate يرسل الرحلات المخططة إلى:

```http
POST /api/integration/planned-trips
X-Integration-Key: <secret>
Content-Type: application/json
```

Body:

```json
{
  "external_id": "MS-TRIP-10001",
  "trip_number": "TR-124-20260919-YCSR-001",
  "driver_code": "DRV-001",
  "bus_number": "124",
  "route_name": "الحوك - الشركة",
  "origin": "الحوك",
  "destination": "الشركة",
  "company_code": "YCSR",
  "scheduled_start_at": "2026-09-19T05:30:00+03:00",
  "release_hours": 8,
  "metadata": {
    "source": "microsoft",
    "planner": "transport-workflow"
  }
}
```

الاستجابة:

```json
{
  "created": true,
  "id": 1,
  "trip_number": "TR-124-20260919-YCSR-001",
  "status": "available",
  "release_at": "2026-09-18T21:30:00+03:00"
}
```

## 2. Microsoft -> Driver System: employee sync

يمكن كذلك مزامنة قاعدة الموظفين عبر:

```http
POST /api/integration/employees/sync
X-Integration-Key: <secret>
Content-Type: application/json
```

مثال:

```json
{
  "employees": [
    {"employee_code":"80045","name":"أحمد علي محمد","job_title":"مشرف","department_name":"الإدارة المالية","company_name":"YCSR","housing_location":"السكن A","is_active":true}
  ]
}
```

العملية Upsert: تنشئ الموظف إن لم يكن موجوداً، وتحدّث بياناته إن كان موجوداً.

## 3. Driver System -> Microsoft

عند ترحيل الرحلة، يرسل النظام Event باسم:

```text
trip.completed
```

مثال مبسط:

```json
{
  "event_type": "trip.completed",
  "trip": {
    "trip_id": "TR-124-20260919-YCSR-001",
    "internal_id": 25,
    "company_code": "YCSR",
    "driver_id": "USER-UUID",
    "bus_number": "124",
    "route": "الحوك - الشركة",
    "origin": "الحوك",
    "destination": "الشركة",
    "scheduled_start_at": "2026-09-19T05:30:00+03:00",
    "started_at": "2026-09-19T05:32:00+03:00",
    "completed_at": "2026-09-19T06:21:00+03:00",
    "employee_count": 27,
    "employees": [
      {
        "employee_code": "80045",
        "name": "أحمد علي محمد",
        "job": "مشرف",
        "department": "الإدارة المالية",
        "company": "YCSR",
        "housing_location": "السكن A",
        "visit_purpose": "employee",
        "boarded_at": "2026-09-19T05:40:00+03:00",
        "source": "employee_master",
        "needs_review": false
      }
    ]
  }
}
```

## 4. المقترح داخل Power Automate

1. HTTP Trigger.
2. التحقق من `X-Request-ID` ومن مصدر الطلب بحسب سياسة الشركة.
3. Parse JSON.
4. فحص `event_type`.
5. حفظ Header الرحلة.
6. حفظ ركاب الرحلة.
7. إرجاع HTTP 200 عند النجاح.
8. إرجاع 4xx/5xx عند الخطأ الواضح حتى يستطيع النظام إعادة المحاولة.

## 5. ملاحظات أمنية

- لا يوضع رابط Power Automate الحقيقي داخل Git.
- لا تحفظ أسرار التكامل في الكود.
- استخدم Secret Manager / Environment Variables.
- يفضل إضافة توقيع HMAC أو طبقة هوية مؤسسية عند توفر سياسة الشركة لذلك.
- لا تجعل endpoint الوارد مفتوحاً بدون حماية.
