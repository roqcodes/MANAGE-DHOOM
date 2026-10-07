import { OUTBOX_OPERATION_STATES, type OutboxOperationState } from "@/lib/sync/outbox-types";
import { FAILURE_CLASSES, type FailureClass } from "@/lib/sync/sync-types";

export function stateForFailureClass(failureClass: FailureClass): OutboxOperationState {
  switch (failureClass) {
    case FAILURE_CLASSES.AUTHENTICATION:
    case FAILURE_CLASSES.USER_MISMATCH:
      return OUTBOX_OPERATION_STATES.PAUSED_AUTH;
    case FAILURE_CLASSES.AUTHORIZATION:
      return OUTBOX_OPERATION_STATES.BLOCKED_AUTHORIZATION;
    case FAILURE_CLASSES.STOCK_CONFLICT:
      return OUTBOX_OPERATION_STATES.STOCK_CONFLICT;
    case FAILURE_CLASSES.VALIDATION:
    case FAILURE_CLASSES.CONFLICT:
    case FAILURE_CLASSES.MISSING_HANDLER:
    case FAILURE_CLASSES.DEPENDENCY_BLOCKED:
      return OUTBOX_OPERATION_STATES.NEEDS_ATTENTION;
    case FAILURE_CLASSES.NETWORK:
    case FAILURE_CLASSES.TIMEOUT:
    case FAILURE_CLASSES.SERVER:
    case FAILURE_CLASSES.UNKNOWN:
    default:
      return OUTBOX_OPERATION_STATES.RETRY_WAIT;
  }
}

export function classifyHttpStatus(status: number): FailureClass {
  if (status === 401) {
    return FAILURE_CLASSES.AUTHENTICATION;
  }
  if (status === 403) {
    return FAILURE_CLASSES.AUTHORIZATION;
  }
  if (status === 408 || status === 504) {
    return FAILURE_CLASSES.TIMEOUT;
  }
  if (status === 409) {
    return FAILURE_CLASSES.CONFLICT;
  }
  if (status === 422 || status === 400) {
    return FAILURE_CLASSES.VALIDATION;
  }
  if (status >= 500) {
    return FAILURE_CLASSES.SERVER;
  }
  if (status >= 400) {
    return FAILURE_CLASSES.VALIDATION;
  }
  return FAILURE_CLASSES.UNKNOWN;
}

export function shouldRetryFailureClass(failureClass: FailureClass): boolean {
  return (
    failureClass === FAILURE_CLASSES.NETWORK ||
    failureClass === FAILURE_CLASSES.TIMEOUT ||
    failureClass === FAILURE_CLASSES.SERVER ||
    failureClass === FAILURE_CLASSES.UNKNOWN
  );
}

export function isUncertainFailureClass(failureClass: FailureClass): boolean {
  return failureClass === FAILURE_CLASSES.TIMEOUT;
}
