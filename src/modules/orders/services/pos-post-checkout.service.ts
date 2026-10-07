import "server-only";

import { notifyOrderStatusChange } from "@/modules/admin/services/push-notifications.service";

/** Non-critical work after a committed POS sale (must not affect sale correctness). */
export async function runPosPostCheckoutSideEffects(orderId: string): Promise<void> {
  await notifyOrderStatusChange(orderId, "delivered");
}

export function logPosCheckoutCommitted(input: {
  orderId: string;
  storeId: string;
  actorId: string;
  idempotentReplay: boolean;
}): void {
  console.info(
    JSON.stringify({
      event: "pos_checkout_committed",
      orderId: input.orderId,
      storeId: input.storeId,
      actorId: input.actorId,
      idempotentReplay: input.idempotentReplay,
    }),
  );
}

export function logPosPostCheckoutFailure(orderId: string, error: unknown): void {
  const message = error instanceof Error ? error.message : "unknown";
  console.error(
    JSON.stringify({
      event: "pos_post_checkout_failed",
      orderId,
      message,
    }),
  );
}
