import "server-only";

type CooldownEntry = {
  until: number;
  reason: string;
};

const store = new Map<string, CooldownEntry>();

const MIN_COOLDOWN_MS = 3 * 60 * 1000;
const MAX_COOLDOWN_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_COOLDOWN_MS = 75_000;
const DEFAULT_NOT_FOUND_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function resolveOverloadCooldownMs(): number {
  const fixed = Number(process.env.AI_MODEL_COOLDOWN_MS);
  if (Number.isFinite(fixed) && fixed >= MIN_COOLDOWN_MS) {
    return Math.min(fixed, MAX_COOLDOWN_MS * 2);
  }
  const min = Number(process.env.AI_MODEL_COOLDOWN_MIN_MS);
  const max = Number(process.env.AI_MODEL_COOLDOWN_MAX_MS);
  const lo =
    Number.isFinite(min) && min >= 60_000 ? min : MIN_COOLDOWN_MS;
  const hi =
    Number.isFinite(max) && max >= lo ? max : MAX_COOLDOWN_MS;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function resolveCooldownMs(status?: number, reason?: string): number {
  if (status === 504) {
    const raw = Number(process.env.AI_TIMEOUT_COOLDOWN_MS);
    return Number.isFinite(raw) && raw >= 15_000
      ? raw
      : DEFAULT_TIMEOUT_COOLDOWN_MS;
  }
  if (status === 404) {
    const raw = Number(process.env.AI_MODEL_NOT_FOUND_COOLDOWN_MS);
    return Number.isFinite(raw) && raw >= 60_000
      ? raw
      : DEFAULT_NOT_FOUND_COOLDOWN_MS;
  }
  const lower = (reason ?? "").toLowerCase();
  if (/does not exist|not found|invalid model|is not supported/i.test(lower)) {
    const raw = Number(process.env.AI_MODEL_NOT_FOUND_COOLDOWN_MS);
    return Number.isFinite(raw) && raw >= 60_000
      ? raw
      : DEFAULT_NOT_FOUND_COOLDOWN_MS;
  }
  return resolveOverloadCooldownMs();
}

/** Skip calling this model until cooldown expires (per Node process). */
export function isModelOnCooldown(modelKey: string): boolean {
  const entry = store.get(modelKey);
  if (!entry) return false;
  if (Date.now() >= entry.until) {
    store.delete(modelKey);
    return false;
  }
  return true;
}

export function getModelCooldownRemainingMs(modelKey: string): number {
  const entry = store.get(modelKey);
  if (!entry) return 0;
  return Math.max(0, entry.until - Date.now());
}

export function markModelCooldown(
  modelKey: string,
  reason: string,
  status?: number,
): void {
  const until = Date.now() + resolveCooldownMs(status, reason);
  store.set(modelKey, { until, reason });
  const mins = Math.round((until - Date.now()) / 60_000);
  console.warn(
    `[BuyHub AI] ${modelKey} on hold ~${mins}m (${status ?? "error"}: ${reason.slice(0, 120)})`,
  );
}

/** Failures that should not be retried on every request for a few minutes. */
export function shouldCooldownModel(status: number, message: string): boolean {
  if (status === 429 || status === 503 || status === 529 || status === 402) {
    return true;
  }
  const lower = message.toLowerCase();
  return (
    /high demand|overloaded|temporarily unavailable|rate.?limit|too many requests|quota|resource.?exhausted|capacity|limit:\s*0/i.test(
      lower,
    ) || /RESOURCE_EXHAUSTED|RATE_LIMIT|QUOTA_EXCEEDED/i.test(message)
  );
}
