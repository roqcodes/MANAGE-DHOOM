import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  ErpPurchaseLineInput,
  ErpPurchaseOrderDetail,
  ErpPurchaseOrderLineDiscrepancy,
  ErpPurchaseOrderListRow,
  ErpLandedCostLineInput,
} from "@/common/erp/purchasing-types";
import { matchPoLineToBillLine } from "@/common/erp/match-po-bill-line";
import { roundMoney } from "@/common/erp/purchasing-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { requireErpStoreId, resolveErpStoreId } from "@/modules/erp/services/store-context.service";
import type { Json } from "@/lib/integrations/supabase/types";

function calcPoTotals(lines: ErpPurchaseLineInput[], landedCosts: ErpLandedCostLineInput[], discount: number) {
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
  return { subtotal: roundMoney(subtotal), tax: roundMoney(tax), landedTotal, total };
}

async function persistPoLandedCosts(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  poId: string,
  landedCosts: ErpLandedCostLineInput[],
) {
  await supabase.from("purchase_order_landed_costs").delete().eq("po_id", poId);

  if (landedCosts.length > 0) {
    const rows = landedCosts.map((lc) => {
      const taxable = roundMoney(lc.quantity * lc.rate);
      const lineTax = roundMoney(taxable * (lc.taxRatePercent / 100));
      return {
        po_id: poId,
        landed_cost_item_id: lc.landedCostItemId ?? null,
        name: lc.name,
        quantity: lc.quantity,
        rate: lc.rate,
        tax_rate_percent: lc.taxRatePercent,
        tax_amount: lineTax,
        line_total: roundMoney(taxable + lineTax),
      };
    });
    const { error } = await supabase.from("purchase_order_landed_costs").insert(rows);
    if (error) throw new Error(error.message);
  }

  const { error: refreshError } = await supabase.rpc("refresh_purchase_order_landed_allocations", {
    p_po_id: poId,
  });
  if (refreshError) throw new Error(refreshError.message);
}

