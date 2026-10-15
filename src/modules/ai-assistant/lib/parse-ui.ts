import type { AssistantReport } from "./parse-report";

export type UiMetricItem = { label: string; value: string };

export type UiEntityKind =
  | "customer"
  | "vendor"
  | "invoice"
  | "bill"
  | "product"
  | "user"
  | "account";

export type UiEntityBlock = {
  type: "entity";
  kind: UiEntityKind;
  title: string;
  subtitle?: string;
  href?: string;
  fields: UiMetricItem[];
};

export type UiMetricsBlock = {
  type: "metrics";
  title?: string;
  items: UiMetricItem[];
};

export type UiTableBlock = {
  type: "table";
  title: string;
  subtitle?: string;
  columns: string[];
  rows: Array<Array<string | number | null>>;
  note?: string;
  ctaLabel?: string;
  ctaPath?: string;
};

export type UiChartBlock = {
  type: "chart";
  title?: string;
  variant: "line" | "bar";
  valueFormat?: "number" | "currency";
  items: Array<{ label: string; value: number }>;
};

export type UiBlock =
  | UiEntityBlock
  | UiMetricsBlock
  | UiTableBlock
  | UiChartBlock;

export type AssistantPresent = {
  blocks: UiBlock[];
};

const UI_BLOCK_RE = /\[UI\]([\s\S]*?)\[\/UI\]/i;
const UI_OPEN_RE = /\[UI\]/i;
const NEXT_DIRECTIVE_RE = /\[(?:SUGGEST|POINT|OPEN|REPORT):/i;

/** Models often omit `[/UI]` — extract JSON by brace balance or closed tag. */
function extractUiJsonSegment(raw: string): {
  json: string;
  fullMatch: string;
} | null {
  const closed = raw.match(UI_BLOCK_RE);
  if (closed) {
    return { json: closed[1].trim(), fullMatch: closed[0] };
  }
  const openIdx = raw.search(UI_OPEN_RE);
  if (openIdx < 0) return null;
  const afterOpen = raw.slice(openIdx).replace(/^\[UI\]/i, "");
  const nextIdx = afterOpen.search(NEXT_DIRECTIVE_RE);
  const slice = (nextIdx >= 0 ? afterOpen.slice(0, nextIdx) : afterOpen).trim();
  if (!slice.startsWith("{")) return null;
  let depth = 0;
  for (let i = 0; i < slice.length; i += 1) {
    const ch = slice[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const json = slice.slice(0, i + 1);
        const consumed = raw.slice(openIdx, openIdx + "[UI]".length + i + 1);
        return { json, fullMatch: consumed };
      }
    }
  }
  return null;
}

export function presentIncludesEntityDeepLinks(
  present: AssistantPresent | null,
): boolean {
  if (!present?.blocks.length) return false;
  return present.blocks.some(
    (b) => b.type === "entity" && Boolean(b.href),
  );
}
const MAX_BLOCKS = 6;
const MAX_TABLE_ROWS = 8;
const MAX_CHART_ITEMS = 8;
const MAX_ENTITY_FIELDS = 8;

function asString(v: unknown, max = 120): string {
  if (v == null) return "";
  const s = String(v).trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function sanitizeMetrics(raw: unknown): UiMetricItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const rec = item as Record<string, unknown>;
      const label = asString(rec.label, 40);
      const value = asString(rec.value, 80);
      if (!label || !value) return null;
      return { label, value };
    })
    .filter(Boolean)
    .slice(0, 6) as UiMetricItem[];
}

const ENTITY_KINDS = new Set<UiEntityKind>([
  "customer",
  "vendor",
  "invoice",
  "bill",
  "product",
  "user",
  "account",
]);

function sanitizeEntity(raw: unknown): UiEntityBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const kind = asString(rec.kind, 20).toLowerCase() as UiEntityKind;
  if (!ENTITY_KINDS.has(kind)) return null;
  const title = asString(rec.title, 80);
  if (!title) return null;
  const fields = sanitizeMetrics(rec.fields).slice(0, MAX_ENTITY_FIELDS);
  if (fields.length === 0) return null;
  const href = asString(rec.href, 200);
  return {
    type: "entity",
    kind,
    title,
    subtitle: asString(rec.subtitle, 80) || undefined,
    href: href.startsWith("/admin/") ? href.split("?")[0] : undefined,
    fields,
  };
}

