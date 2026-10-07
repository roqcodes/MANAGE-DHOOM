/** Escape `%`, `_`, `\` for safe ILIKE patterns. */
export function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/** Strip characters that break PostgREST `.or()` filter syntax. */
export function sanitizePostgrestOrTerm(value: string): string {
  return value.replace(/[,()]/g, " ").replace(/\s+/g, " ").trim();
}

export function buildIlikePattern(query: string): string | null {
  const sanitized = sanitizePostgrestOrTerm(query);
  if (!sanitized) return null;
  return `%${escapeIlikePattern(sanitized)}%`;
}

/** Prefix match (`term%`) — btree-friendly; faster than leading-wildcard ILIKE. */
export function buildPrefixIlikePattern(query: string): string | null {
  const sanitized = sanitizePostgrestOrTerm(query);
  if (!sanitized) return null;
  return `${escapeIlikePattern(sanitized)}%`;
}
