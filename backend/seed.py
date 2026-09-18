from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models import Bus, Employee, Route, User, UserRole, Company

Base.metadata.create_all(bind=engine)
db = SessionLocal()
try:
    company = db.scalar(select(Company).where(Company.code == "YCSR"))
    if not company:
        company = Company(code="YCSR", name="الشركة - YCSR")
        db.add(company)

    users = [
        ("admin", "مدير النظام", "Admin@12345", UserRole.admin, None),
        ("supervisor", "مشرف النقل", "Supervisor@12345", UserRole.supervisor, None),
        ("driver1", "أحمد محمد - السائق", "Driver@12345", UserRole.driver, "DRV-001"),
    ]
    for username, full_name, password, role, driver_code in users:
        if not db.scalar(select(User).where(User.username == username)):
            db.add(User(username=username, full_name=full_name, password_hash=hash_password(password), role=role, driver_code=driver_code, company_code="YCSR"))

    for number in ["124", "127", "130"]:
        if not db.scalar(select(Bus).where(Bus.number == number)):
            db.add(Bus(number=number, company_code="YCSR", capacity=40))

    if not db.scalar(select(Route).where(Route.name == "الحوك - الشركة")):
        db.add(Route(name="الحوك - الشركة", origin="الحوك", destination="الشركة", company_code="YCSR"))
    if not db.scalar(select(Route).where(Route.name == "الميناء - الشركة")):
        db.add(Route(name="الميناء - الشركة", origin="الميناء", destination="الشركة", company_code="YCSR"))

    sample = [
        ("80045", "أحمد علي محمد", "مشرف", "الإدارة المالية", "YCSR", "السكن A"),
        ("80112", "محمد حسن علي", "مهندس", "الصيانة", "YCSR", "السكن B"),
        ("80231", "علي أحمد صالح", "فني", "الإنتاج", "YCSR", "السكن A"),
        ("80344", "خالد محمد", "مراقب", "الجودة", "YCSR", "السكن C"),
    ]
    for row in sample:
        if not db.scalar(select(Employee).where(Employee.employee_code == row[0])):
            db.add(Employee(employee_code=row[0], name=row[1], job_title=row[2], department_name=row[3], company_name=row[4], housing_location=row[5]))

    db.commit()
    print("Seed complete")
finally:
    db.close()
