import { isAdminInvoicePrintPath } from "@/modules/admin/lib/admin-invoice-route";

export const AI_CHAT_RAIL_CSS_VAR = "--dhoom-ai-rail-width";

export const AI_CHAT_RAIL_WIDTH_PX = 380;
export const AI_CHAT_RAIL_WIDTH_EXPANDED_PX = 480;

/** Floating panel when split rail is unavailable (auth, mobile, print). */
export const AI_CHAT_FLOAT_WIDTH_PX = 360;

export function aiChatRailWidthPx(expanded: boolean): number {
  return expanded ? AI_CHAT_RAIL_WIDTH_EXPANDED_PX : AI_CHAT_RAIL_WIDTH_PX;
}

export function shouldUseAdminSplitRail(
  pathname: string | null | undefined,
  isMdViewport: boolean,
): boolean {
  if (!isMdViewport) return false;
  if (!pathname?.startsWith("/admin")) return false;
  if (isAdminInvoicePrintPath(pathname)) return false;
  return true;
}

export function setAiChatRailWidthPx(px: number) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(AI_CHAT_RAIL_CSS_VAR, `${px}px`);
  if (px > 0) {
    document.documentElement.setAttribute("data-ai-chat-rail", "open");
  } else {
    document.documentElement.removeAttribute("data-ai-chat-rail");
  }
}

export function readAiChatRailWidthPx(): number {
  if (typeof document === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(AI_CHAT_RAIL_CSS_VAR)
    .trim();
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}