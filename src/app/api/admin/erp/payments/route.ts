import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  buildFifoAllocationsForAmount,
  listErpPayments,
  listExpenseAccounts,
  listPaidThroughAccounts,
  listPaymentAccountOptions,
  listReceivableInvoicesForCustomer,
  peekPaymentDocumentNumber,
  recordCustomerPayment,
} from "@/modules/erp/services/erp-payments.service";
import {
  getCustomerSettlementPreview,
  recordAccountSettlement,
} from "@/modules/erp/services/erp-settlement.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view");

  if (view === "account-options") {
    try {
      const storeId = searchParams.get("storeId") ?? undefined;
      const options = await listPaymentAccountOptions(storeId);
      return NextResponse.json(options);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load accounts";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

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

  if (view === "settlement-discount-accounts") {
    try {
      const storeId = searchParams.get("storeId") ?? undefined;
      // Customer settlement discount clears AR for less cash — debit expense (e.g. sales discount).
      const accounts = await listExpenseAccounts(storeId);
      return NextResponse.json({ data: accounts });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to load discount accounts";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (view === "settlement-preview") {
    try {
      const userId = searchParams.get("userId");
      if (!userId) {
        return NextResponse.json({ error: "userId required" }, { status: 400 });
      }
      const preview = await getCustomerSettlementPreview(
        userId,
        searchParams.get("storeId") ?? undefined,
      );
      return NextResponse.json({ data: preview });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load settlement preview";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  if (view === "receivable-invoices") {
    try {
      const userId = searchParams.get("userId");
      if (!userId) {
        return NextResponse.json({ error: "userId required" }, { status: 400 });
      }
      const invoices = await listReceivableInvoicesForCustomer(
        userId,
        searchParams.get("storeId") ?? undefined,
      );
      return NextResponse.json({ data: invoices });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load invoices";
      return NextResponse.json({ error: msg }, { status: 400 });
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

  if (view === "fifo") {
    try {
      const storeId = searchParams.get("storeId");
      const amount = parseFloat(searchParams.get("amount") ?? "0");
      const exclude = searchParams.get("exclude")?.split(",").filter(Boolean) ?? [];
      if (!storeId) {
        return NextResponse.json({ error: "Store is required" }, { status: 400 });
      }
      const userId = searchParams.get("userId");
      if (!userId) {
        return NextResponse.json({ error: "userId required" }, { status: 400 });
      }
      const allocations = await buildFifoAllocationsForAmount(
        storeId,
        amount,
        exclude,
        userId,
      );
      return NextResponse.json({ allocations });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to build FIFO allocations";
      return NextResponse.json({ error: msg }, { status: 400 });
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
    if (body.accountSettlement === true) {
      const id = await recordAccountSettlement({
        side: "customer",
        partyId: body.userId,
        storeId: body.storeId,
        paymentDate: body.paymentDate,
        paymentMode: body.paymentMode,
        accountId: body.accountId,
        settlementDiscount: body.settlementDiscount,
        settlementDiscountAccountId: body.settlementDiscountAccountId,
        reference: body.reference,
        notes: body.notes,
      });
      return NextResponse.json({ id }, { status: 201 });
    }
    const id = await recordCustomerPayment(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to record payment";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
