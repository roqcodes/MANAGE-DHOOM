import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  buildFifoAllocationsForBills,
  listBulkPaymentBatches,
  listPaidThroughAccounts,
  listPayableBillsForVendor,
  listSupplierExpenseAccounts,
  listSupplierPayments,
  recordBulkSupplierPaymentBatch,
  recordSupplierPayment,
} from "@/modules/erp/services/erp-supplier-payments.service";

function parseListOptions(url: string) {
  const sp = new URL(url).searchParams;
  return {
    page: Math.max(0, parseInt(sp.get("page") ?? "0", 10)),
    limit: Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "20", 10))),
    storeId: sp.get("storeId") ?? undefined,
    paymentMode: sp.get("paymentMode") ?? undefined,
    dateFrom: sp.get("dateFrom") ?? undefined,
    dateTo: sp.get("dateTo") ?? undefined,
    search: sp.get("search") ?? undefined,
    period: sp.get("period") ?? undefined,
  };
}

function applyPeriod(
  options: ReturnType<typeof parseListOptions>,
): { dateFrom?: string; dateTo?: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (options.period === "today") {
    return { dateFrom: iso(today), dateTo: iso(today) };
  }
  if (options.period === "this_month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { dateFrom: iso(start), dateTo: iso(today) };
  }
  return { dateFrom: options.dateFrom, dateTo: options.dateTo };
}

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const view = url.searchParams.get("view");

  try {
    if (view === "accounts") {
      const accounts = await listPaidThroughAccounts(
        url.searchParams.get("storeId") ?? undefined,
      );
      return NextResponse.json({ data: accounts });
    }

    if (view === "payable-bills") {
      const vendorId = url.searchParams.get("vendorId");
      if (!vendorId) {
        return NextResponse.json({ error: "vendorId required" }, { status: 400 });
      }
      const bills = await listPayableBillsForVendor(
        vendorId,
        url.searchParams.get("storeId") ?? undefined,
      );
      return NextResponse.json({ data: bills });
    }

    if (view === "expense-accounts") {
      const accounts = await listSupplierExpenseAccounts(
        url.searchParams.get("storeId") ?? undefined,
      );
      return NextResponse.json({ data: accounts });
    }

    if (view === "fifo") {
      const storeId = url.searchParams.get("storeId");
      const amount = parseFloat(url.searchParams.get("amount") ?? "0");
      const exclude = url.searchParams.get("exclude")?.split(",").filter(Boolean) ?? [];
      if (!storeId) {
        return NextResponse.json({ error: "storeId required" }, { status: 400 });
      }
      const allocations = await buildFifoAllocationsForBills(storeId, amount, exclude);
      return NextResponse.json({ allocations });
    }

    if (view === "bulk") {
      const opts = parseListOptions(request.url);
      const period = applyPeriod(opts);
      const result = await listBulkPaymentBatches({
        page: opts.page,
        limit: opts.limit,
        storeId: opts.storeId,
        dateFrom: period.dateFrom,
        dateTo: period.dateTo,
        search: opts.search,
      });
      return NextResponse.json(result);
    }

    const opts = parseListOptions(request.url);
    const period = applyPeriod(opts);
    const isBulkParam = url.searchParams.get("isBulk");
    const isBulk =
      isBulkParam === "true" ? true : isBulkParam === "false" ? false : false;

    const result = await listSupplierPayments({
      page: opts.page,
      limit: opts.limit,
      isBulk,
      storeId: opts.storeId,
      paymentMode: opts.paymentMode,
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      search: opts.search,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/admin/erp/supplier-payments]", error);
    return NextResponse.json({ error: "Failed to list supplier payments" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    if (body.bulk === true) {
      const batchId = await recordBulkSupplierPaymentBatch({
        storeId: body.storeId,
        paymentDate: body.paymentDate,
        paymentMode: body.paymentMode,
        accountId: body.accountId,
        bankCharges: body.bankCharges,
        bankChargesAccountId: body.bankChargesAccountId,
        notes: body.notes,
        billLines: body.billLines ?? [],
      });
      return NextResponse.json({ batchId }, { status: 201 });
    }
    const id = await recordSupplierPayment(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to record supplier payment";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
