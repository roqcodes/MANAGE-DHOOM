import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getSupplierPaymentDetail } from "@/modules/erp/services/erp-supplier-payments.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const data = await getSupplierPaymentDetail(id);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[GET /api/admin/erp/supplier-payments/[id]]", error);
    return NextResponse.json({ error: "Failed to get supplier payment" }, { status: 500 });
  }
}
