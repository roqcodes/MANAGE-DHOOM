/** Admin routes that render a print-focused document (minimal chrome in shell). */
export function isAdminInvoicePrintPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    /^\/admin\/orders\/[^/]+\/invoice\/?$/.test(pathname) ||
    /^\/admin\/purchase-orders\/[^/]+\/invoice\/?$/.test(pathname) ||
    /^\/admin\/erp\/invoices\/[^/]+\/print\/?$/.test(pathname) ||
    /^\/admin\/erp\/estimates\/[^/]+\/print\/?$/.test(pathname) ||
    /^\/admin\/erp\/credit-notes\/[^/]+\/print\/?$/.test(pathname) ||
    /^\/admin\/erp\/payments\/[^/]+\/print\/?$/.test(pathname) ||
    /^\/admin\/erp\/purchase-bills\/[^/]+\/print\/?$/.test(pathname)
  );
}
