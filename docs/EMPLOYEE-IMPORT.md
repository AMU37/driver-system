# استيراد الموظفين

يمكن للمشرف/المدير إدخال بيانات الموظفين الحقيقية إلى النظام بطريقتين:

## 1) من الواجهة (الأسهل)

1. سجّل الدخول بحساب مشرف أو مدير.
2. افتح "إدارة النظام" ثم تبويب **الموظفون**.
3. ارفع ملف CSV أو Excel وأكّد.
4. تظهر نتيجة الاستيراد (جديد / محدث / مرفوض).

## 2) عبر الواجهة البرمجية (لـ Power Automate / مزامنة تلقائية)

```http
POST /api/admin/employees/import
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

مع مفتاح `file`.

أو المزامنة عبر نقطة التكامل من Power Automate:

```http
POST /api/integration/employees/sync
X-Integration-Key: <MICROSOFT_INBOUND_API_KEY>
Content-Type: application/json

{ "employees": [ { "employee_code": "80045", "name": "أحمد علي محمد", ... } ] }
```

العملية **Upsert**: كود الموظف هو المفتاح؛ يُنشأ إن غاب، وتُحدَّث بياناته إن وُجد.

## تنسيق الملف

أعمدة اختيارية (بالإنجليزية أو العربية، بنفس أسماء الأعمدة دون رموز خاصة):

| العمود (بيانات إنجليزية) | العمود (عربي) | إلزامي |
|---|---|---|
| `employee_code` | كود الموظف / الكود | نعم |
| `name` | الاسم | نعم |
| `job_title` | الوظيفة / المسمى | لا |
| `department_name` | الإدارة / القسم | لا |
| `company_name` | الشركة | لا |
| `housing_location` | السكن | لا |

مثال CSV:

```csv
employee_code,name,job_title,department_name,company_name,housing_location
80045,أحمد علي محمد,مشرف,الإدارة المالية,YCSR,السكن A
```

## ملاحظات

- الأسماء ذات الأكواد العددية في Excel تُحوَّل تلقائياً إلى نص (لا تُقطع الأصفار).
- الأسطر الناقصة (كود أو اسم) تُسجَّل في قائمة "مرفوض".