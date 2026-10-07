import "server-only";

import { requireAdminOnlyProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

export async function deleteVendorProductsForVariant(
  variantId: string,
): Promise<void> {
  await requireAdminOnlyProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("vendor_products")
    .delete()
    .eq("variant_id", variantId);
  if (error) throw new Error(error.message);
}
