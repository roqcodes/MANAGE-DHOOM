import "server-only";

import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

export interface CartItem {
  id: string;
  cart_id: string;
  variant_id: string;
  quantity: number;
  added_at: string;
  product: {
    id: string;
    name: string | null;
    image_url: string | null;
  };
  variant: {
    id: string;
    name: string | null;
    price: number | null;
    mrp: number | null;
  };
}

export interface Cart {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  items: CartItem[];
}

export interface CartItemResponse {
  id: string;
  cart_id: string;
  variant_id: string;
  quantity: number;
}

/**
 * Get or create cart for current user.
 * Returns cart ID.
 */
export async function getOrCreateCart(): Promise<string> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_or_create_cart", {
    p_user_id: user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as string;
}

/**
 * Get full cart with items and product details for current user.
 * Returns null if cart doesn't exist.
 */
export async function getCart(): Promise<Cart | null> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_cart_with_items", {
    p_user_id: user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return data as unknown as Cart;
}

/**
 * Add item to cart (or increase quantity if exists).
 * Returns the cart item.
 */
export async function addToCart(
  variantId: string,
  quantity: number = 1,
): Promise<CartItemResponse> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  if (quantity <= 0) {
    throw new Error("Quantity must be greater than 0");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("add_to_cart", {
    p_user_id: user.id,
    p_variant_id: variantId,
    p_quantity: quantity,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as CartItemResponse;
}

/**
 * Update cart item quantity.
 * If quantity <= 0, item is removed.
 * Returns the updated cart item or null if removed.
 */
export async function updateCartItem(
  variantId: string,
  quantity: number,
): Promise<CartItemResponse | null> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("update_cart_item", {
    p_user_id: user.id,
    p_variant_id: variantId,
    p_quantity: quantity,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as CartItemResponse | null;
}

/**
 * Remove item from cart.
 * Returns true if removed, false if cart/item not found.
 */
export async function removeFromCart(variantId: string): Promise<boolean> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("remove_from_cart", {
    p_user_id: user.id,
    p_variant_id: variantId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as boolean;
}

/**
 * Clear entire cart.
 * Returns true if cleared, false if cart not found.
 */
export async function clearCart(): Promise<boolean> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("clear_cart", {
    p_user_id: user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as boolean;
}

/**
 * Get cart item count for current user.
 */
export async function getCartItemCount(): Promise<number> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    return 0;
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("cart_items")
    .select("quantity", { count: "exact", head: false })
    .eq(
      "cart_id",
      (
        await supabase
          .from("carts")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle()
      ).data?.id || "",
    );

  if (error) {
    return 0;
  }

  return (data ?? []).reduce((sum, item) => sum + (item.quantity || 0), 0);
}
