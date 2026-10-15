import { parseSpokenSegments } from "./parse-spoken-segments";

/** Max route pills rendered under one assistant message. */
export const MAX_ASSISTANT_ROUTE_PILLS = 2;

/** Collect /admin routes from assistant text in document order (deduped, capped). */
export function extractAdminRoutes(text: string): string[] {
  const hrefs: string[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\n+/);
  for (const line of lines) {
    for (const seg of parseSpokenSegments(line)) {
      if (seg.type !== "link") continue;
      if (seen.has(seg.href)) continue;
      seen.add(seg.href);
      hrefs.push(seg.href);
      if (hrefs.length >= MAX_ASSISTANT_ROUTE_PILLS) return hrefs;
    }
  }
  return hrefs;
}

/** Remove inline route tokens; keep bold labels and prose. */
export function spokenLineWithoutRoutes(line: string): string {
  const segments = parseSpokenSegments(line);
  let out = "";
  for (const seg of segments) {
    if (seg.type === "link") continue;
    if (seg.type === "bold") out += `**${seg.value}**`;
    else out += seg.value;
  }
  return out
    .replace(/\s+at\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
