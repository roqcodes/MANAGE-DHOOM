import "server-only";

import { z } from "zod";

import { invokeRpc } from "@/lib/integrations/supabase/rpc";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { normalizeOutboxPayload } from "@/lib/sync/payload-canonicalize";
import {
  ErpClientOperationConflictError,
  ErpClientOperationError,
  mapRpcErrorToClientOperationError,
} from "@/lib/erp/client-operations/errors";

const executeInputSchema = z.object({
  operationId: z.string().uuid(),
  operationType: z.string().min(1),
  payload: z.unknown(),
  storeId: z.string().uuid(),
  terminalId: z.string().min(1).optional().nullable(),
  payloadHash: z.string().length(64).optional(),
});

export type ExecuteIdempotentOperationInput = z.infer<typeof executeInputSchema>;

export type ExecuteIdempotentOperationResult<T = unknown> = {
  result: T;
  idempotentReplay: boolean;
  payloadHash: string;
};

async function resolvePostgresPayloadHash(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  payload: unknown,
): Promise<string> {
  const { data, error } = await invokeRpc(supabase, "erp_payload_hash", {
    p_payload: payload as Record<string, unknown>,
  });
  if (error || typeof data !== "string" || data.length !== 64) {
    throw new ErpClientOperationError(
      "ERP_CLIENT_HASH_FAILED",
      error?.message ?? "Failed to compute ERP payload hash",
    );
  }
  return data;
}

/**
 * Server authority for durable client retries. Business logic runs inside the
 * `run_erp_client_idempotent_operation` Postgres transaction (Phase 4: test.certify only).
 */
export async function executeIdempotentOperation<T = unknown>(
  input: ExecuteIdempotentOperationInput,
): Promise<ExecuteIdempotentOperationResult<T>> {
  const parsed = executeInputSchema.parse(input);
  const canonicalPayload = normalizeOutboxPayload(parsed.payload);

  const supabase = await createSupabaseServerClient();
  const payloadHash = await resolvePostgresPayloadHash(supabase, canonicalPayload);
  const { data, error } = await invokeRpc(
    supabase,
    "run_erp_client_idempotent_operation",
    {
      p_operation_id: parsed.operationId,
      p_operation_type: parsed.operationType,
      p_payload_hash: payloadHash,
      p_payload: canonicalPayload as Record<string, unknown>,
      p_store_id: parsed.storeId,
      p_terminal_id: parsed.terminalId ?? null,
    },
  );

  if (error) {
    const mapped = mapRpcErrorToClientOperationError(error);
    throw mapped;
  }

  if (!data || typeof data !== "object") {
    throw new ErpClientOperationError(
      "ERP_CLIENT_INVALID_RESPONSE",
      "Idempotent operation returned empty response",
    );
  }

  const envelope = data as {
    idempotentReplay?: boolean;
    result?: T;
  };

  return {
    result: envelope.result as T,
    idempotentReplay: Boolean(envelope.idempotentReplay),
    payloadHash,
  };
}

export function idempotentOperationErrorResponse(error: unknown) {
  if (error instanceof ErpClientOperationConflictError) {
    return {
      status: error.httpStatus,
      body: { error: error.message, code: error.code },
    };
  }
  if (error instanceof ErpClientOperationError) {
    const status =
      error.code === "ERP_CLIENT_UNAUTHORIZED"
        ? 401
        : error.code === "ERP_CLIENT_USER_MISMATCH" ||
            error.code === "ERP_CLIENT_STORE_MISMATCH"
          ? 403
          : 400;
    return { status, body: { error: error.message, code: error.code } };
  }
  if (error instanceof z.ZodError) {
    return { status: 400, body: { error: "Invalid request", code: "VALIDATION" } };
  }
  return { status: 500, body: { error: "Internal server error" } };
}
