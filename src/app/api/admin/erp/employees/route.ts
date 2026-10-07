import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  createEmployee,
  listEmployeeOptions,
  listEmployees,
} from "@/modules/erp/services/erp-employees.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view");

  if (view === "options") {
    try {
      const storeId = searchParams.get("storeId") ?? undefined;
      const data = await listEmployeeOptions(storeId);
      return NextResponse.json({ data });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load employees";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const storeId = searchParams.get("storeId") ?? undefined;
  const search = searchParams.get("search") ?? undefined;
  const activeOnly = searchParams.get("activeOnly") === "1";

  try {
    const result = await listEmployees({ page, storeId, search, activeOnly });
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to list employees";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const id = await createEmployee(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create employee";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
