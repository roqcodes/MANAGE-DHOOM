import { getSitemapPage } from "./app-sitemap";

export type SpokenSegment =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "link"; value: string; href: string };

const INLINE_TOKEN_RE =
  /(\*\*[^*]+\*\*|\[[^\]]+\]\(\/admin[^)]+\)|\/admin(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)+)/g;

function adminPathLabel(href: string): string {
  return getSitemapPage(href)?.name ?? href;
}

/** Parse bold, markdown links, and bare /admin/... paths in one line. */
export function parseSpokenSegments(text: string): SpokenSegment[] {
  const segments: SpokenSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_TOKEN_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, index) });
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**") && token.length > 4) {
      segments.push({ type: "bold", value: token.slice(2, -2) });
    } else if (token.startsWith("[")) {
      const md = token.match(/^\[([^\]]+)\]\((\/admin[^)]+)\)$/);
      if (md) {
        segments.push({ type: "link", value: md[1], href: md[2] });
      } else {
        segments.push({ type: "text", value: token });
      }
    } else if (token.startsWith("/admin")) {
      segments.push({
        type: "link",
        value: adminPathLabel(token),
        href: token,
      });
    } else {
      segments.push({ type: "text", value: token });
    }
    lastIndex = index + token.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: "text", value: text }];
}
