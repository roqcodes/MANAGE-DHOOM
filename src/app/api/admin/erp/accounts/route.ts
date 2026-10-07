import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  createAccount,
  createAccountType,
  deleteAccount,
  listAccountTypes,
  listAccounts,
} from "@/modules/erp/services/erp-accounts.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const view = url.searchParams.get("view");
  try {
    if (view === "types") {
      const search = url.searchParams.get("search") ?? undefined;
      const types = await listAccountTypes(search);
      return NextResponse.json({ data: types });
    }
    const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10));
    const search = url.searchParams.get("search") ?? undefined;
    const includeBalance = url.searchParams.get("includeBalance") === "1";
    const storeId = url.searchParams.get("storeId") ?? undefined;
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam
      ? Math.min(500, Math.max(1, parseInt(limitParam, 10)))
      : undefined;
    const result = await listAccounts({ page, search, includeBalance, storeId, limit });
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to list accounts";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    if (body.accountCategory) {
      const id = await createAccountType({
        accountCategory: body.accountCategory,
        name: body.name,
        description: body.description,
      });
      return NextResponse.json({ id }, { status: 201 });
    }
    const id = await createAccount(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create account";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
