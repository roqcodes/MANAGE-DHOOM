import "server-only";

import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { invokeRpc } from "@/lib/integrations/supabase/rpc";
import { getCart } from "@/modules/cart/services/cart.service";
import { buildOrderItemSnapshots } from "@/modules/orders/services/order-item-pricing.service";
import { commitOrderInventory } from "@/modules/orders/services/order-wallet-inventory.service";
import { clearCart } from "@/modules/cart/services/cart.service";

export interface CreateOrderInput {
  addressId: string;
}

export interface CreateOrderResult {
  orderId: string;
  orderNumber: string;
  totalAmount: number;
  itemCount: number;
  items: {
    variantId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    vendorId: string;
  }[];
}

export interface OrderLineItem {
  productId: string;
  variantId: string;
  quantity: number;
  vendorId: string;
  basePrice: number;
  finalPrice: number;
  marginAmount: number;
  productName: string;
}

/**
 * Create order from current user's cart.
 *
 * Flow:
 * 1. Get user's cart with items
 * 2. Validate cart has items
 * 3. Validate address exists and belongs to user
 * 4. For each cart item:
 *    - Check central warehouse stock
 *    - Charge SKU list price (reference vendor cost stored for margin reports)
 *    - Build order item snapshot
 * 5. Create order record
 * 6. Create order_items records
 * 7. Reserve inventory stock (physical deduct on ship)
 * 8. Clear cart
 * 9. Return order confirmation
 */
