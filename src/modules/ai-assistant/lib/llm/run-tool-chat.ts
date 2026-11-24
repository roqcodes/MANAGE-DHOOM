import { completeChatWithProviderFallback } from "./complete-chat";
import type { LlmChatMessage } from "./openai-compatible";
import { executeAssistantTool } from "../tools/execute-tools";
import { scopedPresentationFlags } from "../message-intent";
import {
  ensurePresentationInReply,
  type PresentationOptions,
} from "../tool-presentation";

const MAX_TOOL_ROUNDS = 3;
const TOOL_ANSWER_NUDGE_RE = /^Use the tool results above\./;

function compactToolResult(value: unknown): string {
  const json = JSON.stringify(value);
  if (json.length <= 6_000) return json;
  return `${json.slice(0, 6_000)}…[truncated]`;
}

function callKey(name: string, args: string) {
  return `${name}:${args.replace(/\s+/g, "")}`;
}

function lastUserMessageText(messages: LlmChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role !== "user" || typeof m.content !== "string") continue;
    const text = m.content.trim();
    if (!text || TOOL_ANSWER_NUDGE_RE.test(text)) continue;
    return m.content;
  }
  return "";
}

function presentationOptionsForMessages(
  messages: LlmChatMessage[],
): PresentationOptions | undefined {
  const userText = lastUserMessageText(messages);
  if (!userText) return undefined;
  const flags = scopedPresentationFlags(userText);
  if (!flags.textOnly && !flags.narrowSuperlative) return undefined;
  return {
    omitTablesAndCharts: flags.textOnly,
    narrowLeaderboard: flags.narrowSuperlative,
  };
}

function finalizeReply(
  reply: string,
  results: unknown[],
  messages: LlmChatMessage[],
): string {
  return ensurePresentationInReply(
    reply,
    results,
    presentationOptionsForMessages(messages),
  );
}

function fallbackFromToolResults(
  results: unknown[],
  messages: LlmChatMessage[],
): string {
  const bills: Array<Record<string, unknown>> = [];
  for (const result of results) {
    if (!result || typeof result !== "object") continue;
    const rec = result as Record<string, unknown>;
    const rows = Array.isArray(rec.bills)
      ? rec.bills
      : Array.isArray(rec.rows)
        ? rec.rows
        : [];
    for (const row of rows) {
      if (row && typeof row === "object") bills.push(row as Record<string, unknown>);
    }
  }

  if (bills.length > 0) {
    const ranked = [...bills].sort(
      (a, b) =>
        Number(b.balance_due ?? b.total_amount ?? 0) -
        Number(a.balance_due ?? a.total_amount ?? 0),
    );
    const top = ranked[0];
    const vendor =
      String(top.vendor_name ?? top.vendor ?? "Unknown vendor");
    const billNo = String(
      top.purchase_bill_number ?? top.bill_number ?? top.invoice_number ?? "",
    );
    const due = Number(top.balance_due ?? top.total_amount ?? 0);
    return finalizeReply(
      [
        `Largest open balance is ${billNo || "that bill"} (${vendor}, ${due.toLocaleString()} due).`,
        "[SUGGEST:Show all open payables|Which vendor is next?|Open purchase bills]",
        "[POINT:none]",
      ].join("\n"),
      results,
      messages,
    );
  }

  return finalizeReply(
    ["I have the data but couldn't summarize it — try a narrower question.", "[POINT:none]"].join(
      "\n",
    ),
    results,
    messages,
  );
}

export async function completeChatWithTools(
  messages: LlmChatMessage[],
  options: {
    timeoutMs: number;
    maxModelsPerProvider?: number;
  },
) {
  const started = Date.now();
  const working = [...messages];
  let lastModel = "";
  let completionTokens = 0;
  let usedTools = false;
  const seenCalls = new Set<string>();
  const collectedResults: unknown[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const remaining = Math.max(8_000, options.timeoutMs - (Date.now() - started));
    const forceAnswer = round === MAX_TOOL_ROUNDS - 1 && usedTools;
    if (forceAnswer) {
      working.push({
        role: "user",
        content:
          "Use the tool results above. Answer only what they asked (direct fact first; for placement/superlative asks, at most #1 and #2 in speech). Then [SUGGEST:…] and [POINT:none]. No more tool calls.",
      });
    }

    const result = await completeChatWithProviderFallback(working, {
      timeoutMs: remaining,
      maxModelsPerProvider: options.maxModelsPerProvider,
      purpose: "chat",
      tools: true,
      toolChoice: forceAnswer ? "none" : "auto",
      preferModel: lastModel || undefined,
    });
    if (!result.ok) {
      if (collectedResults.length > 0) {
        return {
          ok: true as const,
          reply: fallbackFromToolResults(collectedResults, working),
          model: lastModel || "fallback",
          latencyMs: Date.now() - started,
          completionTokens,
          usedTools,
        };
      }
      return { ...result, usedTools };
    }
    lastModel = result.model;
    completionTokens += result.completionTokens ?? 0;

    const calls = result.toolCalls ?? [];
    if (calls.length === 0) {
      if (result.reply?.trim()) {
        return {
          ok: true as const,
          reply: finalizeReply(result.reply, collectedResults, working),
          model: lastModel,
          latencyMs: Date.now() - started,
          completionTokens,
          usedTools,
        };
      }
      if (collectedResults.length > 0) {
        return {
          ok: true as const,
          reply: fallbackFromToolResults(collectedResults, working),
          model: lastModel,
          latencyMs: Date.now() - started,
          completionTokens,
          usedTools,
        };
      }
    }

    if (forceAnswer || calls.length === 0) {
      return {
        ok: true as const,
        reply: finalizeReply(
          result.reply?.trim() ||
            fallbackFromToolResults(collectedResults, working),
          collectedResults,
          working,
        ),
        model: lastModel,
        latencyMs: Date.now() - started,
        completionTokens,
        usedTools,
      };
    }

    usedTools = true;
    working.push({
      role: "assistant",
      content: result.reply || "",
      toolCalls: calls,
    });

    for (const call of calls) {
      const key = callKey(call.name, call.arguments);
      let payload: unknown;
      if (seenCalls.has(key)) {
        payload = {
          error:
            "Duplicate lookup skipped. Use the previous result and answer now.",
        };
      } else {
        seenCalls.add(key);
        try {
          payload = await executeAssistantTool(call.name, call.arguments);
        } catch (error) {
          payload = {
            error: error instanceof Error ? error.message : "Tool failed",
          };
        }
      }
      collectedResults.push(payload);
      working.push({
        role: "tool",
        name: call.name,
        toolCallId: call.id,
        content: compactToolResult(payload),
      });
    }
  }

  return {
    ok: true as const,
    reply: fallbackFromToolResults(collectedResults, working),
    model: lastModel || "fallback",
    latencyMs: Date.now() - started,
    completionTokens,
    usedTools,
  };
}
