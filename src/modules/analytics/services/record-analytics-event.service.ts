import "server-only";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

/** Record first product view for the signed-in customer. Returns true only on new reach. */
export async function recordProductView(input: {
  productId: string;
  variantId?: string | null;
}): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_product_view", {
    p_product_id: input.productId,
    p_variant_id: input.variantId ?? undefined,
  });

  if (error) {
    console.error("record_product_view failed", error.message);
    return false;
  }

  return Boolean(data);
}

/** PK lookup — did this customer see the product? */
export async function customerHasViewedProduct(
  userId: string,
  productId: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("customer_has_viewed_product", {
    p_user_id: userId,
    p_product_id: productId,
  });

  if (error) {
    console.error("customer_has_viewed_product failed", error.message);
    return false;
  }

  return Boolean(data);
}
