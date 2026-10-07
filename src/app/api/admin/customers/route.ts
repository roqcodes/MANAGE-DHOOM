import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getAllCustomers, searchCustomers } from "@/modules/customers/services/customers.service";
import { createCustomer } from "@/modules/customers/services/customer-erp.service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");
    if (view === "search") {
      const auth = await requireAdminApiProfile();
      if (!auth.ok) return auth.response;

      const q = searchParams.get("q") ?? "";
      const data = await searchCustomers(q);
      return NextResponse.json({ data });
    }

    const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

    const result = await getAllCustomers(page);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/admin/customers]", error);
    return NextResponse.json(
      { error: "Failed to fetch customers" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const id = await createCustomer(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create customer";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
