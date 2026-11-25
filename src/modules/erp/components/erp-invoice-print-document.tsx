"use client";

import { COMPANY_NAME } from "@/modules/brand/lib/brand";
import { buildCustomerBuyerPartyCard } from "@/modules/customers/lib/invoice-buyer-party";
import {
  EMPTY_PARTY_CARD,
  isWalkingCustomer,
} from "@/modules/customers/lib/walking-customer";
import {
  dash,
  INVOICE_PRINT_LABELS,
  SIMPLIFIED_TAX_INVOICE_TITLE_AR,
  SIMPLIFIED_TAX_INVOICE_TITLE_EN,
} from "@/modules/documents/invoice-print-copy";
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
  user_id?: string | null;
  customer_balance?: number | null;
  users: {
    id?: string | null;
    customer_number?: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
    company_name: string | null;
    trn: string | null;
    location?: string | null;
    po_box?: string | null;
  } | null;
  stores: {
    name: string;
    logo_url?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
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
  buyer_party?: {
    name: string;
    address: string;
    street: string;
    city: string;
    phone: string;
    vatNumber: string;
  } | null;
};

function sellerParty(invoice: ErpInvoicePrintData) {
  const s = invoice.stores;
  const city = [s?.city, s?.state, s?.country].filter(Boolean).join(", ");
  return {
    name: dash(s?.name ?? COMPANY_NAME),
    address: dash(s?.address_line1),
    street: dash(s?.address_line2),
    city: dash(city),
    phone: dash(s?.phone),
    vatNumber: dash(s?.trn),
  };
}

function lineBreakdown(
  item: ErpInvoicePrintData["invoice_items"][number],
  taxInclusive: boolean,
) {
  const qty = Number(item.quantity ?? 0);
  const tax = Number(item.gst_amount ?? 0);
  const storedTotal = Number(item.total_amount ?? 0);
  const storedUnit = Number(item.unit_price ?? 0);

  if (taxInclusive) {
    const inclusiveUnit = storedUnit;
    const exclusiveUnit = qty > 0 ? (storedTotal - tax) / qty : storedUnit;
    const taxable = storedTotal - tax;
    return {
      unit: exclusiveUnit || inclusiveUnit,
      taxable,
      tax,
      total: storedTotal,
    };
  }

  const taxable = qty * storedUnit;
  return {
    unit: storedUnit,
    taxable,
    tax,
    total: storedTotal || taxable + tax,
  };
}

function sumItemQuantities(items: ErpInvoicePrintData["invoice_items"]) {
  const total = items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  return formatQty(total);
}

export function ErpInvoicePrintDocument({ invoice }: { invoice: ErpInvoicePrintData }) {
  const walkingCustomer = isWalkingCustomer({
    id: invoice.users?.id,
    user_id: invoice.user_id,
    email: invoice.users?.email,
    customer_number: invoice.users?.customer_number,
  });
  const seller = sellerParty(invoice);
  const buyer = walkingCustomer
    ? { ...EMPTY_PARTY_CARD }
    : (invoice.buyer_party ??
        buildCustomerBuyerPartyCard(invoice.users, {
          composedAddress: invoice.users?.location,
        }));
  const qrValue = buildZatcaQrPayload({
    sellerName: seller.name,
    vatNumber: seller.vatNumber === "—" ? "" : seller.vatNumber,
    timestampIso: invoiceTimestampIso(invoice.created_at),
    totalWithVat: Number(invoice.total_amount ?? 0),
    vatAmount: Number(invoice.gst_amount ?? 0),
  });

  return (
    <InvoicePrintRoot kind="invoice">
      <TaxInvoiceMasthead
        logoUrl={invoice.stores?.logo_url}
        storeName={invoice.stores?.name}
        vatNumber={invoice.stores?.trn}
        titleEn={walkingCustomer ? SIMPLIFIED_TAX_INVOICE_TITLE_EN : undefined}
        titleAr={walkingCustomer ? SIMPLIFIED_TAX_INVOICE_TITLE_AR : undefined}
      />
      <TaxInvoiceMeta
        documentNumber={invoice.invoice_number}
        invoiceDate={formatInvoiceDate(invoice.created_at)}
        dateLabel={walkingCustomer ? INVOICE_PRINT_LABELS.invoiceIssueDate : undefined}
        dueDate={formatInvoiceDate(invoice.due_date)}
        showDueDate={!walkingCustomer}
        extraRows={
          invoice.reference
            ? [{ label: { en: "Reference", ar: "المرجع" }, value: invoice.reference }]
            : undefined
        }
        qrValue={qrValue}
      />
      <TaxInvoiceParties
        seller={seller}
        buyer={buyer}
        buyerRole={walkingCustomer ? INVOICE_PRINT_LABELS.billTo : undefined}
        buyerBlank={walkingCustomer}
      />
      <TaxInvoiceLineTable
        rows={invoice.invoice_items.map((item) => {
          const line = lineBreakdown(item, invoice.tax_inclusive);
          return {
            nature: (
              <>
                <span className="bh-inv-item-name">{item.product_name}</span>
                {item.description ? (
                  <span className="bh-inv-item-desc">{item.description}</span>
                ) : null}
              </>
            ),
            unitPrice: formatInvoiceUnitPrice(line.unit),
            quantity: formatQty(item.quantity),
            taxable: formatInvoiceMoney(line.taxable),
            taxRate: `${item.gst_rate}%`,
            taxAmount: formatInvoiceMoney(line.tax),
            subtotal: formatInvoiceMoney(line.total),
          };
        })}
      />
      <TaxInvoiceTotals
        taxable={formatInvoiceMoney(invoice.subtotal)}
        vat={formatInvoiceMoney(invoice.gst_amount)}
        extraBeforeTotal={
          !walkingCustomer && invoice.discount > 0
            ? [{ label: INVOICE_PRINT_LABELS.discount, value: `-${formatInvoiceMoney(invoice.discount)}` }]
            : undefined
        }
        total={formatInvoiceMoney(invoice.total_amount)}
        paid={formatInvoiceMoney(invoice.amount_paid)}
        balance={formatInvoiceMoney(invoice.balance_due)}
        showPaymentLines={!walkingCustomer}
        totalLabel={walkingCustomer ? INVOICE_PRINT_LABELS.totalAmountDue : undefined}
      />
      {invoice.notes ? <InvoicePrintNotes title="Notes" body={invoice.notes} /> : null}
      <TaxInvoiceClosing
        counterpartyLabel={INVOICE_PRINT_LABELS.customerBalance.en}
        counterpartyBalance={
          walkingCustomer ? null : (invoice.customer_balance ?? invoice.balance_due)
        }
        itemsInTotal={walkingCustomer ? sumItemQuantities(invoice.invoice_items) : undefined}
      />
    </InvoicePrintRoot>
  );
}
