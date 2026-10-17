import { format } from "date-fns";

import type { OrderWithItems } from "@/common/admin/types";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatDateOnly } from "@/lib/format-date";
import {
  InvoicePrintFooter,
  InvoicePrintHeader,
  InvoicePrintLineTable,
  InvoicePrintNotes,
  InvoicePrintParties,
  InvoicePrintRoot,
  InvoicePrintTotals,
} from "@/modules/documents/invoice-print-primitives";

function shortOrderRef(id: string) {
  return id.split("-")[0]?.toUpperCase() ?? id.slice(0, 8);
}

function formatAddress(order: OrderWithItems): string[] {
  const a = order.addresses;
  if (!a) return [];
  const lines: string[] = [];
  const line1 = a.line1 ?? a.address_line;
  if (line1) lines.push(line1);
  if (a.line2) lines.push(a.line2);
  const city = [a.city, a.state, a.pincode].filter(Boolean).join(", ");
  if (city) lines.push(city);
  if (a.phone) lines.push(`Tel: ${a.phone}`);
  return lines;
}

export function OrderInvoiceDocument({ order }: { order: OrderWithItems }) {
  const placed = order.created_at
    ? format(new Date(order.created_at), "MMMM d, yyyy · h:mm a")
    : "—";
  const total = Number(order.total_amount ?? 0);
  const subtotal = Number(order.subtotal ?? total);
  const tax = Number(order.tax ?? 0);
  const discount = Number(order.discount ?? 0);
  const addressLines = formatAddress(order);

  const metaRows = [
    { label: "Order date", value: placed },
    {
      label: "Fulfillment",
      value: order.fulfillment_status?.replace(/_/g, " ") ?? order.status,
    },
    {
      label: "Payment",
      value: (order.payment_status ?? "pending").replace(/_/g, " "),
    },
    ...(order.preferred_delivery_date
      ? [
          {
            label: "Requested delivery",
            value: formatDateOnly(order.preferred_delivery_date),
          },
        ]
      : []),
  ];

  const buyerLines = [
    order.users?.name ?? "Guest",
    ...(order.users?.email ? [order.users.email] : []),
    ...(order.users?.phone ? [`Tel: ${order.users.phone}`] : []),
  ];

  const shipLines =
    addressLines.length > 0
      ? addressLines
      : ["No delivery address on file"];

  return (
    <InvoicePrintRoot kind="order">
      <InvoicePrintHeader
        title="Sales receipt / invoice"
        documentNumber={`Order #${shortOrderRef(order.id)}`}
        status={order.status}
        metaRows={metaRows}
      />

      <InvoicePrintParties
        left={{
          title: order.store_name ? `Sold by · ${order.store_name}` : "Sold by",
          lines: [
            "DHOOM Trading",
            order.source ? `Channel: ${order.source}` : "Channel: Online store",
            order.delivery_method
              ? `Delivery: ${order.delivery_method.replace(/_/g, " ")}`
              : "Delivery: Standard",
          ],
        }}
        right={{
          title: "Customer",
          lines: buyerLines,
        }}
      />

      {addressLines.length > 0 ? (
        <InvoicePrintParties
          left={{ title: "Ship to", lines: shipLines }}
          right={{
            title: "Order reference",
            lines: [
              order.sales_order_number
                ? `SO: ${order.sales_order_number}`
                : `ID: ${order.id}`,
              ...(order.reference_number
                ? [`Ref: ${order.reference_number}`]
                : []),
              ...(order.invoice_id ? [`Linked invoice: ${order.invoice_id.slice(0, 8)}…`] : []),
            ],
          }}
        />
      ) : null}

      {order.merchant_note?.trim() ? (
        <InvoicePrintNotes title="Order note" body={order.merchant_note.trim()} />
      ) : null}

      <InvoicePrintLineTable
        columns={[
          { key: "item", label: "Description" },
          { key: "rate", label: "Unit price", align: "right", width: "80px" },
          { key: "qty", label: "Qty", align: "right", width: "48px" },
          { key: "total", label: "Amount", align: "right", width: "80px" },
        ]}
        rows={(order.order_items ?? []).map((item) => ({
          item: item.product_name ?? "Item",
          rate: formatCurrencyAmount(Number(item.price ?? 0)),
          qty: item.quantity ?? 0,
          total: formatCurrencyAmount(
            Number(item.price ?? 0) * Number(item.quantity ?? 0),
          ),
        }))}
      />

      <InvoicePrintTotals
        lines={[
          { label: "Subtotal", value: formatCurrencyAmount(subtotal) },
          ...(tax > 0 ? [{ label: "Tax", value: formatCurrencyAmount(tax) }] : []),
          ...(discount > 0
            ? [{ label: "Discount", value: `-${formatCurrencyAmount(discount)}` }]
            : []),
          { label: "Total due", value: formatCurrencyAmount(total), grand: true },
        ]}
      />

      <InvoicePrintFooter>
        <p>
          Thank you for your order. This document confirms items and amounts for order{" "}
          <strong>#{shortOrderRef(order.id)}</strong>. Payment status:{" "}
          <strong>{order.payment_status ?? "pending"}</strong>.
        </p>
        <p className="mt-2">
          For returns or support, contact DHOOM Trading with your order reference. Tax treatment
          follows applicable local rules; retain this receipt for your records.
        </p>
      </InvoicePrintFooter>
    </InvoicePrintRoot>
  );
}
