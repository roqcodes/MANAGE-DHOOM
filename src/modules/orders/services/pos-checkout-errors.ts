import "server-only";

/** Map database/RPC errors to cashier-friendly copy (no backend jargon). */
export function mapPosCheckoutUserMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Something went wrong. No changes were made.";

  const msg = raw.toLowerCase();

  if (
    msg.includes("pos_stock_unavailable") ||
    msg.includes("insufficient stock") ||
    msg.includes("not enough stock") ||
    msg.includes("no longer available")
  ) {
    return "Some items are no longer available.";
  }

  if (msg.includes("forbidden") || msg.includes("unauthorized")) {
    return "You don't have permission to complete this sale.";
  }

  if (msg.includes("valid list price") || msg.includes("selling price")) {
    return "One of the items can't be sold until its price is set.";
  }

  if (msg.includes("variant or product not found")) {
    return "Some items are no longer available.";
  }

  if (msg.includes("idempotency key is required")) {
    return "This sale couldn't be completed. Please try again.";
  }

  if (msg.includes("pos_checkout_invalid") || msg.includes("invalid request")) {
    return "This sale couldn't be completed. Please check the cart and try again.";
  }

  if (msg.includes("lock timeout") || msg.includes("deadlock")) {
    return "The register is busy. Please try again in a moment.";
  }

  return "This sale couldn't be completed. Please try again.";
}
