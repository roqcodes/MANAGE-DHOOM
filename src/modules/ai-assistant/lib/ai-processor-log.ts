export type AiProcessor = "api" | "local" | "heuristic";

export type AiProcessorLogDetails = {
  processor: AiProcessor;
  model?: string;
  context?: string;
  latencyMs?: number;
  completionTokens?: number;
  tokensPerSecond?: number;
  /** Local inference breakdown */
  webgpu?: boolean;
  gpu?: string;
  modelLoadMs?: number;
  prefillMs?: number;
  generationMs?: number;
  generationTokPerSec?: number;
  totalLatencyMs?: number;
  deviceTier?: string;
};

const LOG_PREFIX = "[BuyHub AI]";

export function estimateTokenCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

/** Format one line for the dev server terminal (Node only). */
export function formatAiProcessorLogLine(details: AiProcessorLogDetails): string {
  if (
    details.processor === "local" &&
    (details.prefillMs != null || details.generationTokPerSec != null)
  ) {
    const parts = [
      "local",
      details.model ? `model=${details.model}` : "",
      details.gpu ? `gpu=${details.gpu}` : "",
      `webgpu=${details.webgpu ?? true}`,
      details.deviceTier ? `tier=${details.deviceTier}` : "",
      details.context ? `context=${details.context}` : "",
      details.modelLoadMs != null
        ? `modelLoadMs=${Math.round(details.modelLoadMs)}`
        : "",
      details.prefillMs != null
        ? `prefillMs=${Math.round(details.prefillMs)}`
        : "",
      details.generationMs != null
        ? `generationMs=${Math.round(details.generationMs)}`
        : "",
      details.completionTokens != null
        ? `completionTokens=${details.completionTokens}`
        : "",
      details.generationTokPerSec != null
        ? `generationTokPerSec=${details.generationTokPerSec.toFixed(2)}`
        : "",
      details.totalLatencyMs != null
        ? `totalLatencyMs=${Math.round(details.totalLatencyMs)}`
        : "",
    ].filter(Boolean);
    return `${LOG_PREFIX} ${parts.join(" ")}`;
  }

  const parts: string[] = [`processor=${details.processor}`];
  if (details.model) parts.push(`model=${details.model}`);
  if (details.context) parts.push(`context=${details.context}`);
  if (details.gpu) parts.push(`gpu=${details.gpu}`);
  if (details.webgpu != null) parts.push(`webgpu=${details.webgpu}`);
  if (details.deviceTier) parts.push(`tier=${details.deviceTier}`);

  const latencyMs = details.totalLatencyMs ?? details.latencyMs;
  const completionTokens = details.completionTokens;
  let tokPerSec = details.generationTokPerSec ?? details.tokensPerSecond;

  if (
    tokPerSec == null &&
    completionTokens != null &&
    completionTokens > 0 &&
    latencyMs != null &&
    latencyMs > 0 &&
    details.processor === "api"
  ) {
    tokPerSec = completionTokens / (latencyMs / 1000);
  }

  if (latencyMs != null) parts.push(`latencyMs=${Math.round(latencyMs)}`);
  if (completionTokens != null) {
    parts.push(`completion_tokens=${completionTokens}`);
  }
  if (tokPerSec != null && Number.isFinite(tokPerSec)) {
    parts.push(`${tokPerSec.toFixed(1)} tok/s`);
  }

  return `${LOG_PREFIX} ${parts.join(" ")}`;
}

/** Write to the Next.js terminal only (call from API routes / server code). */
export function writeAiProcessorLog(details: AiProcessorLogDetails): void {
  console.info(formatAiProcessorLogLine(details));
}

/** Client: forward metrics to the server terminal (no browser console, no UI). */
export function logAiProcessing(details: AiProcessorLogDetails): void {
  if (typeof window === "undefined") {
    writeAiProcessorLog(details);
    return;
  }
  void fetch("/api/ai-assistant/processor-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(details),
    keepalive: true,
  }).catch(() => {});
}
