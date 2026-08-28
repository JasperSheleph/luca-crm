/**
 * City normalisation and service-area matching.
 *
 * Their real data holds 281 distinct city spellings in the Meta export and 522
 * in the legacy tracker, for roughly 30 real cities: "trichy" and
 * "tiruchirappalli" both appear, plus case and whitespace variants.
 *
 * The alias map lives in app_settings.city_aliases so admins extend it from
 * Settings. Never hardcode an alias here.
 */

/**
 * The catch-all option in the city filter.
 *
 * The Meta lead form takes free text for city, so the raw values include
 * pincodes, whole addresses and typos — most appearing exactly once. Listing
 * them all makes the filter useless; hiding them would make those leads
 * unreachable. Everything unrecognised collapses into this one option.
 *
 * Lives here rather than in lib/queries/deals.ts because the filter bar is a
 * client component: importing a runtime value from the queries module drags
 * next/headers into the browser bundle, which TypeScript cannot see.
 */
export const CITY_OTHER = "__other__";

export function normalizeCity(
  raw: string | null | undefined,
  aliases: Record<string, string> = {},
): string | null {
  if (!raw) return null;
  const base = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[.,/#!$%^&*;:{}=\-_`~()"'\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return null;
  return aliases[base] ?? base;
}

/**
 * ~60% of their leads are outside Chennai, deliberately — campaigns target
 * Trichy, Madurai, Salem, Coimbatore and Puducherry by name. Outstation is
 * normal business. Never render it as a warning state.
 */
export function isOutstation(
  cityNormalized: string | null,
  serviceAreaCities: string[],
): boolean {
  if (!cityNormalized) return false;
  return cityNormalized !== "chennai" && serviceAreaCities.includes(cityNormalized);
}

/** Outside Tamil Nadu / Puducherry entirely — only ~2% of their leads. */
export function isOutsideServiceArea(
  cityNormalized: string | null,
  serviceAreaCities: string[],
): boolean {
  if (!cityNormalized) return false;
  return !serviceAreaCities.includes(cityNormalized);
}
