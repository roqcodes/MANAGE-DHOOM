import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  buildFifoAllocationsForAmount,
  listBulkCustomerPaymentBatches,
  listPaidThroughAccounts,
  listExpenseAccounts,
  recordBulkCustomerPaymentBatch,
} from "@/modules/erp/services/erp-payments.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view");

  if (view === "accounts") {
    try {
      const storeId = searchParams.get("storeId") ?? undefined;
      const accounts = await listPaidThroughAccounts(storeId);
      return NextResponse.json({ data: accounts });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load accounts";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (view === "expense-accounts") {
    try {
      const storeId = searchParams.get("storeId") ?? undefined;
      const accounts = await listExpenseAccounts(storeId);
      return NextResponse.json({ data: accounts });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load expense accounts";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (view === "fifo") {
    try {
      const storeId = searchParams.get("storeId");
      const amount = parseFloat(searchParams.get("amount") ?? "0");
      const exclude = searchParams.get("exclude")?.split(",").filter(Boolean) ?? [];
      if (!storeId) {
        return NextResponse.json({ error: "Store is required" }, { status: 400 });
      }
      const allocations = await buildFifoAllocationsForAmount(storeId, amount, exclude);
      return NextResponse.json({ allocations });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to build FIFO allocations";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const storeId = searchParams.get("storeId") ?? undefined;
  const period = searchParams.get("period") ?? undefined;
  const search = searchParams.get("search") ?? undefined;

  try {
    const result = await listBulkCustomerPaymentBatches({
      page,
      storeId,
      period,
      search,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/admin/erp/customer-bulk-payments]", error);
    const msg = error instanceof Error ? error.message : "Failed to list bulk payments";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const batchId = await recordBulkCustomerPaymentBatch(body);
    return NextResponse.json({ batchId }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to save bulk payment";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
