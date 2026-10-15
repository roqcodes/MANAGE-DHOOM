import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  inferGoalIntent,
  userAllowsHeaderQuickCreate,
} from "@/modules/ai-assistant/lib/goal-intent";
import {
  looksLikePromptInjection,
  refusalForAbuse,
} from "@/modules/ai-assistant/lib/message-intent";
import {
  type ChatApiScreenInput,
  chatIncludesScreenPayload,
  useFullUiContextForRequest,
} from "@/modules/ai-assistant/lib/chat-request-context";
import { completeChatWithProviderFallback } from "@/modules/ai-assistant/lib/llm/complete-chat";
import { completeChatWithTools } from "@/modules/ai-assistant/lib/llm/run-tool-chat";
import { formatGuideFinishContext } from "@/modules/ai-assistant/lib/assistant-protocol";
import { screenContextBlock } from "@/modules/ai-assistant/lib/screen-context-block";
import { writeAiProcessorLog } from "@/modules/ai-assistant/lib/ai-processor-log";
import {
  AI_ASSISTANT_FAQ_SYSTEM_PROMPT,
  AI_ASSISTANT_UI_SYSTEM_PROMPT,
} from "@/modules/ai-assistant/lib/system-prompt";
import { buildSitemapContextBlock } from "@/modules/ai-assistant/lib/sitemap-context";

type ChatMessage = { role: "user" | "assistant"; content: string };

const DEFAULT_CHAT_TIMEOUT_MS = 70_000;

function resolveChatTimeoutMs(mode: "chat" | "guide"): number {
  const raw = process.env.AI_CHAT_TIMEOUT_MS?.trim();
  const parsed = raw ? Number(raw) : NaN;
  const chatMs =
    Number.isFinite(parsed) && parsed >= 10_000 ? parsed : DEFAULT_CHAT_TIMEOUT_MS;
  return mode === "guide" ? Math.min(chatMs, 25_000) : chatMs;
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  let body: {
    message?: string;
    chatHistory?: ChatMessage[];
    screen?: ChatApiScreenInput;
    mode?: "chat" | "guide";
    goal?: string;
    lastEvent?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const isGuide = body.mode === "guide";
  const goal = body.goal?.trim();
  const lastEvent = body.lastEvent?.trim();
  const userText = body.message?.trim();
  const intent = inferGoalIntent(goal || userText || "");
  const quickCreateGoal = userAllowsHeaderQuickCreate(goal || userText || "");

  if (!isGuide && !userText) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  if (!isGuide && userText && looksLikePromptInjection(userText)) {
    return NextResponse.json({ reply: refusalForAbuse() });
  }

  const chatHistory = Array.isArray(body.chatHistory) ? body.chatHistory : [];
  const messageForIntent = goal || userText || "";
  const includeScreen = chatIncludesScreenPayload(
    isGuide ? "guide" : "chat",
    messageForIntent,
  );
  const fullUi = useFullUiContextForRequest(
    isGuide ? "guide" : "chat",
    messageForIntent,
  );
  const screenPayload: ChatApiScreenInput | undefined = includeScreen
    ? body.screen
    : undefined;

  const systemPrompt = fullUi
    ? AI_ASSISTANT_UI_SYSTEM_PROMPT
    : AI_ASSISTANT_FAQ_SYSTEM_PROMPT;

  const goalForContext = goal || userText || "";
  const sitemapBlock = buildSitemapContextBlock({
    mode: isGuide ? "guide" : "chat",
    message: userText ?? "",
    goal,
    chatHistory,
    hasLiveScreenInventory: includeScreen,
  });

  const turnNote = fullUi
    ? [
        goal ? `Goal: ${goal}` : "",
        `Intent: ${intent.kind}`,
        formatGuideFinishContext(intent.finishLine),
        quickCreateGoal
          ? "Header Quick create is allowed for this goal."
          : "Prefer sidebar + page actions over header Quick create.",
        lastEvent ? `Last event: ${lastEvent}` : "",
        isGuide ? "Guide turn." : "UI-aware chat turn.",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const contextNote = screenContextBlock(
    screenPayload,
    turnNote,
    {
      includeScreen,
      goal: includeScreen ? goalForContext : undefined,
      intent: includeScreen ? intent : undefined,
    },
  );

  const systemContent = [systemPrompt, sitemapBlock, contextNote]
    .filter(Boolean)
    .join("\n\n");

  const messages = [
    { role: "system", content: systemContent },
    ...chatHistory.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user",
      content: isGuide
        ? `Continue the on-screen guide for: ${goal ?? "the current task"}. ${lastEvent ?? ""} Reply with spoken text then one [POINT:...] tag.`
        : userText!,
    },
  ];

  const timeoutMs = resolveChatTimeoutMs(isGuide ? "guide" : "chat");
  /** Live guide + on-screen how-to: DOM inventory is ground truth — no tool loop. */
  const useLiveUiChat = isGuide || fullUi;
  const result = useLiveUiChat
    ? await completeChatWithProviderFallback(messages, {
        timeoutMs,
        maxModelsPerProvider: isGuide ? 2 : 3,
        purpose: isGuide ? "guide" : "chat",
      })
    : await completeChatWithTools(messages, {
        timeoutMs,
        maxModelsPerProvider: 4,
      });

  if (!result.ok) {
    writeAiProcessorLog({
      processor: "api",
      context: `${isGuide ? "guide" : "chat"}-error`,
    });
    console.error("[BuyHub AI] chat failed:", result.error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  writeAiProcessorLog({
    processor: "api",
    model: result.model,
    context: isGuide ? "guide" : "chat",
    latencyMs: result.latencyMs,
    completionTokens: result.completionTokens,
  });

  return NextResponse.json({
    reply: result.reply,
    processor: "api" as const,
    model: result.model,
    latencyMs: result.latencyMs,
    completionTokens: result.completionTokens,
  });
}
