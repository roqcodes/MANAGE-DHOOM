import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getCustomerDetails } from "@/modules/customers/services/customers.service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const txPage = Math.max(0, parseInt(searchParams.get("txPage") ?? "0", 10));

  try {
    const details = await getCustomerDetails(id, txPage);
    return NextResponse.json(details);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load customer details";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
