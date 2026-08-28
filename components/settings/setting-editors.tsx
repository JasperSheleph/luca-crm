"use client";

import { useState } from "react";
import { inputBase, inputClass } from "@/components/ui/field";
import Button from "@/components/ui/button";

/**
 * Typed editors for app_settings.
 *
 * LUCA has no technical staff. A textarea full of JSON is a change request to a
 * developer wearing a disguise, so every setting gets a control that matches
 * what it actually is. Each editor keeps its own state and emits the JSON the
 * server action validates, through a hidden field.
 */

export function ModeEditor({ value }: { value: unknown }) {
  return (
    <select name="value" defaultValue={JSON.stringify(value)} className={inputClass}>
      <option value={JSON.stringify("auto_single")}>Everything to one CRM Manager</option>
      <option value={JSON.stringify("round_robin")}>Share evenly between CRM Managers</option>
      <option value={JSON.stringify("manual")}>Leave unassigned for an admin to hand out</option>
    </select>
  );
}

export function BooleanEditor({ value, label }: { value: unknown; label: string }) {
  const [on, setOn] = useState(value === true);
  return (
    <>
      <input type="hidden" name="value" value={JSON.stringify(on)} />
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="size-4 accent-navy-900" />
        {label}
      </label>
    </>
  );
}

export function NumberEditor({ value, suffix }: { value: unknown; suffix?: string }) {
  const [n, setN] = useState(String(value ?? ""));
  return (
    <>
      <input type="hidden" name="value" value={n === "" ? "" : String(Number(n))} />
      <div className="flex items-center gap-2">
        <input type="number" min={1} value={n} onChange={(e) => setN(e.target.value)} className={`${inputBase} w-32`} />
        {suffix && <span className="text-sm text-ink-muted">{suffix}</span>}
      </div>
    </>
  );
}

export function NumberListEditor({ value, suffix }: { value: unknown; suffix?: string }) {
  const initial = Array.isArray(value) ? value.join(", ") : "";
  const [text, setText] = useState(initial);
  const nums = text.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
  return (
    <>
      <input type="hidden" name="value" value={JSON.stringify(nums)} />
      <div className="flex items-center gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="3, 7, 14" className={`${inputBase} w-56`} />
        {suffix && <span className="text-sm text-ink-muted">{suffix}</span>}
      </div>
    </>
  );
}

/** One item per line - no brackets, no quotes, no commas to get wrong. */
export function LinesEditor({ value, placeholder }: { value: unknown; placeholder?: string }) {
  const initial = Array.isArray(value) ? (value as string[]).join("\n") : "";
  const [text, setText] = useState(initial);
  const items = text.split("\n").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return (
    <>
      <input type="hidden" name="value" value={JSON.stringify(items)} />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={placeholder}
                className={`${inputClass} font-mono text-xs`} />
      <p className="mt-1 text-xs text-ink-muted">{items.length} in the list. One per line.</p>
    </>
  );
}

/** "trichy = tiruchirappalli", one mapping per line. */
export function PairsEditor({ value, leftLabel, rightLabel }: { value: unknown; leftLabel: string; rightLabel: string }) {
  const obj = (value ?? {}) as Record<string, string>;
  const [text, setText] = useState(Object.entries(obj).map(([k, v]) => `${k} = ${v}`).join("\n"));
  const pairs: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const [k, ...rest] = line.split("=");
    const key = k?.trim().toLowerCase();
    const val = rest.join("=").trim();
    if (key && val) pairs[key] = val;
  }
  return (
    <>
      <input type="hidden" name="value" value={JSON.stringify(pairs)} />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8}
                placeholder={`${leftLabel} = ${rightLabel}`} className={`${inputClass} font-mono text-xs`} />
      <p className="mt-1 text-xs text-ink-muted">
        {Object.keys(pairs).length} mappings. One per line, as <code>{leftLabel} = {rightLabel}</code>.
      </p>
    </>
  );
}

const QUALIFICATION_FIELDS: { field: string; label: string }[] = [
  { field: "floors", label: "Floors" },
  { field: "property_type_id", label: "Property type" },
  { field: "building_subtype_id", label: "Building type" },
  { field: "lift_mechanism_id", label: "Lift mechanism" },
  { field: "construction_status_id", label: "Construction status" },
  { field: "space_available_id", label: "Space available" },
  { field: "site_address", label: "Site address" },
  { field: "budget_amount", label: "Budget" },
  { field: "timeline_months", label: "Timeline" },
];

export function FieldsEditor({ value }: { value: unknown }) {
  const [picked, setPicked] = useState<string[]>(Array.isArray(value) ? (value as string[]) : []);
  const toggle = (f: string) =>
    setPicked((p) => (p.includes(f) ? p.filter((x) => x !== f) : [...p, f]));
  return (
    <>
      <input type="hidden" name="value" value={JSON.stringify(picked)} />
      <div className="grid gap-1.5 sm:grid-cols-2">
        {QUALIFICATION_FIELDS.map((f) => (
          <label key={f.field} className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={picked.includes(f.field)} onChange={() => toggle(f.field)}
                   className="size-4 accent-navy-900" />
            {f.label}
          </label>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-ink-muted">
        Ticking more makes booking slower. Everything not ticked stays optional and can still be filled in.
      </p>
    </>
  );
}

interface Band { label: string; max: number }

export function BandsEditor({ value }: { value: unknown }) {
  const [bands, setBands] = useState<Band[]>(Array.isArray(value) ? (value as Band[]) : []);
  const set = (i: number, patch: Partial<Band>) =>
    setBands((b) => b.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <>
      <input type="hidden" name="value" value={JSON.stringify(bands)} />
      <div className="space-y-1.5">
        {bands.map((b, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input value={b.label} onChange={(e) => set(i, { label: e.target.value })}
                   className={`${inputBase} w-40`} aria-label="Band name" />
            <span className="text-xs text-ink-muted">up to</span>
            <input type="number" value={b.max} onChange={(e) => set(i, { max: Number(e.target.value) })}
                   className={`${inputBase} w-40`} aria-label="Upper limit" />
            <Button size="sm" variant="ghost" type="button" onClick={() => setBands((x) => x.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
        ))}
      </div>
      <Button size="sm" variant="secondary" type="button" className="mt-2"
              onClick={() => setBands((b) => [...b, { label: "New band", max: 1000000 }])}>
        Add a band
      </Button>
    </>
  );
}
