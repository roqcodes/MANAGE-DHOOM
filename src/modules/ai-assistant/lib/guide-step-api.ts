"use client";

import type { ChatTurn } from "../context/AiAssistantContext";
import { logAiProcessing } from "./ai-processor-log";
import type { ScreenSnapshot } from "./screen-snapshot";

const GUIDE_API_TIMEOUT_MS = 50_000;

export async function completeGuideStepViaApi(
  goal: string,
  lastEvent: string,
  screen: ScreenSnapshot,
  chatHistory: ChatTurn[],
): Promise<string> {
  const requestStarted = performance.now();
  const response = await fetch("/api/ai-assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "guide",
      goal,
      lastEvent,
      chatHistory: chatHistory.slice(-8),
      screen,
    }),
    signal: AbortSignal.timeout(GUIDE_API_TIMEOUT_MS),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Guide request failed",
    );
  }

  logAiProcessing({
    processor: "api",
    model: typeof data.model === "string" ? data.model : undefined,
    context: "guide",
    latencyMs:
      typeof data.latencyMs === "number"
        ? data.latencyMs
        : performance.now() - requestStarted,
    completionTokens:
      typeof data.completionTokens === "number"
        ? data.completionTokens
        : undefined,
  });

  return String(data.reply ?? "");
}
