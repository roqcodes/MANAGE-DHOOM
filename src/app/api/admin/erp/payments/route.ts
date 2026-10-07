import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  listErpPayments,
  listExpenseAccounts,
  listPaidThroughAccounts,
  peekPaymentDocumentNumber,
  recordCustomerPayment,
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

  if (view === "preview") {
    try {
      const isBulk = searchParams.get("isBulk") === "1";
      const paymentNumber = await peekPaymentDocumentNumber(isBulk);
      return NextResponse.json({ paymentNumber });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to preview payment number";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const storeId = searchParams.get("storeId") ?? undefined;
  const dateFrom = searchParams.get("dateFrom") ?? undefined;
  const dateTo = searchParams.get("dateTo") ?? undefined;
  const search = searchParams.get("search") ?? undefined;

  try {
    const result = await listErpPayments({
      page,
      storeId,
      dateFrom,
      dateTo,
      search,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/admin/erp/payments]", error);
    return NextResponse.json({ error: "Failed to list payments" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const id = await recordCustomerPayment(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to record payment";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
