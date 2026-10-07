import type { HandlerResult } from "@/lib/sync/operation-handler";
import type { HttpExecutionResult } from "@/lib/sync/sync-http";
import { handlerResultFromHttp } from "@/lib/sync/operation-handler";

type IdempotentApiEnvelope<T> = {
  idempotentReplay?: boolean;
  result?: T;
};

export function handlerResultFromIdempotentHttp(
  result: HttpExecutionResult,
): HandlerResult {
  const base = handlerResultFromHttp(result);
  if (base.outcome !== "committed") {
    return base;
  }
  const raw = base.serverResult;
  if (raw && typeof raw === "object" && "result" in raw) {
    const envelope = raw as IdempotentApiEnvelope<unknown>;
    return {
      outcome: "committed",
      serverResult: envelope.result,
    };
  }
  return base;
}
