import type { OutboxOperationRecord } from "@/lib/sync/outbox-types";
import { canonicalizePayload } from "@/lib/sync/payload-canonicalize";
import { SYNC_HTTP_DEFAULT_TIMEOUT_MS } from "@/lib/sync/sync-types";
import { classifyHttpStatus } from "@/lib/sync/sync-error-classify";
import { FAILURE_CLASSES, type FailureClass } from "@/lib/sync/sync-types";

export type HttpOperationRequest = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
};

export type HttpExecutionResult =
  | {
      kind: "response";
      status: number;
      ok: boolean;
      bodyText: string;
      failureClass?: FailureClass;
    }
  | {
      kind: "network-error";
      message: string;
      failureClass: FailureClass;
    }
  | {
      kind: "timeout";
      message: string;
      failureClass: FailureClass;
    };

export type ExecuteHttpOptions = {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export async function executeHttpOperation(
  operation: OutboxOperationRecord,
  request: HttpOperationRequest,
  options: ExecuteHttpOptions = {},
): Promise<HttpExecutionResult> {
  const fetchFn = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? SYNC_HTTP_DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const headers = new Headers(request.headers ?? {});
  if (!headers.has("Content-Type") && request.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const body =
    request.body === undefined
      ? undefined
      : typeof request.body === "string"
        ? request.body
        : canonicalizePayload(request.body);

  try {
    const response = await fetchFn(request.url, {
      method: request.method,
      headers,
      body,
      signal: controller.signal,
      credentials: "include",
    });

    const bodyText = await response.text();
    const failureClass = response.ok
      ? undefined
      : classifyHttpStatus(response.status);

    return {
      kind: "response",
      status: response.status,
      ok: response.ok,
      bodyText,
      failureClass,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        kind: "timeout",
        message: error.message,
        failureClass: FAILURE_CLASSES.TIMEOUT,
      };
    }
    return {
      kind: "network-error",
      message: error instanceof Error ? error.message : "Network error",
      failureClass: FAILURE_CLASSES.NETWORK,
    };
  } finally {
    clearTimeout(timeout);
  }
}
