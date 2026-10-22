import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  getCustomerErpBundle,
  getCustomerProfile,
  updateCustomerProfile,
} from "@/modules/customers/services/customer-erp.service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const view = new URL(request.url).searchParams.get("view");
  try {
    if (view === "profile") {
      const profile = await getCustomerProfile(id);
      return NextResponse.json({ profile });
    }
    const bundle = await getCustomerErpBundle(id);
    return NextResponse.json(bundle);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load ERP data";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const body = await request.json();
    await updateCustomerProfile(id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update profile";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
