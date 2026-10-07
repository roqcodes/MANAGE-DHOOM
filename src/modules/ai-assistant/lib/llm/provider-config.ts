export type LlmProviderId = "google" | "groq" | "mistral";

export type LlmPurpose = "guide" | "chat";

export type ProviderConfig = {
  id: LlmProviderId;
  apiKey: string;
  models: string[];
};

export type ModelAttemptSpec = {
  provider: ProviderConfig;
  model: string;
  /** `providerId:modelId` */
  label: string;
  timeoutMs: number;
};

/** Lite first for speed; 3.8 when lite is slow or on cooldown. */
const DEFAULT_GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.8-flash"];

/**
 * Lead with models that work on the free developer tier (404s on deprecated IDs are skipped quickly).
 * @see https://console.groq.com/docs/models
 */
const DEFAULT_GROQ_MODELS = [
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "llama-3.3-70b-versatile",
];

/** Free tier: lighter model first; small model for structured guide replies. */
const DEFAULT_MISTRAL_MODELS = ["ministral-8b-latest", "mistral-small-latest"];

const GUIDE_ATTEMPT_TIMEOUTS_MS = [12_000, 14_000, 16_000, 18_000, 20_000, 22_000, 25_000];
const CHAT_ATTEMPT_TIMEOUTS_MS = [18_000, 22_000, 28_000, 35_000, 42_000, 50_000];

function parseModelList(
  envValue: string | undefined,
  primary: string | undefined,
  defaults: string[],
): string[] {
  const fromList = envValue
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const merged = [
    ...(primary?.trim() ? [primary.trim()] : []),
    ...(fromList ?? []),
    ...defaults,
  ];
  return [...new Set(merged)];
}

export function resolveLlmProviderChain(): ProviderConfig[] {
  const geminiKey =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_AI_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const mistralKey = process.env.MISTRAL_API_KEY?.trim();

  const chain: ProviderConfig[] = [];

  if (geminiKey) {
    chain.push({
      id: "google",
      apiKey: geminiKey,
      models: parseModelList(
        process.env.GEMINI_MODEL_FALLBACKS,
        process.env.GEMINI_MODEL ?? process.env.GOOGLE_AI_MODEL,
        DEFAULT_GEMINI_MODELS,
      ),
    });
  }

  if (groqKey) {
    chain.push({
      id: "groq",
      apiKey: groqKey,
      models: parseModelList(
        process.env.GROQ_MODEL_FALLBACKS,
        process.env.GROQ_MODEL,
        DEFAULT_GROQ_MODELS,
      ),
    });
  }

  if (mistralKey) {
    chain.push({
      id: "mistral",
      apiKey: mistralKey,
      models: parseModelList(
        process.env.MISTRAL_MODEL_FALLBACKS,
        process.env.MISTRAL_MODEL,
        DEFAULT_MISTRAL_MODELS,
      ),
    });
  }

  const orderRaw = process.env.AI_PROVIDER_ORDER?.trim();
  if (!orderRaw || chain.length <= 1) {
    return chain;
  }

  const order = orderRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as LlmProviderId[];

  const rank = new Map(order.map((id, i) => [id, i]));
  return [...chain].sort(
    (a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99),
  );
}

function resolveAttemptTimeoutMs(
  purpose: LlmPurpose,
  attemptIndex: number,
  capMs: number,
): number {
  const table =
    purpose === "guide" ? GUIDE_ATTEMPT_TIMEOUTS_MS : CHAT_ATTEMPT_TIMEOUTS_MS;
  const base = table[Math.min(attemptIndex, table.length - 1)];
  return Math.min(base, capMs);
}

function buildSequentialAttempts(
  providers: ProviderConfig[],
  purpose: LlmPurpose,
  maxModelsPerProvider: number,
  capMs: number,
): ModelAttemptSpec[] {
  const attempts: ModelAttemptSpec[] = [];
  for (const provider of providers) {
    const models = provider.models.slice(0, maxModelsPerProvider);
    for (const model of models) {
      const timeoutMs = resolveAttemptTimeoutMs(
        purpose,
        attempts.length,
        capMs,
      );
      attempts.push({
        provider,
        model,
        label: `${provider.id}:${model}`,
        timeoutMs,
      });
    }
  }
  return attempts;
}

/** Round-robin across providers so one slow vendor does not block the whole chain. */
function buildInterleavedAttempts(
  providers: ProviderConfig[],
  purpose: LlmPurpose,
  maxModelsPerProvider: number,
  capMs: number,
): ModelAttemptSpec[] {
  const buckets = providers.map((provider) => ({
    provider,
    models: provider.models.slice(0, maxModelsPerProvider),
  }));
  const attempts: ModelAttemptSpec[] = [];
  let round = 0;
  let added = true;
  while (added) {
    added = false;
    for (const bucket of buckets) {
      const model = bucket.models[round];
      if (!model) continue;
      added = true;
      const timeoutMs = resolveAttemptTimeoutMs(
        purpose,
        attempts.length,
        capMs,
      );
      attempts.push({
        provider: bucket.provider,
        model,
        label: `${bucket.provider.id}:${model}`,
        timeoutMs,
      });
    }
    round += 1;
  }
  return attempts;
}

export function resolveModelAttemptChain(
  purpose: LlmPurpose,
  options?: { maxModelsPerProvider?: number; capTimeoutMs?: number },
): ModelAttemptSpec[] {
  const providers = resolveLlmProviderChain();
  const envMax = Number(process.env.AI_MAX_MODELS_PER_PROVIDER);
  const defaultMax = purpose === "guide" ? 2 : 4;
  const maxModelsPerProvider =
    options?.maxModelsPerProvider ??
    (Number.isFinite(envMax) && envMax > 0 ? envMax : defaultMax);

  const capMs =
    options?.capTimeoutMs ??
    (purpose === "guide" ? 25_000 : 50_000);

  const interleave =
    process.env.AI_INTERLEAVE_PROVIDERS !== "0" && providers.length > 1;

  if (interleave) {
    return buildInterleavedAttempts(
      providers,
      purpose,
      maxModelsPerProvider,
      capMs,
    );
  }
  return buildSequentialAttempts(
    providers,
    purpose,
    maxModelsPerProvider,
    capMs,
  );
}

/** First model from each provider for optional parallel hedge (guide only). */
export function pickHedgeAttempts(
  attempts: ModelAttemptSpec[],
  maxProviders = 2,
): ModelAttemptSpec[] {
  const seen = new Set<LlmProviderId>();
  const hedge: ModelAttemptSpec[] = [];
  for (const attempt of attempts) {
    if (seen.has(attempt.provider.id)) continue;
    seen.add(attempt.provider.id);
    hedge.push(attempt);
    if (hedge.length >= maxProviders) break;
  }
  return hedge;
}
