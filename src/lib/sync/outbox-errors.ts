export class OutboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboxError";
  }
}

export class OutboxValidationError extends OutboxError {
  constructor(message: string) {
    super(message);
    this.name = "OutboxValidationError";
  }
}

export class OutboxEnqueueError extends OutboxError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "OutboxEnqueueError";
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

export class OutboxMigrationError extends OutboxError {
  constructor(message: string) {
    super(message);
    this.name = "OutboxMigrationError";
  }
}

export class OutboxNotFoundError extends OutboxError {
  constructor(operationId: string) {
    super(`Outbox operation not found: ${operationId}`);
    this.name = "OutboxNotFoundError";
  }
}
