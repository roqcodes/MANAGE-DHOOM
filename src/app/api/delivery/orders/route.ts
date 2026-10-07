import { NextResponse } from "next/server";

import { requireDeliveryApiProfile } from "@/lib/api/delivery-api-auth";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

export async function GET() {
  const auth = await requireDeliveryApiProfile();
  if (!auth.ok) return auth.response;

  const supabase = await createSupabaseServerClient();

  try {
    const { data: orders, error } = await supabase
      .from("orders")
      .select(`
        id,
        order_number,
        status,
        total_amount,
        created_at,
        shipping_address:addresses (
          line1,
          line2,
          city,
          state,
          pincode,
          phone
        ),
        order_items:order_items (
          id,
          quantity,
          product:products (
            id,
            name,
            image_url
          ),
          variant:product_variants (
            id,
            name,
            price
          )
        )
      `)
      .eq("delivery_user_id", auth.user.id)
      .in("status", ["confirmed", "processing", "shipped"])
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      orders: orders || [],
      count: orders?.length || 0,
    });
  } catch (error) {
    console.error("Error fetching delivery orders:", error);
    return NextResponse.json(
      { error: "Failed to fetch delivery orders" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireDeliveryApiProfile();
  if (!auth.ok) return auth.response;

  const supabase = await createSupabaseServerClient();

  try {
    const body = await request.json();

    if (!body.orderId || typeof body.orderId !== "string") {
      return NextResponse.json(
        { error: "orderId is required" },
        { status: 400 },
      );
    }

    if (!body.status || !["shipped", "delivered"].includes(body.status)) {
      return NextResponse.json(
        { error: "status must be 'shipped' or 'delivered'" },
        { status: 400 },
      );
    }

    // Verify order is assigned to this delivery user
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, delivery_user_id, status")
      .eq("id", body.orderId)
      .single();

    if (fetchError) throw fetchError;

    if (!order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 },
      );
    }

    if (order.delivery_user_id !== auth.user.id) {
      return NextResponse.json(
        { error: "Order not assigned to you" },
        { status: 403 },
      );
    }

    // Update order status
    const { error: updateError } = await supabase
      .from("orders")
      .update({ status: body.status })
      .eq("id", body.orderId);

    if (updateError) throw updateError;

    return NextResponse.json({
      ok: true,
      orderId: body.orderId,
      newStatus: body.status,
      message: `Order marked as ${body.status}`,
    });
  } catch (error) {
    console.error("Error updating delivery order:", error);
    return NextResponse.json(
      { error: "Failed to update order status" },
      { status: 500 },
    );
  }
}
