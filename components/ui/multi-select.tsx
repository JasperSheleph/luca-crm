"use client";

import { useEffect, useId, useRef, useState } from "react";
import { inputBase } from "@/components/ui/field";

export interface Option {
  value: string;
  label: string;
}

/**
 * A filter that takes several values at once.
 *
 * A native <select multiple> is unusable — it needs ctrl-click to add a second
 * value and shows a scrolling box that swallows the layout. This is a button
 * that opens a checkbox list, which is what people expect a filter to be.
 */
export default function MultiSelect({
  label, options, selected, onChange, searchable = false, width = "w-44",
}: {
  /** Shown when nothing is picked, e.g. "Any stage". */
  label: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Adds a search box inside. Worth it past ~15 options. */
  searchable?: boolean;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  // One pick shows what it is; several show a count, because three long city
  // names in a filter button pushes everything else off the row.
  const summary =
    selected.length === 0
      ? label
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
        : `${selected.length} selected`;

  const shown = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div ref={root} className={`relative ${width}`}>
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setQuery(""); }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        className={`${inputBase} flex w-full items-center justify-between gap-2 text-left ${
          selected.length ? "border-navy-700 bg-navy-100 font-medium" : ""
        }`}
      >
        <span className="truncate">{summary}</span>
        <span aria-hidden="true" className="shrink-0 text-ink-muted">▾</span>
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          className="absolute left-0 z-30 mt-1 max-h-72 w-64 overflow-auto rounded-md border border-border bg-paper p-1 shadow-lg"
        >
          {searchable && (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to narrow…"
              aria-label={`Search ${label}`}
              className={`${inputBase} mb-1 w-full text-sm`}
            />
          )}

          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mb-1 w-full rounded px-2 py-1 text-left text-xs text-ink-muted hover:bg-navy-50 hover:text-ink"
            >
              Clear {selected.length} selected
            </button>
          )}

          {shown.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-ink hover:bg-navy-50"
            >
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={() => toggle(o.value)}
                className="size-4 shrink-0 accent-navy-900"
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))}

          {shown.length === 0 && (
            <p className="px-2 py-3 text-center text-sm text-ink-muted">Nothing matches that.</p>
          )}
        </div>
      )}
    </div>
  );
}
