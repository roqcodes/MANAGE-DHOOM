import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { MinusStockDetailPayload } from "@/common/erp/inventory-types";
import { requireErpStoreId } from "@/modules/erp/services/store-context.service";

export async function getMinusStockDetail(
  storeId: string | null | undefined,
  productId: string,
): Promise<MinusStockDetailPayload> {
  await requireAdminOrManagerProfile();
  const activeStoreId = await requireErpStoreId(storeId);
  const trimmedProduct = productId?.trim();
  if (!trimmedProduct) {
    throw new Error("Product is required");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await (
    supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;
    }
  ).rpc("get_erp_minus_stock_detail", {
    p_store_id: activeStoreId,
    p_product_id: trimmedProduct,
  });

  if (error) throw new Error(error.message);
  return data as unknown as MinusStockDetailPayload;
}