export async function createOrderFromCart(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  // Step 1: Get user's cart with items
  const cart = await getCart();
  if (!cart || cart.items.length === 0) {
    throw new Error("Cart is empty");
  }

  // Step 2: Validate address exists and belongs to user
  const { data: address, error: addressError } = await supabase
    .from("addresses")
    .select("id")
    .eq("id", input.addressId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (addressError) {
    throw new Error(addressError.message);
  }

  if (!address) {
    throw new Error("Address not found or does not belong to user");
  }

  // Step 3: Build order line items with pricing
  const qtyByVariant = new Map<string, number>();
  for (const cartItem of cart.items) {
    qtyByVariant.set(
      cartItem.variant_id,
      (qtyByVariant.get(cartItem.variant_id) ?? 0) + cartItem.quantity,
    );
  }
  const snapshots = await buildOrderItemSnapshots(
    [...qtyByVariant.entries()].map(([variantId, quantity]) => ({
      variantId,
      quantity,
    })),
  );

  const orderLineItems: OrderLineItem[] = [];

  for (const cartItem of cart.items) {
    try {
      const snapshot = snapshots.get(cartItem.variant_id);
      if (!snapshot) throw new Error("Variant or product not found.");

      orderLineItems.push({
        productId: snapshot.product_id,
        variantId: cartItem.variant_id,
        quantity: cartItem.quantity,
        vendorId: snapshot.vendor_id ?? "",
        basePrice: snapshot.base_price,
        finalPrice: snapshot.final_price,
        marginAmount: snapshot.margin_amount,
        productName: snapshot.product_name,
      });
    } catch (error) {
      throw new Error(
        `Failed to process item "${cartItem.product?.name || `Variant ${cartItem.variant_id}`}" - ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  // Step 4: Calculate total amount
  const totalAmount = orderLineItems.reduce(
    (sum, item) => sum + item.finalPrice * item.quantity,
    0,
  );

  // Step 5: Create order record (in transaction)
  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .insert({
      user_id: user.id,
      address_id: input.addressId,
      total_amount: totalAmount,
      status: "pending",
      payment_status: "pending",
      source: "online",
    })
    .select("id")
    .single();

  if (orderError) {
    throw new Error(orderError.message);
  }

  const orderId = orderData.id;
  const orderNumber = `ORD-${orderId.slice(0, 8).toUpperCase()}`;

  // Step 6: Create order_items records
  const orderItemsInsert = orderLineItems.map((item) => ({
    order_id: orderId,
    product_id: item.productId,
    variant_id: item.variantId,
    quantity: item.quantity,
    price: item.finalPrice,
    vendor_id: item.vendorId || null,
    base_price: item.basePrice,
    final_price: item.finalPrice,
    margin_amount: item.marginAmount,
    product_name: item.productName,
  }));

  const { error: itemsError } = await supabase
    .from("order_items")
    .insert(orderItemsInsert);

  if (itemsError) {
    // Rollback: delete the order
    await supabase.from("orders").delete().eq("id", orderId);
    throw new Error(itemsError.message);
  }

  // Step 7: Reserve inventory across eligible stores
  try {
    await commitOrderInventory(orderId);
  } catch (invErr) {
    await supabase.from("order_items").delete().eq("order_id", orderId);
    await supabase.from("orders").delete().eq("id", orderId);
    throw invErr instanceof Error ? invErr : new Error("Failed to update inventory");
  }

  // Step 8: Clear cart
  await clearCart();

  // Step 9: Return order confirmation
  return {
    orderId,
    orderNumber,
    totalAmount,
    itemCount: orderLineItems.reduce((sum, item) => sum + item.quantity, 0),
    items: orderLineItems.map((item) => ({
      variantId: item.variantId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.finalPrice,
      totalPrice: item.finalPrice * item.quantity,
      vendorId: item.vendorId,
    })),
  };
}

/**
 * Check if cart items are available across active stores (stock minus reserved).
 */
export async function checkCartAvailability(): Promise<{
  available: boolean;
  items: {
    variantId: string;
    productName: string;
    quantity: number;
    available: boolean;
    reason?: string;
  }[];
}> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const cart = await getCart();
  if (!cart || cart.items.length === 0) {
    return { available: true, items: [] };
  }

  const supabase = await createSupabaseServerClient();
  const items: {
    variantId: string;
    productName: string;
    quantity: number;
    available: boolean;
    reason?: string;
  }[] = [];

  const variantIds = cart.items.map((c) => c.variant_id);
  const { data: stockRows, error: availErr } = await invokeRpc(
    supabase,
    "get_variants_online_available",
    { p_variant_ids: variantIds },
  );
  if (availErr) {
    for (const cartItem of cart.items) {
      const { data: availableStock, error: oneErr } = await invokeRpc(
        supabase,
        "get_variant_online_available",
        { p_variant_id: cartItem.variant_id },
      );
      if (oneErr) throw new Error(oneErr.message);
      const onlineStock = Math.max(0, Math.floor(Number(availableStock ?? 0)));
      items.push({
        variantId: cartItem.variant_id,
        productName: cartItem.product?.name ?? "Unknown Product",
        quantity: cartItem.quantity,
        available: onlineStock >= cartItem.quantity,
        reason:
          onlineStock === 0
            ? "Out of stock"
            : onlineStock < cartItem.quantity
              ? `Only ${onlineStock} available (requested ${cartItem.quantity})`
              : undefined,
      });
    }
    const allAvailable = items.every((item) => item.available);
    return { available: allAvailable, items };
  }

  const stockByVariant = new Map<string, number>();
  for (const row of (stockRows ?? []) as { variant_id: string; available: number }[]) {
    stockByVariant.set(
      row.variant_id,
      Math.max(0, Math.floor(Number(row.available ?? 0))),
    );
  }

  for (const cartItem of cart.items) {
    const onlineStock = stockByVariant.get(cartItem.variant_id) ?? 0;

    items.push({
      variantId: cartItem.variant_id,
      productName: cartItem.product?.name ?? "Unknown Product",
      quantity: cartItem.quantity,
      available: onlineStock >= cartItem.quantity,
      reason:
        onlineStock === 0
          ? "Out of stock"
          : onlineStock < cartItem.quantity
            ? `Only ${onlineStock} available (requested ${cartItem.quantity})`
            : undefined,
    });
  }

  const allAvailable = items.every((item) => item.available);

  return { available: allAvailable, items };
}
