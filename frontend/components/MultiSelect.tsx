"use client";

import { useEffect, useRef, useState } from "react";

export type MultiOption = { value: string; label: string };

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "الكل",
}: {
  options: MultiOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  const summary =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? options.find((o) => o.value === value[0])?.label ?? value[0]
        : `${value.length} مختارة`;

  return (
    <div className="multiselect" ref={ref}>
      <button
        type="button"
        className={`multiselect-trigger${value.length ? " has-value" : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="multiselect-summary">{summary}</span>
        <span className="multiselect-caret">▾</span>
      </button>
      {open && (
        <div className="multiselect-menu">
          {value.length > 0 && (
            <button type="button" className="multiselect-all" onClick={() => onChange([])}>
              مسح التحديد
            </button>
          )}
          {options.length === 0 && <div className="multiselect-empty">لا توجد خيارات</div>}
          {options.map((o) => (
            <label key={o.value} className="multiselect-option">
              <input
                type="checkbox"
                checked={value.includes(o.value)}
                onChange={() => toggle(o.value)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