function sanitizeTable(raw: unknown): UiTableBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const title = asString(rec.title, 80);
  const columns = Array.isArray(rec.columns)
    ? rec.columns.map((c) => asString(c, 40)).filter(Boolean)
    : [];
  const rows = Array.isArray(rec.rows)
    ? rec.rows
        .slice(0, MAX_TABLE_ROWS)
        .map((row) =>
          Array.isArray(row)
            ? row.slice(0, columns.length).map((cell) => {
                if (cell == null) return null;
                if (typeof cell === "number" && Number.isFinite(cell)) return cell;
                return asString(cell, 80);
              })
            : [],
        )
        .filter((row) => row.length > 0)
    : [];
  if (!title || columns.length === 0 || rows.length === 0) return null;
  const ctaPath = asString(rec.ctaPath, 200);
  return {
    type: "table",
    title,
    subtitle: asString(rec.subtitle, 80) || undefined,
    columns,
    rows,
    note: asString(rec.note, 200) || undefined,
    ctaLabel: asString(rec.ctaLabel, 40) || undefined,
    ctaPath: ctaPath.startsWith("/admin/") ? ctaPath.split("?")[0] : undefined,
  };
}

function sanitizeChart(raw: unknown): UiChartBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const variantRaw = asString(rec.variant, 10).toLowerCase();
  if (variantRaw !== "bar" && variantRaw !== "line") return null;
  const items = Array.isArray(rec.items)
    ? rec.items
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const label = asString(row.label, 48);
          const value = asNumber(row.value);
          if (!label || value == null) return null;
          return { label, value };
        })
        .filter(Boolean)
        .slice(0, MAX_CHART_ITEMS) as Array<{ label: string; value: number }>
    : [];
  if (items.length === 0) return null;
  const fmt = asString(rec.valueFormat, 12).toLowerCase();
  return {
    type: "chart",
    title: asString(rec.title, 80) || undefined,
    variant: variantRaw === "bar" ? "bar" : "line",
    valueFormat: fmt === "currency" ? "currency" : "number",
    items,
  };
}

function sanitizeBlock(raw: unknown): UiBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const type = asString(rec.type, 20).toLowerCase();
  if (type === "entity") return sanitizeEntity(rec);
  if (type === "metrics") {
    const items = sanitizeMetrics(rec.items);
    if (items.length === 0) return null;
    return {
      type: "metrics",
      title: asString(rec.title, 80) || undefined,
      items,
    };
  }
  if (type === "table") return sanitizeTable(rec);
  if (type === "chart") return sanitizeChart(rec);
  return null;
}

export function sanitizePresent(raw: unknown): AssistantPresent | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const blocks = Array.isArray(rec.blocks)
    ? rec.blocks
        .map(sanitizeBlock)
        .filter(Boolean)
        .slice(0, MAX_BLOCKS) as UiBlock[]
    : [];
  return blocks.length > 0 ? { blocks } : null;
}

export function blocksFromReport(report: AssistantReport): UiBlock[] {
  const blocks: UiBlock[] = [];
  const highlights = (report.highlights ?? []).map((h) => ({
    label: h.label,
    value: h.value,
  }));
  if (highlights.length > 0) {
    blocks.push({
      type: "metrics",
      title: report.title,
      items: highlights,
    });
  }
  const columns = report.columns ?? [];
  const rows = report.rows ?? [];
  if (columns.length > 0 && rows.length > 0) {
    blocks.push({
      type: "table",
      title: highlights.length > 0 ? "Details" : report.title,
      subtitle: highlights.length > 0 ? report.subtitle : report.subtitle,
      columns,
      rows: rows.slice(0, MAX_TABLE_ROWS),
      note: report.note,
      ctaLabel: report.ctaLabel,
      ctaPath: report.ctaPath,
    });
  } else if (highlights.length === 0 && report.title) {
    blocks.push({
      type: "metrics",
      title: report.title,
      items: [{ label: "Summary", value: report.subtitle || report.title }],
    });
  }
  return blocks;
}

export function mergePresent(
  report: AssistantReport | null,
  ui: AssistantPresent | null,
): AssistantPresent | null {
  if (ui?.blocks.length) return ui;
  const fromReport = report ? blocksFromReport(report) : [];
  if (fromReport.length === 0) return null;
  return { blocks: fromReport.slice(0, MAX_BLOCKS) };
}

export function parseUiBlock(raw: string): {
  spoken: string;
  present: AssistantPresent | null;
} {
  const segment = extractUiJsonSegment(raw);
  if (!segment) {
    return { spoken: raw, present: null };
  }
  const spoken = raw.replace(segment.fullMatch, "").trim();
  try {
    const parsed = JSON.parse(segment.json) as unknown;
    return { spoken, present: sanitizePresent(parsed) };
  } catch {
    return { spoken, present: null };
  }
}

export function stripUiBlock(raw: string): string {
  const segment = extractUiJsonSegment(raw);
  if (!segment) return raw.trim();
  return raw.replace(segment.fullMatch, "").trim();
}

export function replyHasRenderablePresent(raw: string): boolean {
  return Boolean(parseUiBlock(raw).present?.blocks.length);
}

export function serializeUiPresent(present: AssistantPresent): string {
  return `[UI]${JSON.stringify(present)}[/UI]`;
}
