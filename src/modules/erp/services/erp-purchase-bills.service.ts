import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  ErpPurchaseBillListRow,
  ErpLandedCostLineInput,
  ErpPurchaseLineInput,
} from "@/common/erp/purchasing-types";
import { derivePurchaseBillDisplayStatus, roundMoney } from "@/common/erp/purchasing-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { requireErpStoreId, resolveErpStoreId } from "@/modules/erp/services/store-context.service";
import type { Json } from "@/lib/integrations/supabase/types";

function linesToJson(lines: ErpPurchaseLineInput[]): Json {
  return lines.map((l) => ({
    product_id: l.productId ?? null,
    variant_id: null,
    product_name: l.productName,
    barcode: l.barcode ?? "",
    expiry_date: l.expiryDate ?? "",
    quantity: l.quantity,
    purchase_price: l.purchasePrice,
    tax_rate_percent: l.taxRatePercent,
    unit_id: l.unitId ?? "",
  })) as Json;
}

function landedCostsToJson(costs: ErpLandedCostLineInput[]): Json {
  return costs.map((c) => ({
    landed_cost_item_id: c.landedCostItemId ?? "",
    name: c.name,
    quantity: c.quantity,
    rate: c.rate,
    tax_rate_percent: c.taxRatePercent,
  })) as Json;
}

export async function listPurchaseBills(options: {
  page?: number;
  limit?: number;
  status?: string;
  storeId?: string;
  vendorId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  openOnly?: boolean;
} = {}): Promise<{
  data: ErpPurchaseBillListRow[];
  total: number;
}> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const page = options.page ?? 0;
  const limit = options.limit ?? 20;
  const from = page * limit;
  const activeStoreId = await resolveErpStoreId(options.storeId);

  let query = supabase
    .from("erp_purchase_bills")
    .select(
      "id, purchase_bill_number, vendor_bill_number, vendor_id, store_id, po_id, status, total_amount, amount_paid, credits_applied, balance_due, purchase_date, due_date, vendors(name), stores(name), purchase_orders(po_number)",
      { count: "exact" },
    )
    .order("purchase_date", { ascending: false })
    .range(from, from + limit - 1);

  if (options.openOnly) {
    query = query.gt("balance_due", 0).in("status", ["finalized", "partial"]);
  } else if (options.status && options.status !== "all") {
    if (options.status === "overdue") {
      query = query.gt("balance_due", 0).lt("due_date", new Date().toISOString().slice(0, 10));
    } else {
      query = query.eq("status", options.status);
    }
  }
  if (activeStoreId) query = query.eq("store_id", activeStoreId);
  if (options.vendorId) query = query.eq("vendor_id", options.vendorId);
  if (options.dateFrom) query = query.gte("purchase_date", options.dateFrom);
  if (options.dateTo) query = query.lte("purchase_date", options.dateTo);
  if (options.search?.trim()) {
    const s = options.search.trim();
    const { data: vendorMatches } = await supabase
      .from("vendors")
      .select("id")
      .eq("is_active", true)
      .or(
        `name.ilike.%${s}%,contact.ilike.%${s}%,email.ilike.%${s}%,trn.ilike.%${s}%,phone.ilike.%${s}%`,
      )
      .limit(50);

    const filters = [
      `purchase_bill_number.ilike.%${s}%`,
      `vendor_bill_number.ilike.%${s}%`,
      `batch_reference.ilike.%${s}%`,
    ];
    const vendorIds = (vendorMatches ?? []).map((row) => row.id);
    if (vendorIds.length > 0) {
      filters.push(`vendor_id.in.(${vendorIds.join(",")})`);
    }
    query = query.or(filters.join(","));
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    data: (data ?? []).map((row) => {
      const vendor = row.vendors as { name: string | null } | null;
      const store = row.stores as { name: string } | null;
      const po = row.purchase_orders as { po_number: string | null } | null;
      const balanceDue = Number(row.balance_due ?? 0);
      const status = row.status;
      return {
        id: row.id,
        purchase_bill_number: row.purchase_bill_number,
        vendor_bill_number: row.vendor_bill_number,
        vendor_id: row.vendor_id,
        store_id: row.store_id,
        po_id: row.po_id,
        status,
        total_amount: Number(row.total_amount ?? 0),
        amount_paid: Number(row.amount_paid ?? 0),
        credits_applied: Number(row.credits_applied ?? 0),
        balance_due: balanceDue,
        purchase_date: row.purchase_date,
        due_date: row.due_date,
        vendor_name: vendor?.name ?? null,
        store_name: store?.name ?? null,
        po_number: po?.po_number ?? null,
        display_status: derivePurchaseBillDisplayStatus(status, balanceDue, row.due_date),
      };
    }),
    total: count ?? 0,
  };
}

