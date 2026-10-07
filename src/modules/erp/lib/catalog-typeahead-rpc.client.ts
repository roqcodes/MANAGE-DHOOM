"use client";

import type { ErpProductSearchRow } from "@/common/erp/purchasing-types";
import type { ErpSalesProductSearchRow } from "@/common/erp/sales-types";
import { tryCreateSupabaseBrowserClient } from "@/lib/integrations/supabase/client";

const PICKER_LIMIT = 20;

type CatalogRpcRow = {
  id: string;
  name: string | null;
  barcode: string | null;
  price: number | null;
  purchase_price: number | null;
  tax_rate_percent: number | null;
  available_stock: number | null;
  sales_price: number | null;
};

type CustomerRpcRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  customer_number: string | null;
};

type VendorRpcRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  contact: string | null;
  trn: string | null;
};

function mapCatalogToSalesRow(row: CatalogRpcRow): ErpSalesProductSearchRow {
  return {
    id: row.id,
    product_name: row.name ?? "Product",
    barcode: row.barcode,
    sales_price: row.sales_price ?? (row.price != null ? Number(row.price) : null),
    purchase_price: row.purchase_price != null ? Number(row.purchase_price) : null,
    tax_rate_percent: row.tax_rate_percent != null ? Number(row.tax_rate_percent) : null,
    available_stock: Number(row.available_stock ?? 0),
  };
}

function mapCatalogToPurchaseRow(row: CatalogRpcRow): ErpProductSearchRow {
  return {
    id: row.id,
    product_name: row.name ?? "Product",
    barcode: row.barcode,
    purchase_price: row.purchase_price != null ? Number(row.purchase_price) : null,
    tax_rate_percent: row.tax_rate_percent != null ? Number(row.tax_rate_percent) : null,
  };
}

/** Browser → Supabase RPC (skips Next.js API hop). Falls back when RPC is unavailable. */
export async function rpcSearchSalesCatalog(
  query: string,
  storeId?: string,
): Promise<ErpSalesProductSearchRow[] | null> {
  const supabase = tryCreateSupabaseBrowserClient();
  if (!supabase) return null;
  const { data, error } = await (supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("erp_search_catalog_products", {
    p_query: query.trim(),
    p_store_id: storeId ?? null,
    p_limit: PICKER_LIMIT,
  });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[catalog-typeahead] sales RPC:", error.message);
    }
    return null;
  }

  return ((data ?? []) as CatalogRpcRow[]).map(mapCatalogToSalesRow);
}

export async function rpcSearchPurchaseCatalog(
  query: string,
): Promise<ErpProductSearchRow[] | null> {
  const supabase = tryCreateSupabaseBrowserClient();
  if (!supabase) return null;
  const { data, error } = await (supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("erp_search_catalog_products", {
    p_query: query.trim(),
    p_store_id: null,
    p_limit: PICKER_LIMIT,
  });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[catalog-typeahead] purchase RPC:", error.message);
    }
    return null;
  }

  return ((data ?? []) as CatalogRpcRow[]).map(mapCatalogToPurchaseRow);
}

export async function rpcSearchCustomers(
  query: string,
): Promise<CustomerRpcRow[] | null> {
  const supabase = tryCreateSupabaseBrowserClient();
  if (!supabase) return null;
  const { data, error } = await (supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("erp_search_customers", {
    p_query: query.trim(),
    p_limit: PICKER_LIMIT,
  });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[catalog-typeahead] customer RPC:", error.message);
    }
    return null;
  }

  return (data ?? []) as CustomerRpcRow[];
}

export async function rpcSearchVendors(
  query: string,
): Promise<VendorRpcRow[] | null> {
  const supabase = tryCreateSupabaseBrowserClient();
  if (!supabase) return null;
  const { data, error } = await (supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("erp_search_vendors", {
    p_query: query.trim(),
    p_limit: PICKER_LIMIT,
  });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[catalog-typeahead] vendor RPC:", error.message);
    }
    return null;
  }

  return (data ?? []) as VendorRpcRow[];
}
