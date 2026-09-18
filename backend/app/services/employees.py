import csv
import io

from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Employee

_ALIASES = {
    "employeecode": "employee_code",
    "code": "employee_code",
    "كودالموظف": "employee_code",
    "الكود": "employee_code",
    "name": "name",
    "fullname": "name",
    "الاسم": "name",
    "اسمالموظف": "name",
    "jobtitle": "job_title",
    "job": "job_title",
    "الوظيفة": "job_title",
    "المسمي": "job_title",
    "المسمى": "job_title",
    "departmentname": "department_name",
    "department": "department_name",
    "الادارة": "department_name",
    "الإدارة": "department_name",
    "القسم": "department_name",
    "companyname": "company_name",
    "company": "company_name",
    "الشركة": "company_name",
    "housinglocation": "housing_location",
    "housing": "housing_location",
    "السكن": "housing_location",
}

_FIELDS = ["employee_code", "name", "job_title", "department_name", "company_name", "housing_location"]


def _norm_header(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum())


def _map_columns(headers: list[str]) -> list[tuple[str, str]]:
    used: set[str] = set()
    mapped: list[tuple[str, str]] = []
    for header in headers:
        field = _ALIASES.get(_norm_header(header or ""))
        if field and field not in used:
            mapped.append((header, field))
            used.add(field)
    return mapped


def _clean(value):
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    text = str(value).strip()
    return text or None


def parse_employee_rows(data: bytes, filename: str) -> list[dict]:
    filename = (filename or "").lower()
    if filename.endswith(".xlsx"):
        workbook = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        sheet = workbook.active
        rows = sheet.iter_rows(values_only=True)
        header = [str(c) if c is not None else "" for c in next(rows)]
        mapping = _map_columns(header)
        parsed = []
        for record in rows:
            if record is None or all(cell is None or str(cell).strip() == "" for cell in record):
                continue
            row: dict[str, str] = {}
            for idx, field in mapping:
                col = header.index(idx)
                if col < len(record):
                    row[field] = _clean(record[col])
            parsed.append(row)
        workbook.close()
    else:
        text = data.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            raise ValueError("الملف فارغ أو بدون ترويسة")
        mapping = _map_columns(reader.fieldnames)
        parsed = []
        for record in reader:
            if any(str(v or "").strip() for v in record.values()):
                row: dict[str, str] = {}
                for header, field in mapping:
                    row[field] = _clean(record.get(header))
                parsed.append(row)
    return [row for row in parsed if row.get("employee_code") or row.get("name")]


def import_employee_rows(db: Session, rows: list[dict]) -> dict:
    created = updated = 0
    errors: list[dict] = []
    for idx, row in enumerate(rows, start=1):
        employee_code = _clean(row.get("employee_code"))
        name = _clean(row.get("name"))
        if not employee_code and not name:
            continue
        if not employee_code or not name:
            errors.append({"row": idx, "error": "يجب إدخال كود الموظف واسمه"})
            continue
        employee = db.scalar(select(Employee).where(Employee.employee_code == employee_code))
        if not employee:
            employee = Employee(employee_code=employee_code, name=name)
            db.add(employee)
            created += 1
        else:
            updated += 1
        employee.name = name
        employee.job_title = _clean(row.get("job_title")) or employee.job_title
        employee.department_name = _clean(row.get("department_name")) or employee.department_name
        employee.company_name = _clean(row.get("company_name")) or employee.company_name
        employee.housing_location = _clean(row.get("housing_location")) or employee.housing_location
        employee.is_active = True
    db.commit()
    return {"created": created, "updated": updated, "skipped": errors}