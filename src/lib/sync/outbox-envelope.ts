import { z } from "zod";

import { OutboxValidationError } from "@/lib/sync/outbox-errors";
import type { OutboxEnqueueInput } from "@/lib/sync/outbox-types";

const enqueueSchema = z.object({
  operationId: z.string().uuid().optional(),
  operationType: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  payload: z.unknown(),
  userId: z.string().min(1),
  storeId: z.string().min(1),
  terminalId: z.string().min(1),
  resourceScope: z.string().min(1).optional(),
  dependsOn: z.array(z.string().uuid()).optional(),
});

export function parseEnqueueInput(raw: OutboxEnqueueInput): OutboxEnqueueInput {
  const parsed = enqueueSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join("; ");
    throw new OutboxValidationError(message || "Invalid outbox enqueue envelope");
  }

  return {
    ...parsed.data,
    dependsOn: parsed.data.dependsOn ?? [],
  };
}

export function createOperationId(): string {
  if (typeof crypto === "undefined" || !crypto.randomUUID) {
    throw new OutboxValidationError("crypto.randomUUID is not available");
  }
  return crypto.randomUUID();
}
