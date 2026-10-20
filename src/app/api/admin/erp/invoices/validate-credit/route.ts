import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { assertInvoiceCreditHeadroom } from "@/modules/credit/services/credit-limits.service";

const bodySchema = z.object({
  userId: z.string().uuid(),
  total: z.number().finite().min(0),
  invoiceId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const body = bodySchema.parse(await request.json());
    await assertInvoiceCreditHeadroom(body.userId, body.total, body.invoiceId ?? null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Credit limit check failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
