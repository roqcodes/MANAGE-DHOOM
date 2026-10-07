import { extractAssistantText } from "./assistant-text";
import { isLimitOrOverloadError, parseErrorMessage } from "./limit-errors";
import type { LlmChatMessage } from "./openai-compatible";
import type { LlmGenerationConfig } from "./generation-config";
import type { OpenAiCompatResult } from "./openai-compatible";

function toGeminiPayload(messages: LlmChatMessage[]) {
  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  return {
    systemInstruction: systemParts
      ? { parts: [{ text: systemParts }] }
      : undefined,
    contents,
  };
}

export async function completeGoogleGeminiChat(
  apiKey: string,
  model: string,
  messages: LlmChatMessage[],
  timeoutMs: number,
  generation?: LlmGenerationConfig,
): Promise<OpenAiCompatResult> {
  const started = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...toGeminiPayload(messages),
        generationConfig: {
          temperature: generation?.temperature ?? 0.4,
          maxOutputTokens: generation?.maxOutputTokens ?? 2048,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        candidates?: {
          content?: { parts?: { text?: string }[] };
        }[];
        usageMetadata?: { candidatesTokenCount?: number };
      };
      const text =
        data.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("")
          .trim() ?? "";
      const reply = extractAssistantText({ content: text });
      if (reply) {
        return {
          ok: true,
          reply,
          latencyMs: Date.now() - started,
          completionTokens: data.usageMetadata?.candidatesTokenCount,
        };
      }
      return {
        ok: false,
        retryable: true,
        status: 502,
        error: "Empty Gemini reply.",
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
        error instanceof Error ? error.message : "Gemini request failed.",
    };
  }
}
