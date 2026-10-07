import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  createVatPayment,
  listVatPaidThroughAccounts,
  listVatPayments,
} from "@/modules/erp/services/erp-vat.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const view = url.searchParams.get("view");

  if (view === "accounts") {
    try {
      const storeId = url.searchParams.get("storeId") ?? undefined;
      const accounts = await listVatPaidThroughAccounts(storeId);
      return NextResponse.json({ data: accounts });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load accounts";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10));
  const storeId = url.searchParams.get("storeId") ?? undefined;
  const search = url.searchParams.get("search") ?? undefined;

  try {
    const result = await listVatPayments({ page, storeId, search });
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to list VAT payments";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const id = await createVatPayment(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create VAT payment";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
