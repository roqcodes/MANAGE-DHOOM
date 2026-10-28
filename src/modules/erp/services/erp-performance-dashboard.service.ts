import "server-only";

import type { ReportChannel } from "@/common/erp/report-types";
import type { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

export function normalizeReportUuid(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function rpcClient(supabase: Supabase) {
  return supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;
  };
}

function asJsonRows(data: unknown): Record<string, unknown>[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (typeof data === "string") {
    try {
      return asJsonRows(JSON.parse(data));
    } catch {
      return [];
    }
  }
  if (typeof data === "object" && "rows" in data) {
    return asJsonRows((data as { rows: unknown }).rows);
  }
  return [];
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function periodDaysInclusive(from: string, to: string) {
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 1;
  return Math.max(1, Math.floor((b.getTime() - a.getTime()) / 86400000) + 1);
}

function topN(
  rows: Record<string, unknown>[],
  key: string,
  n: number,
  desc = true,
) {
  return [...rows]
    .sort((x, y) => {
      const a = Number(x[key] ?? 0);
      const b = Number(y[key] ?? 0);
      return desc ? b - a : a - b;
    })
    .slice(0, n);
}

function aggregateProductRows(
  variantRows: Record<string, unknown>[],
  days: number,
): Record<string, unknown>[] {
  const byKey = new Map<string, Record<string, unknown>>();

  for (const row of variantRows) {
    const key =
      (row.product_id as string | undefined) ??
      (row.variant_id as string | undefined) ??
      String(row.product_name ?? "");
    if (!key) continue;

    const cur = byKey.get(key) ?? {
      product_id: row.product_id ?? null,
      product_name: row.product_name ?? "Item",
      qty: 0,
      net_sales_ex_tax: 0,
      profit: 0,
      cogs: 0,
      uncosted_revenue: 0,
    };

    cur.qty = Number(cur.qty) + Number(row.total_qty ?? 0);
    cur.net_sales_ex_tax = Number(cur.net_sales_ex_tax) + Number(row.net_sales_ex_tax ?? 0);
    cur.profit = Number(cur.profit) + Number(row.profit ?? 0);
    cur.cogs = Number(cur.cogs) + Number(row.purchase_cost ?? 0);
    cur.uncosted_revenue =
      Number(cur.uncosted_revenue) + Number(row.uncosted_revenue ?? 0);

    byKey.set(key, cur);
  }

  return [...byKey.values()].map((r) => {
    const cogs = Number(r.cogs);
    const profit = Number(r.profit);
    const qty = Number(r.qty);
    const net = Number(r.net_sales_ex_tax);
    return {
      ...r,
      qty: round2(qty),
      net_sales_ex_tax: round2(net),
      profit: round2(profit),
      cogs: round2(cogs),
      uncosted_revenue: round2(Number(r.uncosted_revenue)),
      qty_per_day: round2(qty / days),
      profit_percent: cogs > 0.001 ? round2((100 * profit) / cogs) : null,
    };
  });
}

async function enrichProducts(
  supabase: Supabase,
  itemRows: Record<string, unknown>[],
) {
  const productIds = [
    ...new Set(
      itemRows
        .map((r) => r.product_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  if (productIds.length === 0) return;

  const { data: products } = await supabase
    .from("products")
    .select("id, name, image_url, brand_id, category_id")
    .in("id", productIds.slice(0, 500));

  const byId = new Map((products ?? []).map((p) => [p.id, p]));

  for (const row of itemRows) {
    const pid = row.product_id as string | undefined;
    if (!pid) continue;
    const p = byId.get(pid);
    if (!p) continue;
    row.image_url = p.image_url ?? null;
    if (p.name) row.product_name = p.name;
    row._brand_id = p.brand_id;
    row._category_id = p.category_id;
  }
}

async function buildBrandCategoryMix(
  supabase: Supabase,
  itemRows: Record<string, unknown>[],
) {
  const brandTotals = new Map<
    string,
    { brand_id: string; brand_name: string; image_url: string | null; net_sales_ex_tax: number }
  >();
  const categoryTotals = new Map<
    string,
    { category_id: string; category_name: string; image_url: string | null; net_sales_ex_tax: number }
  >();

  const brandIds = [
    ...new Set(
      itemRows
        .map((r) => r._brand_id as string | null | undefined)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const categoryIds = [
    ...new Set(
      itemRows
        .map((r) => r._category_id as string | null | undefined)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const brandMeta = new Map<string, { name: string; image_url: string | null }>();
  if (brandIds.length) {
    const { data } = await supabase
      .from("brands")
      .select("id, name, logo_url, image_url")
      .in("id", brandIds.slice(0, 200));
    for (const b of data ?? []) {
      brandMeta.set(b.id, { name: b.name ?? "Brand", image_url: b.logo_url ?? b.image_url ?? null });
    }
  }

  const categoryMeta = new Map<string, { name: string; image_url: string | null }>();
  if (categoryIds.length) {
    const { data } = await supabase
      .from("categories")
      .select("id, name, thumbnail_url, image_url")
      .in("id", categoryIds.slice(0, 200));
    for (const c of data ?? []) {
      categoryMeta.set(c.id, {
        name: c.name ?? "Category",
        image_url: c.thumbnail_url ?? c.image_url ?? null,
      });
    }
  }

  for (const row of itemRows) {
    const add = Number(row.net_sales_ex_tax ?? 0);
    const bid = row._brand_id as string | undefined;
    if (bid) {
      const meta = brandMeta.get(bid);
      const cur = brandTotals.get(bid) ?? {
        brand_id: bid,
        brand_name: meta?.name ?? "Brand",
        image_url: meta?.image_url ?? null,
        net_sales_ex_tax: 0,
      };
      cur.net_sales_ex_tax += add;
      brandTotals.set(bid, cur);
    }
    const cid = row._category_id as string | undefined;
    if (cid) {
      const meta = categoryMeta.get(cid);
      const cur = categoryTotals.get(cid) ?? {
        category_id: cid,
        category_name: meta?.name ?? "Category",
        image_url: meta?.image_url ?? null,
        net_sales_ex_tax: 0,
      };
      cur.net_sales_ex_tax += add;
      categoryTotals.set(cid, cur);
    }
  }

  const brandMix = [...brandTotals.values()].map((b) => ({
    ...b,
    net_sales_ex_tax: round2(b.net_sales_ex_tax),
  }));
  const categoryMix = [...categoryTotals.values()].map((c) => ({
    ...c,
    net_sales_ex_tax: round2(c.net_sales_ex_tax),
  }));

  return { brandMix, categoryMix };
}

async function loadCompositePerformanceDashboard(
  supabase: Supabase,
  params: {
    from: string;
    to: string;
    storeId: string;
    channel: ReportChannel;
    salesmanId: string | null;
    limit: number;
    days: number;
  },
) {
  const rpcBase = {
    p_date_from: params.from,
    p_date_to: params.to,
    p_store_id: params.storeId,
    p_channel: params.channel,
    p_salesman_id: params.salesmanId,
  };

  const [
    itemsRes,
    salesmenRes,
    customersRes,
    dailyRes,
    paymentsRes,
    custBalRes,
    vendBalRes,
    purchasesRes,
  ] = await Promise.all([
    rpcClient(supabase).rpc("get_erp_sales_by_item", rpcBase),
    rpcClient(supabase).rpc("get_erp_sales_by_salesman", rpcBase),
    rpcClient(supabase).rpc("get_erp_sales_by_customer", rpcBase),
    rpcClient(supabase).rpc("get_erp_daily_collection_report", {
      p_date_from: params.from,
      p_date_to: params.to,
      p_store_id: params.storeId,
    }),
    rpcClient(supabase).rpc("get_erp_payments_received_report", {
      p_date_from: params.from,
      p_date_to: params.to,
      p_store_id: params.storeId,
      p_salesman_id: params.salesmanId,
    }),
    rpcClient(supabase).rpc("get_erp_customer_balance_report", {
      p_store_id: params.storeId,
      p_search: null,
      p_salesman_id: params.salesmanId,
    }),
    rpcClient(supabase).rpc("get_erp_vendor_balance_report", {
      p_store_id: params.storeId,
      p_search: null,
    }),
    rpcClient(supabase).rpc("get_erp_purchase_by_vendor_report", {
      p_date_from: params.from,
      p_date_to: params.to,
      p_store_id: params.storeId,
    }),
  ]);

  const err =
    itemsRes.error ??
    salesmenRes.error ??
    customersRes.error ??
    dailyRes.error ??
    paymentsRes.error ??
    custBalRes.error ??
    vendBalRes.error ??
    purchasesRes.error;
  if (err) throw new Error(err.message);

  const itemRows = aggregateProductRows(asJsonRows(itemsRes.data), params.days);
  await enrichProducts(supabase, itemRows);
  const { brandMix, categoryMix } = await buildBrandCategoryMix(supabase, itemRows);

  const salesmenRaw = asJsonRows(salesmenRes.data);
  const salesmenRows = salesmenRaw.map((r) => ({
    salesman_id: r.salesman_id,
    salesman_name: r.salesman_name,
    total_sales: r.total_sales,
    collections: 0,
    collection_rate: 0,
  }));

  const customerRows = asJsonRows(customersRes.data).map((r) => ({
    user_id: r.customer_id,
    customer_name: r.customer_name,
    total_sales: r.sales_with_tax,
    net_sales_ex_tax: r.net_sales_value,
  }));

  const customerArRows = asJsonRows(custBalRes.data)
    .map((r) => ({
      user_id: r.customer_id,
      customer_name: r.customer_name,
      balance_due: r.total_receivable ?? r.balance_due ?? 0,
    }))
    .filter((r) => Number(r.balance_due) > 0.001);

  const vendorPurchaseRows = asJsonRows(purchasesRes.data).map((r) => ({
    vendor_id: r.vendor_id,
    vendor_name: r.vendor_name,
    purchase_total: r.total ?? r.bill_amount ?? 0,
  }));

  const vendorApRows = asJsonRows(vendBalRes.data)
    .map((r) => ({
      vendor_id: r.vendor_id,
      vendor_name: r.vendor_name,
      balance_due: r.balance_due ?? 0,
    }))
    .filter((r) => Number(r.balance_due) > 0.001);

  const dailyRows = asJsonRows(dailyRes.data);
  const salesTrend = dailyRows.map((d) => ({
    bucket: String(d.report_date ?? "").slice(0, 10),
    sales: round2(Number(d.net_total ?? 0)),
    collections: round2(Number(d.total_payment ?? 0)),
  }));

  const paymentsPayload =
    paymentsRes.data && typeof paymentsRes.data === "object" && !Array.isArray(paymentsRes.data)
      ? (paymentsRes.data as { payment_summary?: { total?: number } })
      : null;
  const collections = Number(paymentsPayload?.payment_summary?.total ?? 0);

  let netSalesExTax = 0;
  let salesInclTax = 0;
  let recognizedProfit = 0;
  let uncostedRevenue = 0;
  let invoiceCount = 0;
  for (const r of salesmenRaw) {
    netSalesExTax += Number(r.total_sales_without_tax ?? 0);
    salesInclTax += Number(r.total_sales ?? 0);
    recognizedProfit += Number(r.profit ?? 0);
    uncostedRevenue += Number(r.uncosted_revenue ?? 0);
    invoiceCount += Number(r.invoice_count ?? 0);
  }

  let arOutstanding = 0;
  for (const r of customerArRows) arOutstanding += Number(r.balance_due ?? 0);
  let apOutstanding = 0;
  for (const r of vendorApRows) apOutstanding += Number(r.balance_due ?? 0);

  const profitDen = netSalesExTax - uncostedRevenue;
  const profitPercent = profitDen > 0 ? round2((100 * recognizedProfit) / profitDen) : 0;
  const collectionRate = salesInclTax > 0 ? round2((100 * collections) / salesInclTax) : 0;

  const positiveItems = itemRows.filter((r) => Number(r.net_sales_ex_tax) > 0);
  const limit = params.limit;

  return {
    kpis: {
      net_sales_ex_tax: round2(netSalesExTax),
      sales_incl_tax: round2(salesInclTax),
      recognized_profit: round2(recognizedProfit),
      profit_percent: profitPercent,
      invoice_count: invoiceCount,
      collections: round2(collections),
      collection_rate: collectionRate,
      ar_outstanding: round2(arOutstanding),
      ap_outstanding: round2(apOutstanding),
      uncosted_revenue: round2(uncostedRevenue),
      period_days: params.days,
    },
    sales_trend: salesTrend,
    items: {
      top_by_sales: topN(positiveItems, "net_sales_ex_tax", limit),
      bottom_by_sales: topN(positiveItems, "net_sales_ex_tax", limit, false),
      top_by_qty: topN(
        itemRows.filter((r) => Number(r.qty) > 0),
        "qty",
        limit,
      ),
      top_by_profit_percent: topN(
        itemRows.filter((r) => r.profit_percent != null && Number(r.cogs) > 0),
        "profit_percent",
        limit,
      ),
      bottom_by_profit_percent: topN(
        itemRows.filter(
          (r) =>
            r.profit_percent != null &&
            Number(r.cogs) > 0 &&
            Number(r.net_sales_ex_tax) > 0,
        ),
        "profit_percent",
        limit,
        false,
      ),
    },
    salesmen: {
      top_by_sales: topN(
        salesmenRows.filter((r) => Number(r.total_sales) > 0),
        "total_sales",
        limit,
      ),
      bottom_by_sales: topN(
        salesmenRows.filter((r) => Number(r.total_sales) > 0),
        "total_sales",
        limit,
        false,
      ),
      top_by_collections: [],
      bottom_by_collection_rate: [],
    },
    brands: {
      mix: topN(brandMix, "net_sales_ex_tax", limit + 1),
      top_by_sales: topN(brandMix, "net_sales_ex_tax", limit),
      bottom_by_sales: topN(
        brandMix.filter((r) => Number(r.net_sales_ex_tax) > 0),
        "net_sales_ex_tax",
        limit,
        false,
      ),
    },
    categories: {
      mix: topN(categoryMix, "net_sales_ex_tax", limit + 1),
      top_by_sales: topN(categoryMix, "net_sales_ex_tax", limit),
      bottom_by_sales: topN(
        categoryMix.filter((r) => Number(r.net_sales_ex_tax) > 0),
        "net_sales_ex_tax",
        limit,
        false,
      ),
    },
    customers: {
      top_by_sales: topN(customerRows, "total_sales", limit),
      bottom_by_sales: topN(
        customerRows.filter((r) => Number(r.total_sales) > 0),
        "total_sales",
        limit,
        false,
      ),
      top_by_ar: topN(customerArRows, "balance_due", limit),
      fastest_payers: [],
      slowest_payers: [],
    },
    vendors: {
      top_by_purchases: topN(vendorPurchaseRows, "purchase_total", limit),
      bottom_by_purchases: topN(
        vendorPurchaseRows.filter((r) => Number(r.purchase_total) > 0),
        "purchase_total",
        limit,
        false,
      ),
      top_by_ap: topN(vendorApRows, "balance_due", limit),
      fastest_payers: [],
      slowest_payers: [],
    },
    meta: {
      date_from: params.from,
      date_to: params.to,
      period_days: params.days,
      weekly_trend: params.days > 90,
      limit,
      source: "composite_reports",
    },
  };
}

/** Performance dashboard: try single RPC, fall back to proven report RPCs. */
export async function loadPerformanceDashboard(
  supabase: Supabase,
  params: {
    from: string;
    to: string;
    storeId: string;
    channel: ReportChannel;
    salesmanId: string | null;
    limit?: number;
  },
) {
  const limit = params.limit ?? 8;
  const days = periodDaysInclusive(params.from, params.to);

  const mono = await rpcClient(supabase).rpc("get_erp_performance_dashboard", {
    p_date_from: params.from,
    p_date_to: params.to,
    p_store_id: params.storeId,
    p_channel: params.channel,
    p_salesman_id: params.salesmanId,
    p_limit: limit,
  });

  if (!mono.error && mono.data != null && typeof mono.data === "object") {
    return mono.data;
  }

  try {
    return await loadCompositePerformanceDashboard(supabase, {
      ...params,
      limit,
      days,
    });
  } catch (compositeErr) {
    const primary = mono.error?.message ?? "Performance dashboard RPC failed";
    const secondary =
      compositeErr instanceof Error ? compositeErr.message : "Composite reports failed";
    throw new Error(primary === secondary ? primary : `${primary}. ${secondary}`);
  }
}
