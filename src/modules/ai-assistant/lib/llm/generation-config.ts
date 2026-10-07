import type { LlmPurpose } from "./provider-config";

export type LlmGenerationConfig = {
  temperature: number;
  maxOutputTokens: number;
};

/** Tighter caps on guide turns reduce latency and invented UI targets. */
export function resolveGenerationConfig(purpose: LlmPurpose): LlmGenerationConfig {
  if (purpose === "guide") {
    return { temperature: 0.15, maxOutputTokens: 384 };
  }
  return { temperature: 0.35, maxOutputTokens: 1200 };
}
