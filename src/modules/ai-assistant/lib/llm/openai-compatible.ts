import { extractAssistantText } from "./assistant-text";
import type { LlmGenerationConfig } from "./generation-config";
import { isLimitOrOverloadError, parseErrorMessage } from "./limit-errors";

export type LlmToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type LlmChatMessage = {
  role: string;
  content: string;
  toolCalls?: LlmToolCall[];
  toolCallId?: string;
  name?: string;
};

export type OpenAiToolSpec = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type OpenAiCompatResult =
  | {
      ok: true;
      reply: string;
      toolCalls?: LlmToolCall[];
      latencyMs: number;
      completionTokens?: number;
    }
  | { ok: false; retryable: boolean; status: number; error: string };

function toOpenAiMessages(messages: LlmChatMessage[]) {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool",
        content: m.content,
        tool_call_id: m.toolCallId ?? "tool",
        name: m.name,
      };
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: c.arguments },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

export async function completeOpenAiCompatibleChat(
  url: string,
  apiKey: string,
  model: string,
  messages: LlmChatMessage[],
  timeoutMs: number,
  extraHeaders?: Record<string, string>,
  generation?: LlmGenerationConfig,
  tools?: OpenAiToolSpec[],
  toolChoice: "auto" | "none" = "auto",
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
        messages: toOpenAiMessages(messages),
        temperature: generation?.temperature ?? 0.4,
        max_tokens: generation?.maxOutputTokens ?? 2048,
        ...(tools?.length
          ? { tools, tool_choice: toolChoice }
          : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        choices?: {
          message?: {
            content?: string;
            reasoning?: string;
            tool_calls?: {
              id?: string;
              function?: { name?: string; arguments?: string };
            }[];
          };
        }[];
        usage?: { completion_tokens?: number };
      };
      const message = data.choices?.[0]?.message;
      const toolCalls: LlmToolCall[] = (message?.tool_calls ?? [])
        .filter((c) => c.function?.name)
        .map((c, i) => ({
          id: c.id || `call_${i}_${c.function!.name}`,
          name: c.function!.name!,
          arguments: c.function?.arguments || "{}",
        }));
      if (toolCalls.length > 0) {
        return {
          ok: true,
          reply: message?.content?.trim() ?? "",
          toolCalls,
          latencyMs: Date.now() - started,
          completionTokens: data.usage?.completion_tokens,
        };
      }
      const reply = extractAssistantText(message);
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
