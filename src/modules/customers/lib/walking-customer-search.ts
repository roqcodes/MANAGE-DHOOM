import {
  WALKING_CUSTOMER_EMAIL,
  WALKING_CUSTOMER_ID,
  WALKING_CUSTOMER_NAME,
  WALKING_CUSTOMER_NUMBER,
} from "./walking-customer";

export const WALKING_CUSTOMER_SEARCH_LABEL = WALKING_CUSTOMER_NAME;
export const WALKING_CUSTOMER_SEARCH_SUBLABEL = `${WALKING_CUSTOMER_NUMBER} · ${WALKING_CUSTOMER_EMAIL}`;

const WALKING_SEARCH_ALIASES = [
  "walk",
  "walking",
  "walkin",
  "walk-in",
  "walk in",
  "walk-in customer",
  "walking customer",
  WALKING_CUSTOMER_NUMBER.toLowerCase(),
  "pos",
  "cash",
];

function normalizeWalkingSearchToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/** True when query blank (picker focus) or user typed something that should surface Walking Customer. */
export function walkingCustomerMatchesSearchQuery(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;

  const q = trimmed.toLowerCase();
  const qCompact = normalizeWalkingSearchToken(trimmed);

  if (WALKING_CUSTOMER_NAME.toLowerCase().includes(q)) return true;
  if (WALKING_CUSTOMER_NUMBER.toLowerCase().includes(q)) return true;
  if (WALKING_CUSTOMER_EMAIL.toLowerCase().includes(q)) return true;

  for (const alias of WALKING_SEARCH_ALIASES) {
    const aliasCompact = normalizeWalkingSearchToken(alias);
    if (
      q.includes(alias) ||
      alias.includes(q) ||
      qCompact.includes(aliasCompact) ||
      aliasCompact.includes(qCompact)
    ) {
      return true;
    }
  }

  return false;
}

/** Always keep Walking Customer first when it belongs in this result set. */
export function pinWalkingCustomerRows<T extends { id: string }>(
  rows: T[],
  query: string,
  walkingRow: T,
): T[] {
  if (!walkingCustomerMatchesSearchQuery(query)) {
    return rows;
  }

  const rest = rows.filter((row) => row.id !== WALKING_CUSTOMER_ID);
  return [walkingRow, ...rest];
}