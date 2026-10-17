"use client";

import { format } from "date-fns";

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

export type ErpInvoicePrintData = {
  invoice_number: string;
  status: string;
  created_at: string;
  due_date: string | null;
  subtotal: number;
  gst_amount: number;
  discount: number;
  total_amount: number;
  amount_paid: number;
  credits_applied: number;
  balance_due: number;
  tax_inclusive: boolean;
  notes: string | null;
  reference: string | null;
  users: {
    name: string | null;
    email: string | null;
    phone: string | null;
    company_name: string | null;
    trn: string | null;
  } | null;
  stores: {
    name: string;
    logo_url?: string | null;
    address_line1?: string | null;
    city?: string | null;
    country?: string | null;
    phone?: string | null;
    trn?: string | null;
  } | null;
  invoice_items: Array<{
    product_name: string;
    description: string | null;
    quantity: number;
    unit_price: number;
    gst_rate: number;
    gst_amount: number;
    total_amount: number;
  }>;
};

function formatLongDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const dateOnly = iso.includes("T") ? iso : `${formatDateOnly(iso)}T12:00:00`;
  return format(new Date(dateOnly), "MMMM d, yyyy");
}

function sellerLines(invoice: ErpInvoicePrintData): string[] {
  const s = invoice.stores;
  const lines: string[] = [s?.name ?? "—"];
  if (s?.address_line1) lines.push(s.address_line1);
  const cityLine = [s?.city, s?.country].filter(Boolean).join(", ");
  if (cityLine) lines.push(cityLine);
  if (s?.phone) lines.push(`Tel: ${s.phone}`);
  if (s?.trn) lines.push(`TRN: ${s.trn}`);
  return lines;
}

function buyerLines(invoice: ErpInvoicePrintData): string[] {
  const u = invoice.users;
  const lines: string[] = [
    u?.name ?? u?.company_name ?? "—",
  ];
  if (u?.company_name && u?.name && u.company_name !== u.name) {
    lines.push(u.company_name);
  }
  if (u?.email) lines.push(u.email);
  if (u?.phone) lines.push(`Tel: ${u.phone}`);
  if (u?.trn) lines.push(`TRN: ${u.trn}`);
  return lines;
}

export function ErpInvoicePrintDocument({ invoice }: { invoice: ErpInvoicePrintData }) {
  const metaRows = [
    { label: "Invoice date", value: formatLongDate(invoice.created_at) },
    { label: "Due date", value: formatLongDate(invoice.due_date) },
    { label: "Payment terms", value: invoice.due_date ? "Due on date shown" : "On receipt" },
    ...(invoice.reference
      ? [{ label: "Reference", value: invoice.reference }]
      : []),
  ];

  const taxLabel = invoice.tax_inclusive ? "Tax (incl. in lines)" : "Tax (VAT/GST)";

  return (
    <InvoicePrintRoot kind="invoice">
      <InvoicePrintHeader
        logoUrl={invoice.stores?.logo_url}
        storeName={invoice.stores?.name}
        title="Tax invoice"
        documentNumber={invoice.invoice_number}
        status={invoice.status}
        metaRows={metaRows}
      />

      <InvoicePrintParties
        left={{ title: "Seller / supplier", lines: sellerLines(invoice) }}
        right={{ title: "Bill to", lines: buyerLines(invoice) }}
      />

      <InvoicePrintLineTable
        columns={[
          { key: "index", label: "#", width: "28px" },
          { key: "item", label: "Description" },
          { key: "rate", label: "Unit price", align: "right", width: "72px" },
          { key: "qty", label: "Qty", align: "right", width: "44px" },
          { key: "taxPct", label: "Tax %", align: "right", width: "48px" },
          { key: "tax", label: "Tax", align: "right", width: "64px" },
          { key: "total", label: "Line total", align: "right", width: "76px" },
        ]}
        rows={invoice.invoice_items.map((item, index) => ({
          index: index + 1,
          item: (
            <>
              <span className="font-medium">{item.product_name}</span>
              {item.description ? (
                <span className="block text-[11px] text-slate-500">{item.description}</span>
              ) : null}
            </>
          ),
          rate: formatCurrencyAmount(item.unit_price),
          qty: item.quantity,
          taxPct: `${item.gst_rate}%`,
          tax: formatCurrencyAmount(item.gst_amount),
          total: formatCurrencyAmount(item.total_amount),
        }))}
      />

      <InvoicePrintTotals
        highlightBalance
        lines={[
          { label: "Subtotal", value: formatCurrencyAmount(invoice.subtotal) },
          { label: taxLabel, value: formatCurrencyAmount(invoice.gst_amount) },
          ...(invoice.discount > 0
            ? [{ label: "Discount", value: `-${formatCurrencyAmount(invoice.discount)}` }]
            : []),
          { label: "Invoice total", value: formatCurrencyAmount(invoice.total_amount), grand: true },
          { label: "Amount paid", value: formatCurrencyAmount(invoice.amount_paid) },
          ...(invoice.credits_applied > 0
            ? [{ label: "Credits applied", value: formatCurrencyAmount(invoice.credits_applied) }]
            : []),
          {
            label: "Balance due",
            value: formatCurrencyAmount(invoice.balance_due),
            balance: true,
          },
        ]}
      />

      {invoice.notes ? (
        <InvoicePrintNotes title="Notes & terms" body={invoice.notes} />
      ) : null}

      <InvoicePrintFooter>
        <p>
          This is a computer-generated tax invoice from {invoice.stores?.name ?? "DHOOM Trading"}.
          Please quote invoice number <strong>{invoice.invoice_number}</strong> on remittance.
        </p>
        <p className="mt-2">
          Retain this document for your records. For billing queries, contact the seller using the details above.
        </p>
      </InvoicePrintFooter>
    </InvoicePrintRoot>
  );
}
