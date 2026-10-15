export type AssistantOpenAction = {
  href: string;
  label: string;
  kind?: string;
  subtitle?: string;
};

const OPEN_BLOCK_RE = /\[OPEN\]([\s\S]*?)\[\/OPEN\]/i;

export function parseOpenBlock(raw: string): {
  spoken: string;
  open: AssistantOpenAction | null;
} {
  const match = raw.match(OPEN_BLOCK_RE);
  if (!match) {
    return { spoken: raw, open: null };
  }
  const spoken = raw.replace(OPEN_BLOCK_RE, "").trim();
  try {
    const parsed = JSON.parse(match[1].trim()) as AssistantOpenAction;
    if (!parsed?.href || typeof parsed.href !== "string") {
      return { spoken, open: null };
    }
    if (!parsed.href.startsWith("/admin/")) {
      return { spoken, open: null };
    }
    return {
      spoken,
      open: {
        href: parsed.href.split("?")[0],
        label: String(parsed.label || "Open record").trim(),
        kind: parsed.kind,
        subtitle: parsed.subtitle,
      },
    };
  } catch {
    return { spoken, open: null };
  }
}

export function stripOpenBlock(raw: string): string {
  return raw.replace(OPEN_BLOCK_RE, "").trim();
}

export const MD_ADMIN_LINK_RE = /\[([^\]]+)\]\((\/admin[^)]+)\)/g;

/** All `/admin` targets from markdown links (for Quick open pills). */
export function extractMarkdownAdminRoutes(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of raw.matchAll(MD_ADMIN_LINK_RE)) {
    const href = match[2].split("?")[0].replace(/\/$/, "") || "/admin";
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(href);
  }
  return out;
}

/** Turn `[Customers](/admin/customers)` into plain “Customers”; drop detail URLs when Open handles them. */
export function normalizeAssistantMarkdownLinks(
  raw: string,
  open: AssistantOpenAction | null,
): string {
  return raw
    .replace(MD_ADMIN_LINK_RE, (_full, label, href) => {
      const path = href.split("?")[0];
      if (open && isAdminRecordDetailHref(path)) return "";
      return String(label).trim();
    })
    .replace(/^\s*[•*-]\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** True for `/admin/.../record-id` style paths (not list roots). */
export function isAdminRecordDetailHref(href: string): boolean {
  const path = href.split("?")[0].replace(/\/$/, "");
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 3) return false;
  const last = parts[parts.length - 1];
  if (["new", "print", "edit"].includes(last)) return false;
  if (/^[0-9a-f-]{8,}$/i.test(last)) return true;
  if (/^\d+$/.test(last)) return true;
  return last.length >= 6 && parts.length >= 4;
}

/** When the model used markdown instead of [OPEN], promote the best detail link. */
export function inferOpenFromMarkdownLinks(raw: string): AssistantOpenAction | null {
  let best: AssistantOpenAction | null = null;
  let bestDepth = 0;
  for (const match of raw.matchAll(MD_ADMIN_LINK_RE)) {
    const label = match[1].trim();
    const href = match[2].split("?")[0];
    if (!isAdminRecordDetailHref(href)) continue;
    const depth = href.split("/").filter(Boolean).length;
    if (!best || depth >= bestDepth) {
      best = { href, label: label || "Open record" };
      bestDepth = depth;
    }
  }
  return best;
}

/** @deprecated Use normalizeAssistantMarkdownLinks */
export function stripRecordMarkdownLinks(raw: string): string {
  return normalizeAssistantMarkdownLinks(raw, null);
}
