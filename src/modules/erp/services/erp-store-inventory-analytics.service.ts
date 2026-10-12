import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { requireErpStoreId } from "@/modules/erp/services/store-context.service";
import type {
  PurchaseHistoryRow,
  SalesHistoryRow,
  SalesReturnHistoryRow,
  StoreInventoryMovementRow,
  StoreInventoryProductDetail,
  StoreProductPurchaseGlance,
  StoreProductSalesGlance,
  StoreProductSalesReturnGlance,
  StoreProductVendorReturnGlance,
  VendorReturnHistoryRow,
} from "@/common/erp/store-inventory-types";
import { roundCalc } from "@/lib/decimal-precision";
import { calcUnitLoadedCostFromAlloc } from "@/modules/purchasing/lib/purchase-landed-allocation";

type BillLineRow = {
  id: string;
  product_id: string | null;
  purchase_price: number | null;
  landed_cost_allocated: number | null;
  unit_loaded_cost: number | null;
  quantity: number | null;
  line_total: number | null;
  erp_purchase_bills: {
    id: string;
    purchase_bill_number: string | null;
    purchase_date: string | null;
    created_at: string;
    status: string;
    store_id: string;
    vendors: { name: string | null } | null;
  } | null;
};

type InvoiceLineRow = {
  id: string;
  product_id: string | null;
  unit_price: number | null;
  quantity: number | null;
  total_amount: number | null;
  invoices: {
    id: string;
    invoice_number: string | null;
    created_at: string;
    status: string;
    store_id: string;
    users: { name: string | null } | null;
  } | null;
};

type CreditNoteLineRow = {
  id: string;
  product_id: string | null;
  unit_price: number | null;
  quantity: number | null;
  line_total: number | null;
  erp_credit_notes: {
    id: string;
    credit_note_number: string | null;
    credit_note_date: string | null;
    created_at: string;
    status: string;
    store_id: string;
    users: { name: string | null } | null;
  } | null;
};

type VendorCreditLineRow = {
  id: string;
  product_id: string | null;
  unit_price: number | null;
  quantity: number | null;
  line_total: number | null;
  erp_vendor_credits: {
    id: string;
    credit_number: string | null;
    credit_date: string | null;
    created_at: string;
    status: string;
    store_id: string;
    vendors: { name: string | null } | null;
  } | null;
};

type ProductAnalyticsRpc = {
  centralStock: number;
  purchase: {
    minUnitCost: number | null;
    maxUnitCost: number | null;
    avgUnitCost: number | null;
    totalQtyPurchased: number;
    purchaseCount: number;
    recent: PurchaseHistoryRow[];
  };
  sales: {
    minUnitPrice: number | null;
    maxUnitPrice: number | null;
    avgUnitPrice: number | null;
    totalQtySold: number;
    saleCount: number;
    recent: SalesHistoryRow[];
  };
  movements: StoreInventoryMovementRow[];
};

function loadedUnitFromBillLine(line: {
  unit_loaded_cost: number | null;
  purchase_price: number | null;
  landed_cost_allocated: number | null;
  quantity: number | null;
}): number {
  const price = Number(line.purchase_price ?? 0);
  const qty = Math.max(0, Number(line.quantity ?? 0));
  const stored = line.unit_loaded_cost;
  if (stored != null && Number.isFinite(Number(stored))) {
    return Number(stored);
  }
  const alloc = Number(line.landed_cost_allocated ?? 0);
  return calcUnitLoadedCostFromAlloc(price, qty, alloc);
}

