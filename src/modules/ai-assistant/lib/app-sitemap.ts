import type { SitemapPage } from "./app-sitemap-data";
import sitemapJson from "../data/app-sitemap.json";

const SITEMAP = sitemapJson as { version: number; pages: SitemapPage[] };

const PAGE_BY_PATH = new Map(SITEMAP.pages.map((p) => [p.path, p]));

export function getSitemapPage(path: string): SitemapPage | undefined {
  return PAGE_BY_PATH.get(path);
}

export function getAllSitemapPages(): SitemapPage[] {
  return SITEMAP.pages;
}

function tokenizeQuery(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s/-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/** Rank pages by relevance to a user question or goal (returns top matches only). */
export function rankSitemapPages(query: string, limit = 6): SitemapPage[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];

  const scored: { page: SitemapPage; score: number }[] = [];

  for (const page of SITEMAP.pages) {
    const hay = [
      page.name,
      page.section,
      page.path,
      page.about,
      ...page.kw,
    ]
      .join(" ")
      .toLowerCase();

    let score = 0;
    for (const t of tokens) {
      if (page.path.includes(t)) score += 12;
      if (page.name.toLowerCase() === t) score += 40;
      if (page.name.toLowerCase().includes(t)) score += 18;
      if (page.section.toLowerCase().includes(t)) score += 8;
      if (hay.includes(t)) score += 4;
      for (const k of page.kw) {
        if (k === t || k.includes(t)) score += 10;
      }
    }

    if (score > 0) scored.push({ page, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const out: SitemapPage[] = [];
  const seen = new Set<string>();
  for (const { page } of scored) {
    if (seen.has(page.path)) continue;
    seen.add(page.path);
    out.push(page);
    if (out.length >= limit) break;
  }
  return out;
}

export function formatCompactCatalog(): string {
  const bySection = new Map<string, SitemapPage[]>();
  for (const page of SITEMAP.pages) {
    const list = bySection.get(page.section) ?? [];
    list.push(page);
    bySection.set(page.section, list);
  }
  const lines = ["## App sitemap catalog (canonical routes — do not invent others)"];
  for (const [section, pages] of bySection) {
    lines.push(`### ${section}`);
    for (const p of pages) {
      lines.push(`• ${p.name} → ${p.path}`);
    }
  }
  return lines.join("\n");
}

/** Compact or detailed context block for the model. */
export function formatSitemapContextBlock(
  pages: SitemapPage[],
  options?: { detailed?: boolean },
): string {
  if (pages.length === 0) return "";
  if (!options?.detailed) {
    const lines = pages.map(
      (p) => `• ${p.name} | ${p.path} | ${p.section} — ${p.about}`,
    );
    return [
      "## App sitemap (partial reference; do not invent other routes)",
      ...lines,
      "Live screen controls override this when present.",
    ].join("\n");
  }

  const blocks = pages.map((p) => {
    const g = p.guide as SitemapPage["guide"] | undefined;
    const steps = (g?.steps ?? [])
      .map((s) => `  ${s.n}. Look for “${s.lookFor}”: ${s.do}`)
      .join("\n");
    return [
      `### ${p.name}`,
      `path: ${p.path}`,
      `section: ${p.section}`,
      `about: ${p.about}`,
      g ? `finishLine: ${g.finishLine}` : "",
      g ? `primaryControl: ${g.primaryControl}` : "",
      steps ? `guide:\n${steps}` : "",
      g?.related?.length ? `related: ${g.related.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });
  return [
    "## App sitemap (detailed on-screen recipes; live controls override ids)",
    ...blocks,
  ].join("\n");
}