export async function createPurchaseBill(input: {
  vendorId: string;
  storeId?: string;
  purchaseDate: string;
  dueDate?: string | null;
  lines: ErpPurchaseLineInput[];
  landedCosts?: ErpLandedCostLineInput[];
  discount?: number;
  poId?: string | null;
  vendorBillNumber?: string | null;
  grnReference?: string | null;
  batchReference?: string | null;
  reference?: string | null;
  notes?: string | null;
  expectedDeliveryDate?: string | null;
  finalize?: boolean;
  /** Standalone bills: Zoho-style mark as received (stock on bill finalize). */
  physicalReceiptOnBill?: boolean;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);

  const finalize = input.finalize ?? false;

  const { data, error } = await supabase.rpc("create_erp_purchase_bill", {
    p_vendor_id: input.vendorId,
    p_store_id: storeId,
    p_purchase_date: input.purchaseDate,
    p_due_date: input.dueDate ?? undefined,
    p_lines: linesToJson(input.lines),
    p_landed_costs: landedCostsToJson(input.landedCosts ?? []),
    p_discount: input.discount ?? 0,
    p_po_id: input.poId ?? undefined,
    p_vendor_bill_number: input.vendorBillNumber ?? undefined,
    p_grn_reference: input.grnReference ?? undefined,
    p_batch_reference: input.batchReference ?? undefined,
    p_reference: input.reference ?? undefined,
    p_notes: input.notes ?? undefined,
    p_expected_delivery_date: input.expectedDeliveryDate ?? undefined,
    p_finalize: false,
    p_physical_receipt_on_bill: input.physicalReceiptOnBill ?? true,
  });

  if (error) throw new Error(error.message);

  const billId = data as string;

  if (finalize) {
    const { error: finalizeError } = await supabase.rpc("finalize_erp_purchase_bill", {
      p_bill_id: billId,
    });
    if (finalizeError) throw new Error(finalizeError.message);
  }

  await logAuditEvent({
    action: finalize ? "finalize_purchase_bill" : "create_purchase_bill",
    entityType: "purchase_bill",
    entityId: billId,
    description: finalize ? "Purchase bill created and finalized" : "Purchase bill created",
    storeId,
  });

  return billId;
}

export async function cancelPurchaseBill(billId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc(
    "cancel_erp_purchase_bill" as "finalize_erp_purchase_bill",
    { p_bill_id: billId } as { p_bill_id: string },
  );
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "cancel_purchase_bill",
    entityType: "purchase_bill",
    entityId: billId,
    description: "Purchase bill cancelled",
  });
}

export async function finalizePurchaseBill(billId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("finalize_erp_purchase_bill", {
    p_bill_id: billId,
  });
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "finalize_purchase_bill",
    entityType: "purchase_bill",
    entityId: billId,
    description: "Purchase bill finalized",
  });
}