function buildPurchaseGlance(
  lines: BillLineRow[],
  wacAtStore: number | null,
  recentLimit = 8,
): StoreProductPurchaseGlance {
  const costs: number[] = [];
  let totalQty = 0;
  let sumWeighted = 0;
  const recent: PurchaseHistoryRow[] = [];

  const sorted = [...lines].sort((a, b) => {
    const billA = a.erp_purchase_bills;
    const billB = b.erp_purchase_bills;
    const atA = billA?.purchase_date ?? billA?.created_at ?? "";
    const atB = billB?.purchase_date ?? billB?.created_at ?? "";
    return atB.localeCompare(atA);
  });

  for (const line of sorted) {
    const bill = line.erp_purchase_bills;
    if (!bill || bill.status === "cancelled") continue;
    const qty = Math.max(0, Number(line.quantity ?? 0));
    if (qty <= 0) continue;
    const unitPrice = Number(line.purchase_price ?? 0);
    const landedAlloc =
      line.landed_cost_allocated != null && Number(line.landed_cost_allocated) > 0
        ? Number(line.landed_cost_allocated)
        : null;
    const loadedUnit = loadedUnitFromBillLine(line);
    costs.push(loadedUnit);
    totalQty += qty;
    sumWeighted += loadedUnit * qty;

    if (recent.length < recentLimit) {
      recent.push({
        lineId: line.id,
        billId: bill.id,
        billNumber: bill.purchase_bill_number ?? bill.id.slice(0, 8),
        billDate: bill.purchase_date ?? bill.created_at.slice(0, 10),
        vendorName: bill.vendors?.name ?? null,
        quantity: qty,
        unitPrice,
        landedCostAllocated: landedAlloc,
        loadedUnitCost: loadedUnit,
        lineTotal: Number(line.line_total ?? qty * unitPrice),
      });
    }
  }

  const min = costs.length ? Math.min(...costs) : null;
  const max = costs.length ? Math.max(...costs) : null;
  const avg = totalQty > 0 ? sumWeighted / totalQty : null;

  return {
    minUnitCost: min,
    maxUnitCost: max,
    avgUnitCost: avg != null ? roundCalc(avg) : null,
    purchaseCount: costs.length,
    totalQtyPurchased: totalQty,
    wacAtStore,
    recent,
  };
}

function buildSalesGlance(lines: InvoiceLineRow[], recentLimit = 8): StoreProductSalesGlance {
  const prices: number[] = [];
  let totalQty = 0;
  let sumWeighted = 0;
  const recent: SalesHistoryRow[] = [];

  const sorted = [...lines].sort((a, b) => {
    const atA = a.invoices?.created_at ?? "";
    const atB = b.invoices?.created_at ?? "";
    return atB.localeCompare(atA);
  });

  for (const line of sorted) {
    const inv = line.invoices;
    if (!inv || inv.status === "cancelled") continue;
    const qty = Math.max(0, Number(line.quantity ?? 0));
    if (qty <= 0) continue;
    const unit = Number(line.unit_price ?? 0);
    prices.push(unit);
    totalQty += qty;
    sumWeighted += unit * qty;

    if (recent.length < recentLimit) {
      recent.push({
        lineId: line.id,
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number ?? inv.id.slice(0, 8),
        invoiceDate: inv.created_at.slice(0, 10),
        customerName: inv.users?.name ?? null,
        quantity: qty,
        unitPrice: unit,
        lineTotal: Number(line.total_amount ?? qty * unit),
      });
    }
  }

  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const avg = totalQty > 0 ? sumWeighted / totalQty : null;

  return {
    minUnitPrice: min,
    maxUnitPrice: max,
    avgUnitPrice: avg != null ? roundCalc(avg) : null,
    saleCount: prices.length,
    totalQtySold: totalQty,
    recent,
  };
}

function buildSalesReturnGlance(
  lines: CreditNoteLineRow[],
  recentLimit = 15,
): StoreProductSalesReturnGlance {
  const prices: number[] = [];
  let totalQty = 0;
  let sumWeighted = 0;
  const recent: SalesReturnHistoryRow[] = [];

  const sorted = [...lines].sort((a, b) => {
    const cnA = a.erp_credit_notes;
    const cnB = b.erp_credit_notes;
    const atA = cnA?.credit_note_date ?? cnA?.created_at ?? "";
    const atB = cnB?.credit_note_date ?? cnB?.created_at ?? "";
    return atB.localeCompare(atA);
  });

  for (const line of sorted) {
    const cn = line.erp_credit_notes;
    if (!cn || cn.status === "cancelled") continue;
    const qty = Math.max(0, Number(line.quantity ?? 0));
    if (qty <= 0) continue;
    const unit = Number(line.unit_price ?? 0);
    prices.push(unit);
    totalQty += qty;
    sumWeighted += unit * qty;

    if (recent.length < recentLimit) {
      recent.push({
        lineId: line.id,
        creditNoteId: cn.id,
        creditNoteNumber: cn.credit_note_number ?? cn.id.slice(0, 8),
        creditNoteDate: cn.credit_note_date ?? cn.created_at.slice(0, 10),
        customerName: cn.users?.name ?? null,
        quantity: qty,
        unitPrice: unit,
        lineTotal: Number(line.line_total ?? qty * unit),
      });
    }
  }

  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const avg = totalQty > 0 ? sumWeighted / totalQty : null;

  return {
    minUnitPrice: min,
    maxUnitPrice: max,
    avgUnitPrice: avg != null ? roundCalc(avg) : null,
    returnCount: prices.length,
    totalQtyReturned: totalQty,
    recent,
  };
}