export async function listErpPurchaseOrders(options: {
  page?: number;
  limit?: number;
  status?: string;
  vendorId?: string;
  storeId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<{ data: ErpPurchaseOrderListRow[]; total: number }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const page = options.page ?? 0;
  const limit = options.limit ?? 20;
  const from = page * limit;

  let query = supabase
    .from("purchase_orders")
    .select(
      "id, po_number, vendor_id, store_id, status, reference, po_date, expected_delivery_date, subtotal, tax_total, discount, total_amount, created_at, vendors(name), stores(name)",
      { count: "exact" },
    )
    .order("po_date", { ascending: false, nullsFirst: false })
    .range(from, from + limit - 1);

  if (options.status && options.status !== "all") query = query.eq("status", options.status);
  if (options.vendorId) query = query.eq("vendor_id", options.vendorId);
  if (options.storeId) query = query.eq("store_id", options.storeId);
  if (options.dateFrom) query = query.gte("po_date", options.dateFrom);
  if (options.dateTo) query = query.lte("po_date", options.dateTo);
  if (options.search?.trim()) {
    const s = options.search.trim();
    query = query.or(`po_number.ilike.%${s}%,reference.ilike.%${s}%`);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    data: (data ?? []).map((row) => {
      const vendor = row.vendors as { name: string | null } | null;
      const store = row.stores as { name: string } | null;
      return {
        id: row.id,
        po_number: row.po_number,
        vendor_id: row.vendor_id,
        store_id: row.store_id,
        status: row.status,
        reference: row.reference,
        po_date: row.po_date,
        expected_delivery_date: row.expected_delivery_date,
        subtotal: Number(row.subtotal ?? 0),
        tax_total: Number(row.tax_total ?? 0),
        discount: Number(row.discount ?? 0),
        total_amount: row.total_amount != null ? Number(row.total_amount) : null,
        created_at: row.created_at,
        vendor_name: vendor?.name ?? null,
        store_name: store?.name ?? null,
      };
    }),
    total: count ?? 0,
  };
}

export async function getErpPurchaseOrderDetail(poId: string): Promise<ErpPurchaseOrderDetail | null> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_number, vendor_id, store_id, status, reference, po_date, expected_delivery_date, subtotal, tax_total, discount, total_amount, notes, created_at, vendors(id, name, contact, phone, email, address, trn), stores(id, name), purchase_order_items(id, product_id, variant_id, quantity, price, tax_rate_percent, tax_amount, line_total, received_qty, accepted_qty, rejected_qty, products(id, name), product_variants(id, name, barcode, product_id, products(id, name)))",
    )
    .eq("id", poId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const { data: poLandedRows } = await supabase
    .from("purchase_order_landed_costs")
    .select("id, landed_cost_item_id, name, quantity, rate, tax_rate_percent")
    .eq("po_id", poId);

  const { data: billRows, error: billErr } = await supabase
    .from("erp_purchase_bills")
    .select(
      "id, purchase_bill_number, status, accounting_posted, total_amount, created_at, erp_purchase_bill_lines(id, variant_id, product_id, product_name, original_quantity, quantity, accepted_qty)",
    )
    .eq("po_id", poId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  if (billErr) throw new Error(billErr.message);

  const billRow =
    (billRows ?? []).find((row) => row.status === "draft") ?? billRows?.[0] ?? null;

  const { data: receiveRow } = billRow
    ? await supabase
        .from("erp_purchase_receives")
        .select("id, receive_number, status")
        .eq("po_id", poId)
        .eq("purchase_bill_id", billRow.id)
        .eq("status", "finalized")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const items = (data.purchase_order_items ?? []).map((item) => ({
    ...item,
    quantity: Number(item.quantity ?? 0),
    price: Number(item.price ?? 0),
    tax_rate_percent: Number(item.tax_rate_percent ?? 0),
    tax_amount: Number(item.tax_amount ?? 0),
    line_total: Number(item.line_total ?? 0),
    received_qty: Number(item.received_qty ?? 0),
    accepted_qty: Number(item.accepted_qty ?? 0),
    rejected_qty: Number(item.rejected_qty ?? 0),
  }));

  const billLines = (billRow?.erp_purchase_bill_lines ?? []).map((line) => ({
    id: line.id as string,
    variant_id: line.variant_id as string | null,
    product_id: (line as { product_id?: string | null }).product_id ?? null,
    product_name: line.product_name as string,
    original_quantity:
      line.original_quantity != null ? Number(line.original_quantity) : Number(line.quantity ?? 0),
    quantity: Number(line.quantity ?? 0),
    accepted_qty: Number(line.accepted_qty ?? 0),
  }));

  const linkedBill = billRow
    ? {
        id: billRow.id as string,
        purchase_bill_number: billRow.purchase_bill_number as string,
        status: billRow.status as string,
        accounting_posted: Boolean(billRow.accounting_posted),
        total_amount: Number(billRow.total_amount ?? 0),
        lines: billLines,
      }
    : null;

  const deliverySubmitted = Boolean(receiveRow);
  const hasDraftBill = linkedBill?.status === "draft";
  const canSubmitDelivery =
    hasDraftBill &&
    !deliverySubmitted &&
    data.status !== "cancelled" &&
    items.length > 0;

  const discrepancies: ErpPurchaseOrderLineDiscrepancy[] = items.map((line) => {
    const productName =
      (line as { products?: { name?: string | null } | null }).products?.name ??
      line.product_variants?.products?.name ??
      line.product_variants?.name ??
      "Item";
    const billLine = billLines.find((bl) => matchPoLineToBillLine(line, bl));
    const originalBillQty = billLine?.original_quantity ?? line.quantity;
    const finalBillQty = billLine?.quantity ?? line.accepted_qty;
    const deliveredQty = line.accepted_qty;
    return {
      poLineId: line.id as string,
      productName,
      orderedQty: line.quantity,
      originalBillQty,
      deliveredQty,
      finalBillQty,
      varianceVsOrder: deliveredQty - line.quantity,
      varianceVsOriginalBill: finalBillQty - originalBillQty,
    };
  });

  return {
    ...data,
    subtotal: Number(data.subtotal ?? 0),
    tax_total: Number(data.tax_total ?? 0),
    discount: Number(data.discount ?? 0),
    total_amount: data.total_amount != null ? Number(data.total_amount) : null,
    purchase_order_items: items,
    linked_bill: linkedBill,
    delivery: {
      hasDraftBill,
      deliverySubmitted,
      receiveId: receiveRow?.id ?? null,
      receiveNumber: receiveRow?.receive_number ?? null,
      canSubmitDelivery,
    },
    discrepancies,
    purchase_order_landed_costs: (poLandedRows ?? []).map((lc) => ({
      id: lc.id as string,
      landed_cost_item_id: lc.landed_cost_item_id as string | null,
      name: lc.name as string,
      quantity: Number(lc.quantity ?? 0),
      rate: Number(lc.rate ?? 0),
      tax_rate_percent: Number(lc.tax_rate_percent ?? 0),
    })),
  } as ErpPurchaseOrderDetail;
}

export async function createErpPurchaseOrder(input: {
  vendorId: string;
  storeId?: string;
  poDate: string;
  expectedDeliveryDate?: string | null;
  reference?: string | null;
  notes?: string | null;
  lines: ErpPurchaseLineInput[];
  discount?: number;
  landedCosts?: ErpLandedCostLineInput[];
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);
  if (!input.lines.length) throw new Error("At least one line item is required");

  const linesJson: Json = input.lines.map((l) => ({
    product_id: l.productId ?? null,
    variant_id: null,
    quantity: l.quantity,
    purchase_price: l.purchasePrice,
    tax_rate_percent: l.taxRatePercent,
  })) as Json;

  const { data, error } = await supabase.rpc("create_erp_purchase_order", {
    p_vendor_id: input.vendorId,
    p_store_id: storeId,
    p_po_date: input.poDate,
    p_expected_delivery_date: input.expectedDeliveryDate ?? undefined,
    p_reference: input.reference ?? undefined,
    p_notes: input.notes ?? undefined,
    p_lines: linesJson,
    p_discount: input.discount ?? 0,
  });

  if (error) throw new Error(error.message);

  const poId = data as string;
  await persistPoLandedCosts(supabase, poId, input.landedCosts ?? []);

  const totals = calcPoTotals(input.lines, input.landedCosts ?? [], input.discount ?? 0);
  await supabase
    .from("purchase_orders")
    .update({
      landed_cost_total: totals.landedTotal,
      total_amount: totals.total,
    })
    .eq("id", poId);

  await logAuditEvent({
    action: "create",
    entityType: "purchase_order",
    entityId: poId,
    description: "ERP purchase order created",
    storeId,
  });

  return poId;
}

export async function updateErpPurchaseOrder(
  poId: string,
  input: {
    vendorId: string;
    storeId: string;
    poDate: string;
    expectedDeliveryDate?: string | null;
    reference?: string | null;
    notes?: string | null;
    lines: ErpPurchaseLineInput[];
    discount?: number;
    landedCosts?: ErpLandedCostLineInput[];
  },
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await supabase
    .from("purchase_orders")
    .select("status")
    .eq("id", poId)
    .single();

  if (fetchError) throw new Error(fetchError.message);
  if (existing.status !== "pending") {
    throw new Error("Only pending purchase orders can be edited");
  }
  if (!input.lines.length) throw new Error("At least one line item is required");

  const discount = input.discount ?? 0;
  const landedCosts = input.landedCosts ?? [];
  const totals = calcPoTotals(input.lines, landedCosts, discount);

  const { error: updateError } = await supabase
    .from("purchase_orders")
    .update({
      vendor_id: input.vendorId,
      store_id: input.storeId,
      po_date: input.poDate,
      expected_delivery_date: input.expectedDeliveryDate ?? null,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      discount,
      subtotal: totals.subtotal,
      tax_total: totals.tax,
      landed_cost_total: totals.landedTotal,
      total_amount: totals.total,
      updated_at: new Date().toISOString(),
    })
    .eq("id", poId)
    .eq("status", "pending");

  if (updateError) throw new Error(updateError.message);

  const { error: deleteError } = await supabase
    .from("purchase_order_items")
    .delete()
    .eq("po_id", poId);
  if (deleteError) throw new Error(deleteError.message);

  const items = input.lines.map((line) => {
    const taxable = roundMoney(line.quantity * line.purchasePrice);
    const lineTax = roundMoney(taxable * (line.taxRatePercent / 100));
    return {
      po_id: poId,
      product_id: line.productId ?? null,
      variant_id: null,
      quantity: line.quantity,
      price: line.purchasePrice,
      tax_rate_percent: line.taxRatePercent,
      tax_amount: lineTax,
      line_total: roundMoney(taxable + lineTax),
    };
  });

  const { error: insertError } = await supabase.from("purchase_order_items").insert(items);
  if (insertError) throw new Error(insertError.message);

  await persistPoLandedCosts(supabase, poId, landedCosts);

  await logAuditEvent({
    action: "update",
    entityType: "purchase_order",
    entityId: poId,
    description: "Purchase order updated",
    storeId: input.storeId,
  });
}

export async function submitPoDeliveryAndFinalize(input: {
  poId: string;
  receiveDate?: string;
  notes?: string | null;
  lines: Array<{ poLineId: string; deliveredQty: number }>;
  /** Safe retries (same key) return the original receive/bill without duplicating stock or GL. */
  idempotencyKey?: string;
}): Promise<{ receiveId: string; billId: string }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const linesJson: Json = input.lines.map((line) => ({
    po_line_id: line.poLineId,
    delivered_qty: line.deliveredQty,
  })) as Json;

  const { data, error } = await supabase.rpc("submit_erp_po_delivery_and_finalize", {
    p_po_id: input.poId,
    p_lines: linesJson,
    p_receive_date: input.receiveDate ?? new Date().toISOString().slice(0, 10),
    p_notes: input.notes ?? undefined,
    p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
  });

  if (error) throw new Error(error.message);

  const result = data as { receive_id: string; bill_id: string; po_id: string };

  await logAuditEvent({
    action: "submit_delivery",
    entityType: "purchase_order",
    entityId: input.poId,
    description: "Delivery submitted and invoice finalized",
  });

  return {
    receiveId: result.receive_id,
    billId: result.bill_id,
  };
}
