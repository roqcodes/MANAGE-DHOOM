import { inferTargetHrefFromGoal } from "./sidebar-nav-visibility";
import {
  formatSitemapContextBlock,
  getSitemapPage,
  rankSitemapPages,
} from "./app-sitemap";
import { isDataQuestion, looksLikePromptInjection } from "./message-intent";

type ChatTurn = { role: string; content: string };

const NAV_KNOWLEDGE_RE =
  /\b(sitemap|app map|all pages|list (of )?(pages|modules|screens)|sidebar|navigation|which (page|screen|menu)|what page|where (is|are|do i find)|go to|navigate|open .{0,40}(page|screen|module)|find .{0,40}in (the )?app|under (items|inventory|sales|purchases|banking|accounts|reports|vat|hr|business)|tell me about .{0,40}(page|screen)|what does .{0,40}(page|do|for))\b/i;

const ENTITY_NAV_RE =
  /\b(products?|expenses?|invoices?|bills?|vendors?|customers?|orders?|inventory|stock|employees?|vat|reports?|banking|transfers?)\b/i;

/** User is asking where something lives in the admin app (not pure theory). */
export function needsAppNavKnowledge(text: string): boolean {
  const t = text.trim();
  if (!t || looksLikePromptInjection(t)) return false;
  if (NAV_KNOWLEDGE_RE.test(t)) return true;
  if (
    ENTITY_NAV_RE.test(t) &&
    /\b(where|which|what page|how (do i|to) (open|reach|access|find)|about)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

/** Skip re-injecting sitemap if recent assistant turns already named these routes. */
export function chatHistorySatisfiesSitemap(
  query: string,
  history: ChatTurn[],
): boolean {
  const ranked = rankSitemapPages(query, 4);
  if (ranked.length === 0) return true;

  const assistantBlob = history
    .filter((m) => m.role === "assistant")
    .slice(-6)
    .map((m) => m.content.toLowerCase())
    .join("\n");

  if (!assistantBlob.trim()) return false;

  const mustCover = ranked.slice(0, Math.min(2, ranked.length));
  return mustCover.every(
    (p) =>
      assistantBlob.includes(p.path.toLowerCase()) ||
      assistantBlob.includes(p.name.toLowerCase()),
  );
}

function pickSitemapForGoal(goal: string, limit: number) {
  const href = inferTargetHrefFromGoal(goal);
  const out: ReturnType<typeof rankSitemapPages> = [];

  if (href) {
    const direct = getSitemapPage(href);
    if (direct) out.push(direct);
  }

  for (const page of rankSitemapPages(goal, limit)) {
    if (!out.some((p) => p.path === page.path)) out.push(page);
    if (out.length >= limit) break;
  }

  return out.slice(0, limit);
}

export function buildSitemapContextBlock(options: {
  mode: "chat" | "guide";
  message: string;
  goal?: string;
  chatHistory: ChatTurn[];
  hasLiveScreenInventory: boolean;
}): string {
  const goalText = (options.goal ?? "").trim();
  const messageText = options.message.trim();
  const query = goalText || messageText;

  if (options.mode === "guide") {
    const pages = query ? pickSitemapForGoal(query, 3) : [];
    return formatSitemapContextBlock(pages, { detailed: true });
  }

  if (
    !options.hasLiveScreenInventory &&
    isDataQuestion(messageText) &&
    !needsAppNavKnowledge(messageText)
  ) {
    return "";
  }

  const ranked = rankSitemapPages(
    query,
    needsAppNavKnowledge(messageText) || options.hasLiveScreenInventory ? 4 : 3,
  );
  if (ranked.length === 0) return "";

  if (chatHistorySatisfiesSitemap(query, options.chatHistory)) {
    return "";
  }

  const detailed =
    needsAppNavKnowledge(messageText) || options.hasLiveScreenInventory;
  return formatSitemapContextBlock(ranked, { detailed });
}
