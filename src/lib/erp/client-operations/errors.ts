export class ErpClientOperationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ErpClientOperationError";
    this.code = code;
  }
}

export class ErpClientOperationConflictError extends ErpClientOperationError {
  readonly httpStatus = 409;

  constructor(code: string, message: string) {
    super(code, message);
    this.name = "ErpClientOperationConflictError";
  }
}

export function mapRpcErrorToClientOperationError(
  error: { message?: string; code?: string; details?: string } | null,
): ErpClientOperationError {
  const message = error?.message ?? "ERP client operation failed";
  const code = extractErpClientCode(message);

  if (
    code === "ERP_CLIENT_PAYLOAD_HASH_CONFLICT" ||
    code === "ERP_CLIENT_OPERATION_TYPE_CONFLICT"
  ) {
    return new ErpClientOperationConflictError(code, message);
  }

  if (code === "ERP_CLIENT_USER_MISMATCH" || code === "ERP_CLIENT_STORE_MISMATCH") {
    return new ErpClientOperationError(code, message);
  }

  if (code === "ERP_CLIENT_UNAUTHORIZED") {
    return new ErpClientOperationError(code, message);
  }

  if (code === "ERP_CLIENT_PAYLOAD_HASH_MISMATCH") {
    return new ErpClientOperationError(code, message);
  }

  return new ErpClientOperationError(code ?? "ERP_CLIENT_UNKNOWN", message);
}

function extractErpClientCode(message: string): string | null {
  const match = message.match(
    /ERP_CLIENT_[A-Z0-9_]+/,
  );
  return match?.[0] ?? null;
}
