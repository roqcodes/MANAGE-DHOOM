import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  createExpense,
  listExpenseAccounts,
  listExpensePaidThroughAccounts,
  listExpenses,
} from "@/modules/erp/services/erp-expenses.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view");

  if (view === "accounts") {
    try {
      const storeId = searchParams.get("storeId") ?? undefined;
      const accounts = await listExpenseAccounts(storeId);
      return NextResponse.json({ data: accounts });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load expense accounts";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (view === "paid-through") {
    try {
      const storeId = searchParams.get("storeId") ?? undefined;
      const accounts = await listExpensePaidThroughAccounts(storeId);
      return NextResponse.json({ data: accounts });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load accounts";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const storeId = searchParams.get("storeId") ?? undefined;
  const period = searchParams.get("period") ?? undefined;
  const accountId = searchParams.get("accountId") ?? undefined;
  const search = searchParams.get("search") ?? undefined;

  try {
    const result = await listExpenses({ page, storeId, period, accountId, search });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/admin/erp/expenses]", error);
    const msg = error instanceof Error ? error.message : "Failed to list expenses";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const id = await createExpense(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create expense";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
