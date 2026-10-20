import { duplicateMasterNameError } from "@/lib/erp/master-name-messages";

const UNIQUE_INDEX_ENTITY: Record<string, string> = {
  vendors_name_ci_unique_idx: "vendor",
  products_name_ci_unique_idx: "product",
  brands_name_ci_unique_idx: "brand",
  stores_name_ci_unique_idx: "store",
  users_customer_company_name_ci_unique_idx: "customer",
  categories_name_parent_ci_unique_idx: "category",
  product_variants_name_product_ci_unique_idx: "variant",
  variant_groups_name_product_ci_unique_idx: "variant group",
  erp_employees_full_name_ci_unique_idx: "employee",
  accounts_name_ci_unique_idx: "account",
  account_types_category_name_ci_unique_idx: "account type",
};

function mapDuplicateNameFromDatabase(msg: string): string | null {
  const lower = msg.toLowerCase();
  for (const [indexName, entity] of Object.entries(UNIQUE_INDEX_ENTITY)) {
    if (lower.includes(indexName.toLowerCase())) {
      return duplicateMasterNameError(entity);
    }
  }
  if (
    lower.includes("an employee with this name already exists") ||
    lower.includes("an account with this name already exists")
  ) {
    return msg.length <= 200 ? msg : duplicateMasterNameError("account");
  }
  if (lower.includes("with this name already exists") || lower.includes("this name is already in use")) {
    return msg.length <= 200 ? msg : "This name is already in use. Choose a different name.";
  }
  return null;
}

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
    msg.includes("Cannot delete") ||
    msg.includes("can't be undone") ||
    msg.includes("cannot be updated") ||
    msg.includes("cannot be deleted") ||
    msg.includes("opening balance") ||
    msg.includes("walk-in customer") ||
    msg.includes("Credit limit cannot be less than") ||
    msg.includes("Customer credit limit exceeded") ||
    msg.includes("over the customer's available credit") ||
    msg.includes("Reduce the invoice total or raise")
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

  const duplicateName = mapDuplicateNameFromDatabase(msg);
  if (duplicateName) return duplicateName;

  if (
    lower.includes("duplicate key") ||
    lower.includes("unique constraint") ||
    (lower.includes("already exists") && !lower.includes("invoice"))
  ) {
    return "This name is already in use. Choose a different name.";
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
    if (lower.includes("customer_credit_limits")) {
      return "Could not save credit limit (database access). Apply latest Supabase migrations or contact support.";
    }
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
