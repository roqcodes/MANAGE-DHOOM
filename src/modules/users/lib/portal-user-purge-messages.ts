const PURGE_REASON_MESSAGES: Record<string, string> = {
  cannot_delete_self: "You cannot delete your own account.",
  not_found: "User not found.",
  audit_logs: "This user has audit log entries.",
  erp_sync_operations: "This user has ERP sync / offline operation history.",
  store_orders: "This user has storefront orders.",
  customer_invoices: "This user is linked to customer invoices.",
  sales_invoices: "This user appears on invoices as sales person.",
  return_requests: "This user has return requests.",
  storefront_customer_phone: "Storefront customer phone — use purge after clearing activity or use another account.",
  saved_addresses: "This user has saved addresses.",
  wallet_transactions: "This user has wallet transactions.",
  journal_entries: "This user created journal entries.",
  purchase_bills: "This user created purchase bills.",
  vendor_purchase_history: "This vendor account has purchase history.",
};

export function formatPortalUserPurgeReason(reason: string | null | undefined): string {
  if (!reason) {
    return "This user has recorded activity and cannot be permanently deleted.";
  }
  return PURGE_REASON_MESSAGES[reason] ?? `Blocked: ${reason.replace(/_/g, " ")}`;
}
