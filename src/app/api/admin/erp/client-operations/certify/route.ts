import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";
import {
  executeIdempotentOperation,
  idempotentOperationErrorResponse,
} from "@/lib/erp/client-operations/execute-idempotent-operation";

const certifyBodySchema = z.object({
  operationId: z.string().uuid(),
  operationType: z.literal(ERP_CLIENT_OPERATION_TYPES.testCertify),
  payload: z.record(z.string(), z.unknown()),
  payloadHash: z.string().length(64).optional(),
  storeId: z.string().uuid(),
  terminalId: z.string().min(1).optional(),
});

/**
 * POST /api/admin/erp/client-operations/certify
 * Certification-only endpoint (test.certify). Not an ERP business mutation.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) {
    return auth.response;
  }

  let body: z.infer<typeof certifyBodySchema>;
  try {
    body = certifyBodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const outcome = await executeIdempotentOperation({
      operationId: body.operationId,
      operationType: body.operationType,
      payload: body.payload,
      payloadHash: body.payloadHash,
      storeId: body.storeId,
      terminalId: body.terminalId ?? "certify-terminal",
    });

    return NextResponse.json({
      idempotentReplay: outcome.idempotentReplay,
      payloadHash: outcome.payloadHash,
      result: outcome.result,
    });
  } catch (error) {
    const mapped = idempotentOperationErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
