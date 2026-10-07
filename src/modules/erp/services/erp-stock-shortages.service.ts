import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { requireErpStoreId } from "@/modules/erp/services/store-context.service";
import type { StoreStockShortageRow } from "@/common/erp/stock-shortage-types";

export async function listStoreStockShortages(
  storeId?: string | null,
): Promise<StoreStockShortageRow[]> {
  await requireAdminOrManagerProfile();
  const activeStoreId = await requireErpStoreId(storeId);
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_store_stock_shortages", {
    p_store_id: activeStoreId,
  });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    productId: row.product_id as string,
    productName: String(row.product_name ?? "Product"),
    stock: Number(row.stock ?? 0),
    suggestedQty: Number(row.suggested_qty ?? 0),
  }));
}
