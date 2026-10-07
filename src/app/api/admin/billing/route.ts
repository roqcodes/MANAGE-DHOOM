import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { createManualOrder } from "@/modules/orders/services/create-manual-order.service";
import {
  logPosPostCheckoutFailure,
  runPosPostCheckoutSideEffects,
} from "@/modules/orders/services/pos-post-checkout.service";

const createManualOrderSchema = z.object({
  idempotencyKey: z.string().uuid(),
  userId: z.string().uuid().optional(),
  customerName: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  gstNumber: z.string().optional(),
  subtotal: z.number().min(0),
  tax: z.number().min(0),
  discount: z.number().min(0),
  totalAmount: z.number().min(0),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.number().min(1),
        unitPrice: z.number().min(0).optional(),
      })
    )
    .min(1),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApiProfile();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const result = createManualOrderSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "This sale couldn't be completed. Please check the cart and try again." },
        { status: 400 },
      );
    }

    const orderData = await createManualOrder(result.data);

    if (!orderData.idempotentReplay) {
      after(async () => {
        try {
          await runPosPostCheckoutSideEffects(orderData.orderId);
        } catch (err) {
          logPosPostCheckoutFailure(orderData.orderId, err);
        }
      });
    }

    return NextResponse.json(orderData, { status: 201 });
  } catch (error) {
    console.error("Failed to create manual order:", error);
    const message =
      error instanceof Error ? error.message : "Something went wrong. No changes were made.";
    const status = message.includes("permission") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
