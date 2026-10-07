import type { ScreenSnapshot } from "./screen-snapshot";
import {
  isGeneralKnowledgeQuestion,
  wantsOnScreenGuide,
} from "./message-intent";
import { needsAppNavKnowledge } from "./sitemap-context";

export type PathOnlyScreen = {
  path: string;
  title: string;
  elements?: undefined;
};

/** Full DOM inventory for live guide or explicit on-screen how-to only. */
export function chatNeedsScreenInventory(message: string): boolean {
  const t = message.trim();
  if (!t || isGeneralKnowledgeQuestion(t)) return false;
  return wantsOnScreenGuide(t);
}

/** Whether the chat API should receive any screen / UI payload (path, controls, uiState). */
export function chatIncludesScreenPayload(
  mode: "chat" | "guide",
  message: string,
): boolean {
  if (mode === "guide") return true;
  return chatNeedsScreenInventory(message);
}

export function pathOnlyScreenPayload(): PathOnlyScreen {
  return {
    path: window.location.pathname + window.location.search,
    title: document.title,
  };
}

export function useFullUiContextForRequest(
  mode: "chat" | "guide",
  message: string,
): boolean {
  return chatIncludesScreenPayload(mode, message);
}

export type ApiScreenPayload = Pick<
  ScreenSnapshot,
  "path" | "title" | "viewport" | "elements" | "sidebar" | "uiState"
>;

/** Screen JSON from the client; fields may be missing before validation. */
export type ChatApiScreenInput = Partial<ApiScreenPayload>;

export function stripToPathOnly(
  screen?: ChatApiScreenInput | null,
): PathOnlyScreen | undefined {
  if (!screen?.path) return undefined;
  return { path: screen.path, title: screen.title ?? "" };
}

/** Nav “where is…” questions without full DOM scan — sidebar open/closed only. */
export function chatNeedsNavChromeOnly(message: string): boolean {
  const t = message.trim();
  if (!t || isGeneralKnowledgeQuestion(t)) return false;
  if (chatNeedsScreenInventory(t)) return false;
  return needsAppNavKnowledge(t);
}
