import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getInvoiceCreditHeadroom } from "@/modules/credit/services/credit-limits.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const invoiceId = url.searchParams.get("invoiceId");

  try {
    const headroom = await getInvoiceCreditHeadroom(userId, invoiceId ?? null);
    return NextResponse.json({ headroom });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load credit";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
