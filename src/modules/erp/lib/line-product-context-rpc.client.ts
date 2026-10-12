"use client";

import type { LineProductContextMap } from "@/common/erp/line-product-context";
import { mapLineProductContextRpcRows, type LineProductContextRpcRow } from "@/modules/erp/lib/line-product-context-map";
import { tryCreateSupabaseBrowserClient } from "@/lib/integrations/supabase/client";

/** Browser → Supabase RPC (skips Next.js API hop). */
export async function rpcLineProductContext(
  input: {
    storeId: string;
    productIds: string[];
    vendorId?: string;
    customerId?: string;
  },
): Promise<LineProductContextMap | null> {
  const supabase = tryCreateSupabaseBrowserClient();
  if (!supabase || input.productIds.length === 0) return null;

  const { data, error } = await (supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("erp_line_product_context", {
    p_store_id: input.storeId,
    p_product_ids: input.productIds,
    p_vendor_id: input.vendorId ?? null,
    p_customer_id: input.customerId ?? null,
  });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[line-product-context] RPC:", error.message);
    }
    return null;
  }

  return mapLineProductContextRpcRows(
    (data ?? []) as LineProductContextRpcRow[],
    input.productIds,
  );
}
