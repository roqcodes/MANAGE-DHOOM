import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { deleteCustomerIfUnused } from "@/modules/customers/services/customer-erp.service";
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    await deleteCustomerIfUnused(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete customer";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