export async function getPurchaseBillDetail(billId: string) {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("erp_purchase_bills")
    .select(
      "*, vendors(name, phone, address, trn), stores(name), purchase_orders(po_number), erp_purchase_bill_lines(*), erp_purchase_bill_landed_costs(*), erp_supplier_payment_allocations(*, erp_supplier_payments(payment_number, payment_date, total_amount))",
    )
    .eq("id", billId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

function calcBillTotals(
  lines: ErpPurchaseLineInput[],
  landedCosts: ErpLandedCostLineInput[],
  discount: number,
) {
  let subtotal = 0;
  let tax = 0;
  let landedTotal = 0;

  for (const line of lines) {
    const taxable = roundMoney(line.quantity * line.purchasePrice);
    const lineTax = roundMoney(taxable * (line.taxRatePercent / 100));
    subtotal += taxable;
    tax += lineTax;
  }

  for (const lc of landedCosts) {
    const taxable = roundMoney(lc.quantity * lc.rate);
    const lineTax = roundMoney(taxable * (lc.taxRatePercent / 100));
    landedTotal += roundMoney(taxable + lineTax);
  }

  const total = roundMoney(Math.max(0, subtotal + tax - discount) + landedTotal);
  return {
    subtotal: roundMoney(subtotal),
    tax: roundMoney(tax),
    landedTotal: roundMoney(landedTotal),
    total,
  };
}

export async function updateDraftPurchaseBill(
  billId: string,
  input: {
    vendorId: string;
    storeId: string;
    purchaseDate: string;
    dueDate?: string | null;
    lines: ErpPurchaseLineInput[];
    landedCosts?: ErpLandedCostLineInput[];
    discount?: number;
    poId?: string | null;
    vendorBillNumber?: string | null;
    expectedDeliveryDate?: string | null;
    grnReference?: string | null;
    batchReference?: string | null;
    reference?: string | null;
    notes?: string | null;
    physicalReceiptOnBill?: boolean;
  },
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: bill, error: fetchError } = await supabase
    .from("erp_purchase_bills")
    .select("status, accounting_posted, inventory_committed, legacy_stock_via_bill")
    .eq("id", billId)
    .single();

  if (fetchError) throw new Error(fetchError.message);
  if (bill.status !== "draft" || bill.accounting_posted || bill.legacy_stock_via_bill) {
    throw new Error("Only draft purchase bills can be edited");
  }
  if (!input.lines.length) throw new Error("At least one line item is required");

  const landedCosts = input.landedCosts ?? [];
  const discount = input.discount ?? 0;
  const totals = calcBillTotals(input.lines, landedCosts, discount);

  const { error: updateError } = await supabase
    .from("erp_purchase_bills")
    .update({
      vendor_id: input.vendorId,
      store_id: input.storeId,
      purchase_date: input.purchaseDate,
      due_date: input.dueDate ?? null,
      expected_delivery_date: input.expectedDeliveryDate ?? null,
      po_id: input.poId ?? null,
      vendor_bill_number: input.vendorBillNumber ?? null,
      grn_reference: input.grnReference ?? null,
      batch_reference: input.batchReference ?? null,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      discount,
      subtotal: totals.subtotal,
      tax_amount: totals.tax,
      landed_cost_total: totals.landedTotal,
      total_amount: totals.total,
      balance_due: 0,
      physical_receipt_on_bill:
        input.poId != null ? false : (input.physicalReceiptOnBill ?? true),
      updated_at: new Date().toISOString(),
    })
    .eq("id", billId)
    .eq("status", "draft");

  if (updateError) throw new Error(updateError.message);

  await supabase.from("erp_purchase_bill_lines").delete().eq("purchase_bill_id", billId);
  await supabase.from("erp_purchase_bill_landed_costs").delete().eq("purchase_bill_id", billId);

  const lineRows = input.lines.map((line) => {
    const taxable = roundMoney(line.quantity * line.purchasePrice);
    const lineTax = roundMoney(taxable * (line.taxRatePercent / 100));
    return {
      purchase_bill_id: billId,
      product_id: line.productId ?? null,
      variant_id: null,
      product_name: line.productName,
      barcode: line.barcode ?? null,
      expiry_date: line.expiryDate ?? null,
      quantity: line.quantity,
      purchase_price: line.purchasePrice,
      tax_rate_percent: line.taxRatePercent,
      tax_amount: lineTax,
      line_total: roundMoney(taxable + lineTax),
      unit_id: line.unitId ?? null,
    };
  });

  const { error: lineError } = await supabase.from("erp_purchase_bill_lines").insert(lineRows);
  if (lineError) throw new Error(lineError.message);

  if (landedCosts.length) {
    const lcRows = landedCosts.map((lc) => {
      const taxable = roundMoney(lc.quantity * lc.rate);
      const lineTax = roundMoney(taxable * (lc.taxRatePercent / 100));
      return {
        purchase_bill_id: billId,
        landed_cost_item_id: lc.landedCostItemId ?? null,
        name: lc.name,
        quantity: lc.quantity,
        rate: lc.rate,
        tax_rate_percent: lc.taxRatePercent,
        tax_amount: lineTax,
        line_total: roundMoney(taxable + lineTax),
      };
    });
    const { error: lcError } = await supabase.from("erp_purchase_bill_landed_costs").insert(lcRows);
    if (lcError) throw new Error(lcError.message);
  }

  const { error: refreshBillErr } = await supabase.rpc("refresh_purchase_bill_landed_allocations", {
    p_bill_id: billId,
  });
  if (refreshBillErr) throw new Error(refreshBillErr.message);

  await logAuditEvent({
    action: "update",
    entityType: "purchase_bill",
    entityId: billId,
    description: "Purchase bill draft updated",
    storeId: input.storeId,
  });
}
