# قائمة فحص قبل الإنتاج

- [ ] مشروع Supabase أُنشئ بنجاح.
- [ ] تم نسخ Session pooler connection string.
- [ ] `DATABASE_URL` أضيف في Render Secret.
- [ ] `SECRET_KEY` موجود وقوي.
- [ ] `MICROSOFT_ENABLED=false` حتى انتهاء اختبار التكامل.
- [ ] Backend `/health` يعيد `status=ok`.
- [ ] Frontend يفتح بدون أخطاء.
- [ ] تسجيل الدخول يعمل.
- [ ] رحلة مخططة تظهر للسائق.
- [ ] بدء الرحلة يعمل.
- [ ] البحث عن الموظف بالكود يعمل.
- [ ] الموظف الجديد ينتقل للمراجعة.
- [ ] إكمال الرحلة يعمل.
- [ ] ترحيل الرحلة يسجل Integration Log.
- [ ] بعد تجهيز Power Automate يتم تفعيل `MICROSOFT_ENABLED=true`.
- [ ] يتم اختبار استقبال رحلة مخططة من Microsoft.
- [ ] يتم اختبار إرسال رحلة مكتملة إلى Microsoft.
- [ ] تم تغيير حسابات التجربة قبل التشغيل الفعلي.
