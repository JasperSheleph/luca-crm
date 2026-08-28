import { formatDate, TIMEZONE } from "@/lib/config/design-tokens";

/** "3 days", "2 months" — how long a lead has been waiting, in plain words. */
export function age(from: string | null | undefined): string {
  if (!from) return "—";
  const days = Math.floor((Date.now() - new Date(from).getTime()) / 86_400_000);
  if (days < 0) return "—";
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  if (days < 31) return `${days} days`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month" : `${months} months`;
}

/** Overdue reads as a duration past due, not a date to subtract in your head. */
export function dueLabel(at: string | null | undefined): { text: string; overdue: boolean } | null {
  if (!at) return null;
  const diff = new Date(at).getTime() - Date.now();
  const days = Math.round(diff / 86_400_000);
  if (diff < 0) {
    const late = Math.abs(days);
    return { text: late === 0 ? "due today" : `${late} day${late === 1 ? "" : "s"} overdue`, overdue: true };
  }
  if (days === 0) return { text: "due today", overdue: false };
  if (days === 1) return { text: "due tomorrow", overdue: false };
  return { text: `due ${formatDate(at)}`, overdue: false };
}

export { formatDate, TIMEZONE };
