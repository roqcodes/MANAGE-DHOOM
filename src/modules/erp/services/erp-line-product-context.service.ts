import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { LineProductContextMap } from "@/common/erp/line-product-context";
import {
  mapLineProductContextRpcRows,
  type LineProductContextRpcRow,
} from "@/modules/erp/lib/line-product-context-map";
import { resolveErpStoreId } from "@/modules/erp/services/store-context.service";

/** Context panel data for purchase/sales line items (per product). */
export async function getLineProductContext(input: {
  storeId?: string;
  productIds: string[];
  customerId?: string;
  vendorId?: string;
}): Promise<LineProductContextMap> {
  await requireAdminOrManagerProfile();
  const productIds = [...new Set(input.productIds.filter(Boolean))];
  if (productIds.length === 0) return {};

  const storeId = await resolveErpStoreId(input.storeId);
  if (!storeId) return {};

  const supabase = await createSupabaseServerClient();

  const { data, error } = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)(
    "erp_line_product_context",
    {
      p_store_id: storeId,
      p_product_ids: productIds,
      p_vendor_id: input.vendorId ?? null,
      p_customer_id: input.customerId ?? null,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return mapLineProductContextRpcRows(
    (data ?? []) as LineProductContextRpcRow[],
    productIds,
  );
}
