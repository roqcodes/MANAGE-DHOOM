import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  inferGoalIntent,
  userAllowsHeaderQuickCreate,
} from "@/modules/ai-assistant/lib/goal-intent";
import {
  isGeneralKnowledgeQuestion,
  looksLikePromptInjection,
  refusalForAbuse,
  wantsOnScreenGuide,
} from "@/modules/ai-assistant/lib/message-intent";
import {
  type ChatApiScreenInput,
  chatIncludesScreenPayload,
  useFullUiContextForRequest,
} from "@/modules/ai-assistant/lib/chat-request-context";
import { completeChatWithProviderFallback } from "@/modules/ai-assistant/lib/llm/complete-chat";
import { screenContextBlock } from "@/modules/ai-assistant/lib/screen-context-block";
import { writeAiProcessorLog } from "@/modules/ai-assistant/lib/ai-processor-log";
import {
  AI_ASSISTANT_FAQ_SYSTEM_PROMPT,
  AI_ASSISTANT_UI_SYSTEM_PROMPT,
} from "@/modules/ai-assistant/lib/system-prompt";
import { buildSitemapContextBlock } from "@/modules/ai-assistant/lib/sitemap-context";

type ChatMessage = { role: "user" | "assistant"; content: string };

const DEFAULT_CHAT_TIMEOUT_MS = 45_000;

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
  const onScreenAsk = wantsOnScreenGuide(goal || userText || "");
  const generalAsk = isGeneralKnowledgeQuestion(goal || userText || "");
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

  const contextNote = screenContextBlock(
    screenPayload,
    fullUi
      ? [
          goal ? `User goal: ${goal}` : "",
          `Goal type: ${intent.kind}`,
          `Finish line: ${intent.finishLine}`,
          quickCreateGoal
            ? "User asked about header Quick create — you may point at CREATE / that menu."
            : "Do NOT use header Quick create (blue CREATE). Use sidebar + page actions (e.g. Products → New item).",
          lastEvent ? `Latest user action: ${lastEvent}` : "",
          isGuide
            ? "Live guide turn. Obey Live UI state / CONFLICT rules first. If the finish line is already met (create UI open for this goal), reply with a short done message and [POINT:none]. If another form/dialog is open, ask to close it before navigation. Otherwise point at the single next control. Never fill the form unless the goal is about fields."
            : "Chat turn for a UI how-to. Short spoken answer plus one [POINT:eN:label] for the first control on THIS screen if one exists; otherwise [POINT:none]. User may start live guide separately.",
        ]
          .filter(Boolean)
          .join("\n")
      : generalAsk
        ? "FAQ turn. Short formatted answer + [SUGGEST:2-3 follow-ups] + [POINT:none]."
        : "Chat turn. Short answer + [SUGGEST:2-3 follow-ups] + [POINT:none]. You do not see the live UI on this turn.",
    {
      includeScreen,
      goal: includeScreen ? goalForContext : undefined,
      intent: includeScreen ? intent : undefined,
    },
  );

  const systemContent = [
    systemPrompt,
    sitemapBlock,
    contextNote,
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages = [
    { role: "system", content: systemContent },
    ...chatHistory.slice(-12).map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user",
      content: isGuide
        ? `Continue the on-screen guide for: ${goal ?? "the current task"}. ${lastEvent ?? ""} Reply with spoken text then one [POINT:...] tag.`
        : userText!,
    },
  ];

  const timeoutMs = resolveChatTimeoutMs(isGuide ? "guide" : "chat");
  const result = await completeChatWithProviderFallback(messages, {
    timeoutMs,
    maxModelsPerProvider: isGuide ? 2 : 4,
    purpose: isGuide ? "guide" : "chat",
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
