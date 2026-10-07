import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { convertOrderToInvoice } from "@/modules/erp/services/convert-order-to-invoice.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const invoiceId = await convertOrderToInvoice(id);
    return NextResponse.json({ invoiceId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Conversion failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
