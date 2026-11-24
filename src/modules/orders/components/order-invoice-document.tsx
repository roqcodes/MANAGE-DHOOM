import type { OrderWithItems } from "@/common/admin/types";
import { COMPANY_NAME } from "@/modules/brand/lib/brand";
import { dash, INVOICE_PRINT_LABELS } from "@/modules/documents/invoice-print-copy";
import {
  formatInvoiceDate,
  formatInvoiceMoney,
  formatInvoiceUnitPrice,
  formatQty,
} from "@/modules/documents/invoice-print-money";
import {
  InvoicePrintNotes,
  InvoicePrintRoot,
  TaxInvoiceClosing,
  TaxInvoiceLineTable,
  TaxInvoiceMasthead,
  TaxInvoiceMeta,
  TaxInvoiceParties,
  TaxInvoiceTotals,
} from "@/modules/documents/invoice-print-primitives";
import { buildZatcaQrPayload, invoiceTimestampIso } from "@/modules/documents/zatca-qr";

function shortOrderRef(id: string) {
  return id.split("-")[0]?.toUpperCase() ?? id.slice(0, 8);
}

function formatAddress(order: OrderWithItems): {
  address: string;
  street: string;
  city: string;
  phone: string;
} {
  const a = order.addresses;
  if (!a) {
    return { address: "—", street: "—", city: "—", phone: dash(order.users?.phone) };
  }
  const city = [a.city, a.state, a.pincode].filter(Boolean).join(", ");
  return {
    address: dash(a.line1 ?? a.address_line),
    street: dash(a.line2),
    city: dash(city),
    phone: dash(a.phone ?? order.users?.phone),
  };
}

export function OrderInvoiceDocument({ order }: { order: OrderWithItems }) {
  const total = Number(order.total_amount ?? 0);
  const subtotal = Number(order.subtotal ?? total);
  const tax = Number(order.tax ?? 0);
  const discount = Number(order.discount ?? 0);
  const addr = formatAddress(order);
  const paid =
    order.payment_status === "paid" || order.payment_status === "completed"
      ? total
      : 0;
  const items = order.order_items ?? [];
  const number = order.sales_order_number?.trim() || `Order #${shortOrderRef(order.id)}`;

  const seller = {
    name: dash(order.store_name ?? COMPANY_NAME),
    address: "—",
    street: "—",
    city: "—",
    phone: "—",
    vatNumber: "—",
  };
  const buyer = {
    name: dash(order.users?.name ?? "Guest"),
    address: addr.address,
    street: addr.street,
    city: addr.city,
    phone: addr.phone,
    vatNumber: "—",
  };

  const qrValue = buildZatcaQrPayload({
    sellerName: seller.name,
    vatNumber: "",
    timestampIso: invoiceTimestampIso(order.created_at),
    totalWithVat: total,
    vatAmount: tax,
  });

  return (
    <InvoicePrintRoot kind="order">
      <TaxInvoiceMasthead storeName={order.store_name ?? COMPANY_NAME} />
      <TaxInvoiceMeta
        documentNumber={number}
        invoiceDate={formatInvoiceDate(order.created_at)}
        dueDate={formatInvoiceDate(order.preferred_delivery_date ?? order.created_at)}
        extraRows={[
          {
            label: { en: "Payment", ar: "الدفع" },
            value: dash(order.payment_status?.replace(/_/g, " ")),
          },
        ]}
        qrValue={qrValue}
      />
      <TaxInvoiceParties seller={seller} buyer={buyer} />
      {order.merchant_note?.trim() ? (
        <InvoicePrintNotes title="Notes" body={order.merchant_note.trim()} />
      ) : null}
      <TaxInvoiceLineTable
        rows={items.map((item) => {
          const qty = Number(item.quantity ?? 0);
          const unit = Number(item.price ?? 0);
          const taxable = qty * unit;
          return {
            nature: <span className="bh-inv-item-name">{item.product_name ?? "Item"}</span>,
            unitPrice: formatInvoiceUnitPrice(unit),
            quantity: formatQty(qty),
            taxable: formatInvoiceMoney(taxable),
            taxRate: "—",
            taxAmount: formatInvoiceMoney(0),
            subtotal: formatInvoiceMoney(taxable),
          };
        })}
      />
      <TaxInvoiceTotals
        taxable={formatInvoiceMoney(subtotal)}
        vat={formatInvoiceMoney(tax)}
        extraBeforeTotal={
          discount > 0
            ? [{ label: INVOICE_PRINT_LABELS.discount, value: `-${formatInvoiceMoney(discount)}` }]
            : undefined
        }
        total={formatInvoiceMoney(total)}
        paid={formatInvoiceMoney(paid)}
        balance={formatInvoiceMoney(Math.max(0, total - paid))}
      />
      <TaxInvoiceClosing
        counterpartyLabel={INVOICE_PRINT_LABELS.customerBalance.en}
        counterpartyBalance={Math.max(0, total - paid)}
      />
    </InvoicePrintRoot>
  );
}