function buildVendorReturnGlance(
  lines: VendorCreditLineRow[],
  recentLimit = 15,
): StoreProductVendorReturnGlance {
  const prices: number[] = [];
  let totalQty = 0;
  let sumWeighted = 0;
  const recent: VendorReturnHistoryRow[] = [];

  const sorted = [...lines].sort((a, b) => {
    const vcA = a.erp_vendor_credits;
    const vcB = b.erp_vendor_credits;
    const atA = vcA?.credit_date ?? vcA?.created_at ?? "";
    const atB = vcB?.credit_date ?? vcB?.created_at ?? "";
    return atB.localeCompare(atA);
  });

  for (const line of sorted) {
    const vc = line.erp_vendor_credits;
    if (!vc || vc.status === "cancelled") continue;
    const qty = Math.max(0, Number(line.quantity ?? 0));
    if (qty <= 0) continue;
    const unit = Number(line.unit_price ?? 0);
    prices.push(unit);
    totalQty += qty;
    sumWeighted += unit * qty;

    if (recent.length < recentLimit) {
      recent.push({
        lineId: line.id,
        vendorCreditId: vc.id,
        creditNumber: vc.credit_number ?? vc.id.slice(0, 8),
        creditDate: vc.credit_date ?? vc.created_at.slice(0, 10),
        vendorName: vc.vendors?.name ?? null,
        quantity: qty,
        unitPrice: unit,
        lineTotal: Number(line.line_total ?? qty * unit),
      });
    }
  }

  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const avg = totalQty > 0 ? sumWeighted / totalQty : null;

  return {
    minUnitPrice: min,
    maxUnitPrice: max,
    avgUnitPrice: avg != null ? roundCalc(avg) : null,
    returnCount: prices.length,
    totalQtyReturned: totalQty,
    recent,
  };
}

function purchaseGlanceFromRpc(
  block: ProductAnalyticsRpc["purchase"],
  wacAtStore: number | null,
): StoreProductPurchaseGlance {
  return {
    minUnitCost: block.minUnitCost,
    maxUnitCost: block.maxUnitCost,
    avgUnitCost: block.avgUnitCost,
    purchaseCount: block.purchaseCount,
    totalQtyPurchased: block.totalQtyPurchased,
    wacAtStore,
    recent: block.recent ?? [],
  };
}

function salesGlanceFromRpc(block: ProductAnalyticsRpc["sales"]): StoreProductSalesGlance {
  return {
    minUnitPrice: block.minUnitPrice,
    maxUnitPrice: block.maxUnitPrice,
    avgUnitPrice: block.avgUnitPrice,
    saleCount: block.saleCount,
    totalQtySold: block.totalQtySold,
    recent: block.recent ?? [],
  };
}

