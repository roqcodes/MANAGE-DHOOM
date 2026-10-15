import { extractAssistantText } from "./assistant-text";
import { isLimitOrOverloadError, parseErrorMessage } from "./limit-errors";
import type { LlmChatMessage, LlmToolCall, OpenAiCompatResult } from "./openai-compatible";
import type { LlmGenerationConfig } from "./generation-config";

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args?: Record<string, unknown> } }
  | {
      functionResponse: {
        name: string;
        response: Record<string, unknown>;
      };
    };

function toGeminiPayload(
  messages: LlmChatMessage[],
  tools?: unknown[],
  toolChoice: "auto" | "none" = "auto",
) {
  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const contents: { role: string; parts: GeminiPart[] }[] = [];

  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      let parsed: Record<string, unknown> = { result: m.content };
      try {
        const json = JSON.parse(m.content) as unknown;
        if (Array.isArray(json)) {
          parsed = { items: json };
        } else if (json && typeof json === "object") {
          parsed = json as Record<string, unknown>;
        } else {
          parsed = { result: m.content };
        }
      } catch {
        parsed = { result: m.content };
      }
      const part: GeminiPart = {
        functionResponse: {
          name: m.name || "tool",
          response: parsed,
        },
      };
      const last = contents[contents.length - 1];
      if (last?.role === "user" && last.parts.every((p) => "functionResponse" in p)) {
        last.parts.push(part);
      } else {
        contents.push({ role: "user", parts: [part] });
      }
      continue;
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      contents.push({
        role: "model",
        parts: m.toolCalls.map((c) => {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(c.arguments || "{}") as Record<string, unknown>;
          } catch {
            args = {};
          }
          return { functionCall: { name: c.name, args } };
        }),
      });
      continue;
    }
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content || " " }],
    });
  }

  return {
    systemInstruction: systemParts
      ? { parts: [{ text: systemParts }] }
      : undefined,
    contents,
    ...(tools?.length
      ? {
          tools,
          toolConfig: {
            functionCallingConfig: {
              mode: toolChoice === "none" ? "NONE" : "AUTO",
            },
          },
        }
      : {}),
  };
}

export async function completeGoogleGeminiChat(
  apiKey: string,
  model: string,
  messages: LlmChatMessage[],
  timeoutMs: number,
  generation?: LlmGenerationConfig,
  tools?: unknown[],
  toolChoice: "auto" | "none" = "auto",
): Promise<OpenAiCompatResult> {
  const started = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...toGeminiPayload(messages, tools, toolChoice),
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
          content?: {
            parts?: Array<{
              text?: string;
              functionCall?: {
                name?: string;
                args?: Record<string, unknown>;
              };
            }>;
          };
        }[];
        usageMetadata?: { candidatesTokenCount?: number };
      };
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const toolCalls: LlmToolCall[] = parts
        .filter((p) => p.functionCall?.name)
        .map((p, i) => ({
          id: `gemini_${i}_${p.functionCall!.name}`,
          name: p.functionCall!.name!,
          arguments: JSON.stringify(p.functionCall?.args ?? {}),
        }));
      if (toolCalls.length > 0) {
        return {
          ok: true,
          reply: parts.map((p) => p.text ?? "").join("").trim(),
          toolCalls,
          latencyMs: Date.now() - started,
          completionTokens: data.usageMetadata?.candidatesTokenCount,
        };
      }
      const text = parts.map((p) => p.text ?? "").join("").trim();
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
