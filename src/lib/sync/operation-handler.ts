import type { OutboxOperationRecord } from "@/lib/sync/outbox-types";
import {
  executeHttpOperation,
  type ExecuteHttpOptions,
  type HttpExecutionResult,
  type HttpOperationRequest,
} from "@/lib/sync/sync-http";
import { FAILURE_CLASSES, type FailureClass } from "@/lib/sync/sync-types";
import { parseHttpErrorMessage } from "@/lib/sync/parse-http-error";
import {
  classifyHttpStatus,
  shouldRetryFailureClass,
} from "@/lib/sync/sync-error-classify";

export type HandlerResult =
  | { outcome: "committed"; serverResult?: unknown }
  | {
      outcome: "retry";
      failureClass: FailureClass;
      message: string;
      uncertain?: boolean;
    }
  | {
      outcome: "terminal";
      failureClass: FailureClass;
      message: string;
    };

export type OperationExecutionContext = {
  operation: OutboxOperationRecord;
  now: number;
  executeHttp: (
    request: HttpOperationRequest,
    options?: ExecuteHttpOptions,
  ) => Promise<HttpExecutionResult>;
};

export type OperationHandler = {
  type: string;
  execute: (ctx: OperationExecutionContext) => Promise<HandlerResult>;
  classifyError?: (error: unknown) => FailureClass;
};

export class OperationHandlerRegistry {
  private readonly handlers = new Map<string, OperationHandler>();

  register(handler: OperationHandler): void {
    this.handlers.set(handler.type, handler);
  }

  get(operationType: string): OperationHandler | undefined {
    return this.handlers.get(operationType);
  }

  has(operationType: string): boolean {
    return this.handlers.has(operationType);
  }
}

export function createExecutionContext(
  operation: OutboxOperationRecord,
  options?: ExecuteHttpOptions,
): OperationExecutionContext {
  return {
    operation,
    now: Date.now(),
    executeHttp: (request, httpOptions) =>
      executeHttpOperation(operation, request, {
        ...options,
        ...httpOptions,
      }),
  };
}

export function handlerResultFromHttp(
  result: HttpExecutionResult,
): HandlerResult {
  if (result.kind === "network-error") {
    return {
      outcome: "retry",
      failureClass: result.failureClass,
      message: result.message,
    };
  }
  if (result.kind === "timeout") {
    return {
      outcome: "retry",
      failureClass: result.failureClass,
      message: result.message,
      uncertain: true,
    };
  }
  if (result.ok) {
    let serverResult: unknown = result.bodyText;
    try {
      serverResult = JSON.parse(result.bodyText);
    } catch {
      /* plain text */
    }
    return { outcome: "committed", serverResult };
  }

  let failureClass = result.failureClass ?? classifyHttpStatus(result.status);
  const detail =
    parseHttpErrorMessage(result.bodyText) ?? `HTTP ${result.status}`;

  if (
    failureClass === FAILURE_CLASSES.VALIDATION &&
    /not enough stock/i.test(detail)
  ) {
    failureClass = FAILURE_CLASSES.STOCK_CONFLICT;
  }

  if (shouldRetryFailureClass(failureClass)) {
    return {
      outcome: "retry",
      failureClass,
      message: detail,
      uncertain: failureClass === FAILURE_CLASSES.TIMEOUT,
    };
  }

  return {
    outcome: "terminal",
    failureClass,
    message: detail,
  };
}

export const defaultClassifyHandlerError = (_error: unknown): FailureClass => {
  return FAILURE_CLASSES.UNKNOWN;
};