async function loadProductAnalyticsRpc(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  productId: string,
  storeId: string,
  recentLimit: number,
  movementLimit: number,
): Promise<ProductAnalyticsRpc | null> {
  const { data, error } = await (
    supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc("erp_store_inventory_product_analytics", {
    p_product_id: productId,
    p_store_id: storeId,
    p_recent_limit: recentLimit,
    p_movement_limit: movementLimit,
  });
  if (error) {
    if (error.message.includes("Could not find the function")) {
      return null;
    }
    throw new Error(error.message);
  }
  return data as ProductAnalyticsRpc;
}

async function loadBillLinesForProducts(storeId: string, productIds: string[]) {
  if (productIds.length === 0) return [] as BillLineRow[];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("erp_purchase_bill_lines")
    .select(
      `id, product_id, purchase_price, landed_cost_allocated, unit_loaded_cost, quantity, line_total,
      erp_purchase_bills!inner(id, purchase_bill_number, purchase_date, created_at, status, store_id, vendors(name))`,
    )
    .eq("erp_purchase_bills.store_id", storeId)
    .neq("erp_purchase_bills.status", "cancelled")
    .in("product_id", productIds);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as BillLineRow[];
}

async function loadCreditNoteLinesForProduct(storeId: string, productId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("erp_credit_note_lines")
    .select(
      `id, product_id, unit_price, quantity, line_total,
      erp_credit_notes!inner(
        id, credit_note_number, credit_note_date, created_at, status, store_id,
        users:users!erp_credit_notes_user_id_fkey(name)
      )`,
    )
    .eq("product_id", productId)
    .eq("erp_credit_notes.store_id", storeId)
    .neq("erp_credit_notes.status", "cancelled");

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CreditNoteLineRow[];
}

async function loadVendorCreditLinesForProduct(storeId: string, productId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("erp_vendor_credit_lines")
    .select(
      `id, product_id, unit_price, quantity, line_total,
      erp_vendor_credits!inner(
        id, credit_number, credit_date, created_at, status, store_id,
        vendors(name)
      )`,
    )
    .eq("product_id", productId)
    .eq("erp_vendor_credits.store_id", storeId)
    .neq("erp_vendor_credits.status", "cancelled");

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as VendorCreditLineRow[];
}

async function loadInvoiceLinesForProducts(storeId: string, productIds: string[]) {
  if (productIds.length === 0) return [] as InvoiceLineRow[];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invoice_items")
    .select(
      `id, product_id, unit_price, quantity, total_amount,
      invoices!inner(id, invoice_number, created_at, status, store_id, users:users!invoices_user_id_fkey(name))`,
    )
    .eq("invoices.store_id", storeId)
    .neq("invoices.status", "cancelled")
    .in("product_id", productIds);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as InvoiceLineRow[];
}

async function loadProductDetailLegacy(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  productId: string,
  activeStoreId: string,
  wac: number | null,
): Promise<
  Pick<
    StoreInventoryProductDetail,
    | "centralStock"
    | "purchase"
    | "sales"
    | "salesReturns"
    | "vendorReturns"
    | "movements"
  >
> {
  const { data: variants } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", productId);
  const variantIds = (variants ?? []).map((v) => v.id);
  let centralStock = 0;
  if (variantIds.length > 0) {
    const { data: invRows } = await supabase
      .from("inventory")
      .select("stock")
      .eq("store_id", activeStoreId)
      .in("variant_id", variantIds);
    for (const row of invRows ?? []) {
      centralStock += Number(row.stock ?? 0);
    }
  }

  const movementsQuery =
    variantIds.length > 0
      ? supabase
          .from("stock_movements")
          .select(
            "id, created_at, type, quantity, transaction_price, reference_type, reference_id, reason",
          )
          .eq("store_id", activeStoreId)
          .in("variant_id", variantIds)
          .order("created_at", { ascending: false })
          .limit(25)
      : Promise.resolve({ data: [] as const, error: null });

  const [billLines, invoiceLines, creditNoteLines, vendorCreditLines, movementRes] =
    await Promise.all([
      loadBillLinesForProducts(activeStoreId, [productId]),
      loadInvoiceLinesForProducts(activeStoreId, [productId]),
      loadCreditNoteLinesForProduct(activeStoreId, productId),
      loadVendorCreditLinesForProduct(activeStoreId, productId),
      movementsQuery,
    ]);

  const movements: StoreInventoryMovementRow[] = (movementRes.data ?? []).map((row) => ({
    id: row.id as string,
    createdAt: row.created_at as string,
    type: row.type as string,
    quantity: Number(row.quantity ?? 0),
    transactionPrice:
      row.transaction_price != null ? Number(row.transaction_price) : null,
    referenceType: row.reference_type as string | null,
    referenceId: row.reference_id as string | null,
    reason: row.reason as string | null,
  }));

  return {
    centralStock,
    purchase: buildPurchaseGlance(
      billLines.filter((l) => l.product_id === productId),
      wac,
      15,
    ),
    sales: buildSalesGlance(
      invoiceLines.filter((l) => l.product_id === productId),
      15,
    ),
    salesReturns: buildSalesReturnGlance(creditNoteLines, 15),
    vendorReturns: buildVendorReturnGlance(vendorCreditLines, 15),
    movements,
  };
}

export async function getStoreProductPurchaseGlance(
  productId: string,
  storeId?: string | null,
): Promise<StoreProductPurchaseGlance> {
  await requireAdminOrManagerProfile();
  const activeStoreId = await requireErpStoreId(storeId);
  const supabase = await createSupabaseServerClient();

  const { data: spi } = await supabase
    .from("store_product_inventory")
    .select("purchase_price")
    .eq("store_id", activeStoreId)
    .eq("product_id", productId)
    .maybeSingle();

  const wac =
    spi?.purchase_price != null ? Number(spi.purchase_price) : null;

  const analytics = await loadProductAnalyticsRpc(supabase, productId, activeStoreId, 6, 0);
  if (analytics) {
    return purchaseGlanceFromRpc(analytics.purchase, wac);
  }

  const billLines = await loadBillLinesForProducts(activeStoreId, [productId]);
  const forProduct = billLines.filter((l) => l.product_id === productId);
  return buildPurchaseGlance(forProduct, wac, 6);
}

export async function getStoreInventoryProductDetail(
  productId: string,
  storeId?: string | null,
): Promise<StoreInventoryProductDetail> {
  await requireAdminOrManagerProfile();
  const activeStoreId = await requireErpStoreId(storeId);
  const supabase = await createSupabaseServerClient();

  const [
    { data: storeRow },
    { data: product },
    { data: spi },
    analytics,
    creditNoteLines,
    vendorCreditLines,
  ] = await Promise.all([
    supabase.from("stores").select("id, name").eq("id", activeStoreId).single(),
    supabase
      .from("products")
      .select("id, name, barcode, price, purchase_price")
      .eq("id", productId)
      .single(),
    supabase
      .from("store_product_inventory")
      .select("stock, purchase_price, sales_price")
      .eq("store_id", activeStoreId)
      .eq("product_id", productId)
      .maybeSingle(),
    loadProductAnalyticsRpc(supabase, productId, activeStoreId, 15, 25),
    loadCreditNoteLinesForProduct(activeStoreId, productId),
    loadVendorCreditLinesForProduct(activeStoreId, productId),
  ]);

  if (!product) throw new Error("Product not found");

  const wac = spi?.purchase_price != null ? Number(spi.purchase_price) : null;

  const salesReturns = buildSalesReturnGlance(creditNoteLines, 15);
  const vendorReturns = buildVendorReturnGlance(vendorCreditLines, 15);

  const heavy = analytics
    ? {
        centralStock: Number(analytics.centralStock ?? 0),
        purchase: purchaseGlanceFromRpc(analytics.purchase, wac),
        sales: salesGlanceFromRpc(analytics.sales),
        salesReturns,
        vendorReturns,
        movements: analytics.movements ?? [],
      }
    : await loadProductDetailLegacy(supabase, productId, activeStoreId, wac);

  return {
    productId: product.id,
    productName: product.name ?? "Product",
    barcode: product.barcode,
    catalogPurchasePrice:
      product.purchase_price != null ? Number(product.purchase_price) : null,
    catalogSalesPrice: product.price != null ? Number(product.price) : null,
    storeId: activeStoreId,
    storeName: storeRow?.name ?? "Store",
    onHandStock: Number(spi?.stock ?? 0),
    centralStock: heavy.centralStock,
    storeSalesPrice:
      spi?.sales_price != null
        ? Number(spi.sales_price)
        : product.price != null
          ? Number(product.price)
          : null,
    storeWac: wac,
    purchase: heavy.purchase,
    sales: heavy.sales,
    salesReturns: heavy.salesReturns,
    vendorReturns: heavy.vendorReturns,
    movements: heavy.movements,
  };
}
