import { resolveGenerationConfig } from "./generation-config";
import { completeGoogleGeminiChat } from "./google-gemini";
import { isAbortTimeout } from "./limit-errors";
import {
  completeOpenAiCompatibleChat,
  type LlmChatMessage,
  type OpenAiCompatResult,
} from "./openai-compatible";
import {
  getModelCooldownRemainingMs,
  isModelOnCooldown,
  markModelCooldown,
  shouldCooldownModel,
} from "./model-cooldown";
import {
  type LlmPurpose,
  type ModelAttemptSpec,
  pickHedgeAttempts,
  resolveLlmProviderChain,
  resolveModelAttemptChain,
} from "./provider-config";

export type CompleteChatSuccess = {
  ok: true;
  reply: string;
  /** e.g. `google:gemini-2.5-flash` */
  model: string;
  latencyMs: number;
  completionTokens?: number;
};

export type CompleteChatFailure = {
  ok: false;
  status: number;
  error: string;
};

export type CompleteChatResult = CompleteChatSuccess | CompleteChatFailure;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

async function completeProviderModel(
  attempt: ModelAttemptSpec,
  messages: LlmChatMessage[],
  generation: ReturnType<typeof resolveGenerationConfig>,
): Promise<OpenAiCompatResult> {
  const { provider, model, timeoutMs } = attempt;
  if (provider.id === "google") {
    return completeGoogleGeminiChat(
      provider.apiKey,
      model,
      messages,
      timeoutMs,
      generation,
    );
  }
  const url = provider.id === "groq" ? GROQ_URL : MISTRAL_URL;
  return completeOpenAiCompatibleChat(
    url,
    provider.apiKey,
    model,
    messages,
    timeoutMs,
    undefined,
    generation,
  );
}

function recordAttemptFailure(
  label: string,
  result: Extract<OpenAiCompatResult, { ok: false }>,
): { lastError: string; lastStatus: number } {
  const lastStatus =
    result.status === 429
      ? 429
      : result.status === 504
        ? 504
        : result.status >= 400
          ? result.status
          : 502;
  if (shouldCooldownModel(result.status, result.error)) {
    markModelCooldown(label, result.error, result.status);
  } else {
    console.warn(`[BuyHub AI] ${label} failed (${result.status}):`, result.error);
  }
  return { lastError: result.error, lastStatus };
}

type AttemptOutcome =
  | { kind: "success"; value: CompleteChatSuccess }
  | { kind: "skip" }
  | { kind: "fail"; error: string; status: number };

async function runSingleAttempt(
  attempt: ModelAttemptSpec,
  messages: LlmChatMessage[],
  generation: ReturnType<typeof resolveGenerationConfig>,
): Promise<AttemptOutcome> {
  const { label } = attempt;
  if (isModelOnCooldown(label)) {
    const remainSec = Math.ceil(getModelCooldownRemainingMs(label) / 1000);
    console.info(`[BuyHub AI] ${label} skipped (cooldown, ~${remainSec}s left)`);
    return { kind: "skip" };
  }
  try {
    const result = await completeProviderModel(attempt, messages, generation);
    if (result.ok) {
      return {
        kind: "success",
        value: {
          ok: true,
          reply: result.reply,
          model: label,
          latencyMs: result.latencyMs,
          completionTokens: result.completionTokens,
        },
      };
    }
    const { lastError, lastStatus } = recordAttemptFailure(label, result);
    return { kind: "fail", error: lastError, status: lastStatus };
  } catch (error) {
    if (isAbortTimeout(error)) {
      const lastError = `Request timed out after ${Math.round(attempt.timeoutMs / 1000)}s.`;
      markModelCooldown(label, lastError, 504);
      return { kind: "fail", error: lastError, status: 504 };
    }
    const lastError =
      error instanceof Error ? error.message : "AI request failed.";
    console.warn(`[BuyHub AI] ${label} error:`, lastError);
    return { kind: "fail", error: lastError, status: 502 };
  }
}

/** Race the fastest healthy provider on guide turns (optional). */
async function tryGuideHedge(
  attempts: ModelAttemptSpec[],
  messages: LlmChatMessage[],
  generation: ReturnType<typeof resolveGenerationConfig>,
): Promise<CompleteChatSuccess | null> {
  if (process.env.AI_GUIDE_HEDGE === "0") return null;
  const hedge = pickHedgeAttempts(attempts, 2);
  if (hedge.length < 2) return null;

  return new Promise((resolve) => {
    let pending = hedge.length;
    let settled = false;
    for (const attempt of hedge) {
      void runSingleAttempt(attempt, messages, generation).then((outcome) => {
        if (settled) return;
        if (outcome.kind === "success") {
          settled = true;
          console.info(`[BuyHub AI] guide hedge won on ${outcome.value.model}`);
          resolve(outcome.value);
          return;
        }
        pending -= 1;
        if (pending === 0) resolve(null);
      });
    }
  });
}

export async function completeChatWithProviderFallback(
  messages: LlmChatMessage[],
  options?: {
    timeoutMs?: number;
    maxModelsPerProvider?: number;
    purpose?: LlmPurpose;
  },
): Promise<CompleteChatResult> {
  const purpose = options?.purpose ?? "chat";
  const capTimeoutMs = options?.timeoutMs ?? (purpose === "guide" ? 25_000 : 45_000);
  const generation = resolveGenerationConfig(purpose);

  const chain = resolveLlmProviderChain();
  if (chain.length === 0) {
    return {
      ok: false,
      status: 503,
      error:
        "No AI provider keys configured. Set GEMINI_API_KEY, GROQ_API_KEY, and/or MISTRAL_API_KEY in bh-manage/.env.",
    };
  }

  const attempts = resolveModelAttemptChain(purpose, {
    maxModelsPerProvider: options?.maxModelsPerProvider,
    capTimeoutMs,
  });

  const eligible = attempts.filter((a) => !isModelOnCooldown(a.label));
  if (eligible.length === 0) {
    return {
      ok: false,
      status: 503,
      error:
        "All AI models are on a short cooldown after rate limits or overload. Try again in a few minutes.",
    };
  }

  if (purpose === "guide") {
    const hedged = await tryGuideHedge(eligible, messages, generation);
    if (hedged) return hedged;
  }

  let lastError =
    "All configured AI providers are unavailable or rate-limited.";
  let lastStatus = 503;

  const hedgeLabels = new Set(
    purpose === "guide" && process.env.AI_GUIDE_HEDGE !== "0"
      ? pickHedgeAttempts(eligible, 2).map((a) => a.label)
      : [],
  );

  for (const attempt of eligible) {
    if (hedgeLabels.has(attempt.label)) {
      continue;
    }
    const outcome = await runSingleAttempt(attempt, messages, generation);
    if (outcome.kind === "success") {
      return outcome.value;
    }
    if (outcome.kind === "fail") {
      lastError = outcome.error;
      lastStatus = outcome.status;
    }
  }

  const status =
    lastStatus === 429 ? 429 : lastStatus === 504 ? 504 : 502;
  return { ok: false, status, error: lastError };
}
