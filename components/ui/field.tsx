/**
 * No width here. Adding `w-40` to a class string that already contains `w-full`
 * is a coin flip decided by stylesheet order, not by which you wrote last — so
 * width is always chosen at the usage site.
 */
export const inputBase =
  "rounded-md border border-border bg-paper px-2.5 py-1.5 text-sm text-ink outline-none focus:border-navy-700 disabled:bg-navy-50 disabled:text-ink-muted";

/** The common case: fills its container. */
export const inputClass = `w-full ${inputBase}`;

export function Field({
  label, hint, htmlFor, children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-ink">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
