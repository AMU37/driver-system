"use client";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

export type CrudOption = { value: string | number | boolean; label: string };
export type CrudField = {
  key: string;
  label: string;
  type?: "text" | "number" | "password" | "select";
  options?: CrudOption[];
  required?: boolean;
  full?: boolean;
  help?: string;
  createOnly?: boolean;
  editOnly?: boolean;
};
export type CrudColumn = {
  key: string;
  label: string;
  render?: (item: any) => React.ReactNode;
};

type Props = {
  title: string;
  subtitle?: string;
  items: any[];
  columns: CrudColumn[];
  fields: CrudField[];
  onSave: (payload: Record<string, any>, id?: number | string) => Promise<void>;
  onDelete?: (id: number | string) => Promise<void>;
  extraHeader?: React.ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  searchValue?: string;
};

export default function CrudTable({ title, subtitle, items, columns, fields, onSave, onDelete, extraHeader, searchable, searchPlaceholder, onSearch, searchValue }: Props) {
  const [editing, setEditing] = useState<{ id?: number | string; values: Record<string, any> } | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setError("");
    setEditing({ values: {} });
  }
  function openEdit(item: any) {
    const values: Record<string, any> = {};
    for (const f of fields) values[f.key] = item[f.key];
    setError("");
    setEditing({ id: item.id, values });
  }
  function close() {
    setEditing(null);
    setError("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const visible = fields.filter(f => (editing?.id ? !f.createOnly : !f.editOnly));
    const payload: Record<string, any> = {};
    for (const f of visible) {
      if (f.required && (editing?.values[f.key] === undefined || editing?.values[f.key] === "")) {
        setError(`الحقل "${f.label}" مطلوب`);
        return;
      }
      const value = editing?.values[f.key];
      if (value !== undefined && value !== "") payload[f.key] = value;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(payload, editing?.id);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: any) {
    if (!onDelete) return;
    if (!window.confirm(`هل تريد حذف "${item[columns[0]?.key] ?? item.id}"؟`)) return;
    try {
      await onDelete(item.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "تعذر الحذف");
    }
  }

  return (
    <>
      <div className="form-panel">
        <div className="panel-title">
          <div>
            <div>
              <h2>{title}</h2>
              {subtitle && <span>{subtitle}</span>}
            </div>
          </div>
          {extraHeader}
        </div>
        <div className="panel-tools">
          {searchable && onSearch && (
            <div className="search-row">
              <input
                placeholder={searchPlaceholder ?? "بحث بالكود أو الاسم..."}
                value={searchValue ?? ""}
                onChange={e => onSearch(e.target.value)}
              />
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="primary-btn" onClick={openCreate}><Plus size={18} />إضافة جديد</button>
          </div>
        </div>
      </div>
      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}<th>إجراءات</th></tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  {columns.map(c => (
                    <td key={c.key}>{c.render ? c.render(item) : String(item[c.key] ?? "—")}</td>
                  ))}
                  <td>
                    <div className="row-actions">
                      <button className="secondary-btn" onClick={() => openEdit(item)}><Pencil size={15} />تعديل</button>
                      {onDelete && <button className="danger-btn" onClick={() => remove(item)}><Trash2 size={15} />حذف</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={columns.length + 1}><div className="empty">لا توجد بيانات. أضف أول عنصر.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">{editing.id ? "EDIT" : "NEW"}</div>
                <h2>{editing.id ? `تعديل: ${title}` : `إضافة: ${title}`}</h2>
              </div>
              <button className="icon-btn" onClick={close}>×</button>
            </div>
            {error && <div className="alert danger">{error}</div>}
            <form onSubmit={save} className="stack-lg">
              <div className="form-grid">
                {fields.filter(f => (editing.id ? !f.createOnly : !f.editOnly)).map(f => (
                  <label className={`field ${f.full ? "grid-full" : ""}`} key={f.key}>
                    <span>{f.label}{f.required ? " *" : ""}</span>
                    {f.type === "select" ? (
                      <div className="input-wrap">
                        <select
                          value={String(editing.values[f.key] ?? "")}
                          onChange={e => {
                            const option = (f.options ?? []).find(o => String(o.value) === e.target.value);
                            setEditing({ ...editing, values: { ...editing.values, [f.key]: option ? option.value : e.target.value } });
                          }}
                        >
                          <option value="">— اختر —</option>
                          {(f.options ?? []).map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
                        </select>
                      </div>
                    ) : (
                      <div className="input-wrap">
                        <input
                          type={f.type === "password" ? "password" : f.type === "number" ? "number" : "text"}
                          value={editing.values[f.key] ?? ""}
                          onChange={e => setEditing({ ...editing, values: { ...editing.values, [f.key]: f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value } })}
                        />
                      </div>
                    )}
                    {f.help && <div className="hint">{f.help}</div>}
                  </label>
                ))}
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-btn" onClick={close}>إلغاء</button>
                <button className="primary-btn" disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}