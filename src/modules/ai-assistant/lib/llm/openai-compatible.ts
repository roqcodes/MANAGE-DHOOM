import { extractAssistantText } from "./assistant-text";
import type { LlmGenerationConfig } from "./generation-config";
import { isLimitOrOverloadError, parseErrorMessage } from "./limit-errors";

export type LlmChatMessage = { role: string; content: string };

export type OpenAiCompatResult =
  | {
      ok: true;
      reply: string;
      latencyMs: number;
      completionTokens?: number;
    }
  | { ok: false; retryable: boolean; status: number; error: string };

export async function completeOpenAiCompatibleChat(
  url: string,
  apiKey: string,
  model: string,
  messages: LlmChatMessage[],
  timeoutMs: number,
  extraHeaders?: Record<string, string>,
  generation?: LlmGenerationConfig,
): Promise<OpenAiCompatResult> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: generation?.temperature ?? 0.4,
        max_tokens: generation?.maxOutputTokens ?? 2048,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        choices?: {
          message?: { content?: string; reasoning?: string };
        }[];
        usage?: { completion_tokens?: number };
      };
      const reply = extractAssistantText(data.choices?.[0]?.message);
      if (reply) {
        return {
          ok: true,
          reply,
          latencyMs: Date.now() - started,
          completionTokens: data.usage?.completion_tokens,
        };
      }
      return {
        ok: false,
        retryable: true,
        status: 502,
        error: "Empty model reply.",
      };
    }

    const detail = await response.text().catch(() => "");
    const error = parseErrorMessage(detail);
    const retryable = isLimitOrOverloadError(response.status, error);
    return {
      ok: false,
      retryable,
      status: response.status,
      error,
    };
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    return {
      ok: false,
      retryable: timeout,
      status: timeout ? 504 : 502,
      error:
        error instanceof Error ? error.message : "Chat completion failed.",
    };
  }
}
