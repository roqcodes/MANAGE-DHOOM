import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  createAccountType,
  listAccountTypes,
} from "@/modules/erp/services/erp-accounts.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const search = new URL(request.url).searchParams.get("search") ?? undefined;

  try {
    const data = await listAccountTypes(search);
    return NextResponse.json({ data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to list account types";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const id = await createAccountType({
      accountCategory: body.accountCategory,
      name: body.name,
      description: body.description,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create account type";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
