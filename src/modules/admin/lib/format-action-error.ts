/**
 * Maps thrown errors (server actions, Supabase, network) to short user-facing text.
 */
export function formatActionError(error: unknown): string {
  if (error == null) return "Something went wrong. Try again.";

  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error);
  const msg = raw.trim();
  if (!msg) return "Something went wrong. Try again.";

  const lower = msg.toLowerCase();

  // Curated business messages from services — keep as-is when already short.
  if (
    msg.startsWith("Cannot delete") ||
    msg.startsWith("Cannot delete product") ||
    msg.includes("can't be undone") ||
    msg.includes("cannot be updated") ||
    msg.includes("cannot be deleted")
  ) {
    return msg.length <= 140 ? msg : msg.slice(0, 137) + "…";
  }

  if (lower.includes("category that has products")) {
    return "Category has products — reassign or delete them first.";
  }
  if (lower.includes("brand that has products")) {
    return "Brand has products — reassign or delete them first.";
  }
  if (lower.includes("vendor while vendor_products")) {
    return "Vendor still has catalog SKUs linked.";
  }
  if (lower.includes("variants exist")) {
    return "Remove all variants before deleting this product.";
  }

  if (
    lower.includes("unauthorized") ||
    lower.includes("jwt expired") ||
    lower.includes("invalid jwt") ||
    lower.includes("session")
  ) {
    if (lower.includes("admin only")) return "Admin access required.";
    return "Session expired. Sign in again.";
  }

  if (
    lower.includes("foreign key") ||
    lower.includes("still referenced") ||
    (lower.includes("violates") && lower.includes("constraint"))
  ) {
    if (lower.includes("order")) return "Linked to orders — can't remove.";
    if (lower.includes("purchase")) return "Linked to purchase orders — can't remove.";
    return "Linked to other records — can't remove.";
  }

  if (
    lower.includes("duplicate key") ||
    lower.includes("unique constraint") ||
    lower.includes("already exists")
  ) {
    return "This already exists.";
  }

  if (
    lower.includes("not found") ||
    lower.includes("0 rows") ||
    lower.includes("does not exist")
  ) {
    return "Not found. It may have been removed.";
  }

  if (
    lower.includes("permission denied") ||
    lower.includes("row-level security") ||
    lower.includes("rls policy")
  ) {
    return "You don't have permission for this.";
  }

  if (
    lower.includes("failed to fetch") ||
    lower.includes("network error") ||
    lower.includes("load failed") ||
    lower.includes("timeout") ||
    lower.includes("timed out")
  ) {
    return "Connection failed. Check network and try again.";
  }

  if (lower.includes("invalid input") || lower.includes("validation")) {
    return "Check your input and try again.";
  }

  if (msg.length > 120) {
    return "Something went wrong. Try again or contact support.";
  }

  return msg;
}
