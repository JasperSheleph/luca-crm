/**
 * Phone normalisation.
 *
 * MUST stay identical to normalize_phone() in
 * supabase/migrations/20260828120100_functions.sql. Two implementations of one
 * rule will drift; tests/phone.test.ts asserts they agree using the 22
 * known-bad numbers from the real Meta export as fixtures.
 *
 * Their exports prefix numbers with "p:" — `p:+919566114558`.
 */

export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits === "") return null;

  let d = digits;
  if (d.length > 10 && d.startsWith("91")) {
    d = d.slice(-10);
  }
  // Indians routinely write the STD trunk prefix: 09566114558. The website
  // contact form posts whatever the customer typed, so strip it here rather
  // than flagging thousands of perfectly dialable numbers as invalid.
  if (d.length === 11 && d.startsWith("0")) {
    d = d.slice(1);
  }
  // Anything that isn't a 10-digit Indian number is kept verbatim and flagged
  // upstream as invalid_phone. ~2% of their Meta leads are international or
  // malformed and they must be imported, never silently dropped.
  if (d.length !== 10) return "+" + d;
  return "+91" + d;
}

/** A number we can actually dial: +91 followed by 10 digits starting 6-9. */
export function isValidIndianMobile(normalized: string | null): boolean {
  if (!normalized) return false;
  return /^\+91[6-9][0-9]{9}$/.test(normalized);
}

/** Last 10 digits — what duplicate detection and search match on. */
export function phoneKey(raw: string | null | undefined): string | null {
  const n = normalizePhone(raw);
  if (!n) return null;
  const d = n.replace(/[^0-9]/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
}

/** tel: link target for click-to-call. */
export function telHref(normalized: string | null): string | undefined {
  return normalized ? `tel:${normalized}` : undefined;
}
