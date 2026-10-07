import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  deleteExpense,
  getExpenseDetail,
  updateExpense,
} from "@/modules/erp/services/erp-expenses.service";
import { getJournalLinesForSource } from "@/modules/erp/services/erp-journal.service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const view = new URL(request.url).searchParams.get("view");

  try {
    if (view === "journals") {
      const lines = await getJournalLinesForSource("expense", id);
      return NextResponse.json({ lines });
    }
    const expense = await getExpenseDetail(id);
    return NextResponse.json(expense);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load expense";
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
    await updateExpense(id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update expense";
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
    await deleteExpense(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to delete expense";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
