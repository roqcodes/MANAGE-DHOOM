import type { AssistantOpenAction } from "./parse-open";
import {
  extractMarkdownAdminRoutes,
  inferOpenFromMarkdownLinks,
  normalizeAssistantMarkdownLinks,
  parseOpenBlock,
  stripOpenBlock,
} from "./parse-open";
import type { AssistantReport } from "./parse-report";
import { parseReportBlock, stripReportBlock } from "./parse-report";
import type { AssistantPresent } from "./parse-ui";
import { mergePresent, parseUiBlock, stripUiBlock } from "./parse-ui";
import { getSitemapPage } from "./app-sitemap";
import { stripSuggestAndPoint } from "./parse-point";
import { spokenLineWithoutRoutes } from "./spoken-routes";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Drop lines that only repeat Quick open targets (name-only or “Customers — …” blurbs). */
export function dropLabelsCoveredByRoutePills(
  spoken: string,
  routeHrefs: string[],
): string {
  if (routeHrefs.length === 0) return spoken;
  const names = routeHrefs
    .map((href) => getSitemapPage(href)?.name?.trim())
    .filter(Boolean) as string[];

  return spoken
    .split(/\n+/)
    .filter((line) => {
      const plain = line.replace(/\*\*/g, "").replace(/^[•*-]\s+/, "").trim();
      const t = plain.toLowerCase();
      if (!t) return false;
      for (const name of names) {
        const n = name.toLowerCase();
        if (t === n) return false;
        if (new RegExp(`^${escapeRegExp(n)}\\b`).test(t)) return false;
      }
      return true;
    })
    .join("\n");
}

export type ParsedAssistantMessage = {
  spoken: string;
  report: AssistantReport | null;
  present: AssistantPresent | null;
  open: AssistantOpenAction | null;
  /** From `[Label](/admin/...)` in the raw reply — drives Quick open pills. */
  routeHrefs: string[];
};

/** Strip machine tags for chat UI (reports, deep links, points, suggests). */
export function parseAssistantMessage(raw: string): ParsedAssistantMessage {
  const routeHrefs = extractMarkdownAdminRoutes(raw);
  const { spoken: afterUi, present: uiPresent } = parseUiBlock(raw);
  const { spoken: afterReport, report } = parseReportBlock(afterUi);
  const { spoken: afterOpen, open: openBlock } = parseOpenBlock(afterReport);
  const present = mergePresent(report, uiPresent);
  const open = openBlock ?? inferOpenFromMarkdownLinks(raw);
  let spoken = stripSuggestAndPoint(afterOpen).trim();
  spoken = normalizeAssistantMarkdownLinks(spoken, open);
  spoken = spoken
    .split(/\n+/)
    .map((line) => spokenLineWithoutRoutes(line.replace(/^[•*-]\s+/, "").trim()))
    .map((line) => line.replace(/\s+list\s*$/i, "").trim())
    .filter(Boolean)
    .join("\n");
  spoken = dropLabelsCoveredByRoutePills(spoken, routeHrefs);
  return { spoken, report, present, open, routeHrefs };
}

export function stripAssistantDirectives(raw: string): string {
  return stripSuggestAndPoint(
    stripOpenBlock(stripReportBlock(stripUiBlock(raw))),
  ).trim();
}
