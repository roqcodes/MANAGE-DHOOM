import { format } from "date-fns";

import type { AdminPurchaseOrderDetail } from "@/common/admin/types";
import { formatCurrency } from "@/lib/format-currency";
import {
  InvoicePrintFooter,
  InvoicePrintHeader,
  InvoicePrintLineTable,
  InvoicePrintParties,
  InvoicePrintRoot,
  InvoicePrintTotals,
} from "@/modules/documents/invoice-print-primitives";

function formatMoney(n: number | null) {
  if (n == null) return "—";
  return formatCurrency(n, { minimumFractionDigits: 2 });
}

function shortPoRef(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function lineTotal(qty: number | null, price: number | null) {
  if (qty == null || price == null) return null;
  return qty * price;
}

export function PurchaseOrderInvoiceDocument({
  po,
}: {
  po: AdminPurchaseOrderDetail;
}) {
  const placed = po.created_at
    ? format(new Date(po.created_at), "MMMM d, yyyy · h:mm a")
    : "—";
  const vendor = po.vendors;
  const items = po.purchase_order_items ?? [];

  const metaRows = [
    { label: "PO date", value: placed },
    { label: "Status", value: (po.status ?? "—").replace(/_/g, " ") },
  ];

  return (
    <InvoicePrintRoot kind="purchase">
      <InvoicePrintHeader
        title="Purchase order"
        documentNumber={`PO-${shortPoRef(po.id)}`}
        status={po.status}
        metaRows={metaRows}
      />

      <InvoicePrintParties
        left={{
          title: "Buyer",
          lines: ["DHOOM Trading", "Procurement / stores"],
        }}
        right={{
          title: "Vendor / supplier",
          lines: [
            vendor?.name?.trim() ?? "—",
            ...(vendor?.contact ? [vendor.contact] : []),
            ...(vendor?.id ? [`Vendor ID: ${vendor.id.slice(0, 8)}…`] : []),
          ],
        }}
      />

      <InvoicePrintLineTable
        columns={[
          { key: "item", label: "Item" },
          { key: "qty", label: "Qty", align: "right", width: "56px" },
          { key: "unit", label: "Unit cost", align: "right", width: "80px" },
          { key: "line", label: "Line total", align: "right", width: "88px" },
        ]}
        rows={
          items.length === 0
            ? [{ item: "No line items", qty: "—", unit: "—", line: "—" }]
            : items.map((line) => {
                const pv = line.product_variants;
                const productName = pv?.products?.name ?? "—";
                const variantName = pv?.name ?? "—";
                const lt = lineTotal(line.quantity, line.price);
                return {
                  item: (
                    <>
                      <span className="font-medium">{productName}</span>
                      <span className="block text-[11px] text-slate-500">{variantName}</span>
                    </>
                  ),
                  qty: line.quantity ?? "—",
                  unit: formatMoney(line.price),
                  line: lt != null ? formatMoney(lt) : "—",
                };
              })
        }
      />

      <InvoicePrintTotals
        lines={[
          {
            label: "PO total",
            value: formatMoney(po.total_amount),
            grand: true,
          },
        ]}
      />

      <InvoicePrintFooter>
        <p>
          This purchase order authorizes the vendor to supply the listed goods at the stated
          quantities and prices. Deliveries should reference PO <strong>{shortPoRef(po.id)}</strong>.
        </p>
        <p className="mt-2">
          Official tax invoices from the vendor must match received quantities. Use this document
          for receiving, three-way match, and accounts payable.
        </p>
      </InvoicePrintFooter>
    </InvoicePrintRoot>
  );
}
