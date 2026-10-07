function formatInvoiceDatePart(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shortOrderRef(id: string): string {
  return id.split("-")[0]?.toUpperCase() ?? id.slice(0, 8).toUpperCase();
}

export function shortPurchaseOrderRef(id: string): string {
  return id.split("-")[0]?.toUpperCase() ?? id.slice(0, 8).toUpperCase();
}

export function buildOrderInvoiceFilename(order: {
  id: string;
  created_at?: string | null;
}): string {
  const ref = shortOrderRef(order.id);
  const datePart = formatInvoiceDatePart(order.created_at);
  return `DHOOM-Order-Invoice-${ref}-${datePart}.pdf`;
}

export function buildPurchaseOrderInvoiceFilename(po: {
  id: string;
  created_at?: string | null;
}): string {
  const ref = shortPurchaseOrderRef(po.id);
  const datePart = formatInvoiceDatePart(po.created_at);
  return `DHOOM-PO-Invoice-${ref}-${datePart}.pdf`;
}
