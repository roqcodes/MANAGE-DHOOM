import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { requireErpStoreId } from "@/modules/erp/services/store-context.service";
import type {
  PurchaseHistoryRow,
  SalesHistoryRow,
  StoreInventoryMovementRow,
  StoreInventoryProductDetail,
  StoreProductPurchaseGlance,
  StoreProductSalesGlance,
} from "@/common/erp/store-inventory-types";

type BillLineRow = {
  product_id: string | null;
  purchase_price: number | null;
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
  product_id: string | null;
  unit_price: number | null;
  quantity: number | null;
  line_total: number | null;
  invoices: {
    id: string;
    invoice_number: string | null;
    created_at: string;
    status: string;
    store_id: string;
    users: { name: string | null } | null;
  } | null;
};

function unitCostFromLine(line: {
  unit_loaded_cost: number | null;
  purchase_price: number | null;
}): number {
  const loaded = line.unit_loaded_cost;
  if (loaded != null && loaded > 0) return Number(loaded);
  return Number(line.purchase_price ?? 0);
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
    const unit = unitCostFromLine(line);
    costs.push(unit);
    totalQty += qty;
    sumWeighted += unit * qty;

    if (recent.length < recentLimit) {
      recent.push({
        billId: bill.id,
        billNumber: bill.purchase_bill_number ?? bill.id.slice(0, 8),
        billDate: bill.purchase_date ?? bill.created_at.slice(0, 10),
        vendorName: bill.vendors?.name ?? null,
        quantity: qty,
        unitPrice: Number(line.purchase_price ?? 0),
        loadedUnitCost: line.unit_loaded_cost != null ? Number(line.unit_loaded_cost) : null,
        lineTotal: Number(line.line_total ?? qty * unit),
      });
    }
  }

  const min = costs.length ? Math.min(...costs) : null;
  const max = costs.length ? Math.max(...costs) : null;
  const avg = totalQty > 0 ? sumWeighted / totalQty : null;

  return {
    minUnitCost: min,
    maxUnitCost: max,
    avgUnitCost: avg != null ? Math.round(avg * 10000) / 10000 : null,
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
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number ?? inv.id.slice(0, 8),
        invoiceDate: inv.created_at.slice(0, 10),
        customerName: inv.users?.name ?? null,
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
    avgUnitPrice: avg != null ? Math.round(avg * 10000) / 10000 : null,
    saleCount: prices.length,
    totalQtySold: totalQty,
    recent,
  };
}

async function loadBillLinesForProducts(storeId: string, productIds: string[]) {
  if (productIds.length === 0) return [] as BillLineRow[];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("erp_purchase_bill_lines")
    .select(
      `product_id, purchase_price, unit_loaded_cost, quantity, line_total,
      erp_purchase_bills!inner(id, purchase_bill_number, purchase_date, created_at, status, store_id, vendors(name))`,
    )
    .eq("erp_purchase_bills.store_id", storeId)
    .neq("erp_purchase_bills.status", "cancelled")
    .in("product_id", productIds);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as BillLineRow[];
}

async function loadInvoiceLinesForProducts(storeId: string, productIds: string[]) {
  if (productIds.length === 0) return [] as InvoiceLineRow[];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invoice_items")
    .select(
      `product_id, unit_price, quantity, line_total,
      invoices!inner(id, invoice_number, created_at, status, store_id, users:users!invoices_user_id_fkey(name))`,
    )
    .eq("invoices.store_id", storeId)
    .neq("invoices.status", "cancelled")
    .in("product_id", productIds);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as InvoiceLineRow[];
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

  const [{ data: storeRow }, { data: product }, { data: spi }] = await Promise.all([
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
  ]);

  if (!product) throw new Error("Product not found");

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

  const [billLines, invoiceLines, movementRes] = await Promise.all([
    loadBillLinesForProducts(activeStoreId, [productId]),
    loadInvoiceLinesForProducts(activeStoreId, [productId]),
    movementsQuery,
  ]);

  const wac = spi?.purchase_price != null ? Number(spi.purchase_price) : null;
  const purchase = buildPurchaseGlance(
    billLines.filter((l) => l.product_id === productId),
    wac,
    15,
  );
  const sales = buildSalesGlance(
    invoiceLines.filter((l) => l.product_id === productId),
    15,
  );

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
    productId: product.id,
    productName: product.name ?? "Product",
    barcode: product.barcode,
    catalogPurchasePrice:
      product.purchase_price != null ? Number(product.purchase_price) : null,
    catalogSalesPrice: product.price != null ? Number(product.price) : null,
    storeId: activeStoreId,
    storeName: storeRow?.name ?? "Store",
    onHandStock: Number(spi?.stock ?? 0),
    centralStock,
    storeSalesPrice:
      spi?.sales_price != null
        ? Number(spi.sales_price)
        : product.price != null
          ? Number(product.price)
          : null,
    storeWac: wac,
    purchase,
    sales,
    movements,
  };
}
