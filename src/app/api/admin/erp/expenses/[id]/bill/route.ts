import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { billExpenseToCustomer } from "@/modules/erp/services/erp-conversions.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const invoiceId = await billExpenseToCustomer(id);
    return NextResponse.json({ invoiceId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Billing failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
