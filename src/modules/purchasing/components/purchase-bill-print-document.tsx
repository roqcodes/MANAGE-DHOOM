import { COMPANY_NAME } from "@/modules/brand/lib/brand";
import { dash, INVOICE_PRINT_LABELS } from "@/modules/documents/invoice-print-copy";
import {
  formatInvoiceDate,
  formatInvoiceMoney,
  formatInvoiceUnitPrice,
  formatQty,
} from "@/modules/documents/invoice-print-money";
import {
  InvoicePrintRoot,
  TaxInvoiceClosing,
  TaxInvoiceLineTable,
  TaxInvoiceMasthead,
  TaxInvoiceMeta,
  TaxInvoiceParties,
  TaxInvoiceTotals,
} from "@/modules/documents/invoice-print-primitives";
import { buildZatcaQrPayload, invoiceTimestampIso } from "@/modules/documents/zatca-qr";
import { buildVendorPartyCard } from "@/modules/vendors/lib/vendor-party-card";

export type PurchaseBillPrintData = {
  id: string;
  purchase_bill_number: string;
  vendor_bill_number: string | null;
  purchase_date: string;
  due_date: string | null;
  subtotal: number;
  tax_amount: number;
  discount: number;
  landed_cost_total: number;
  total_amount: number;
  amount_paid?: number;
  balance_due: number;
  vendor_balance?: number | null;
  vendors: {
    name: string | null;
    address: string | null;
    trn: string | null;
    phone?: string | null;
    email?: string | null;
    contact?: string | null;
    po_box?: string | null;
  } | null;
  stores: {
    name: string | null;
    logo_url?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    phone?: string | null;
    trn?: string | null;
  } | null;
  erp_purchase_bill_lines: Array<{
    product_name: string;
    quantity: number;
    purchase_price: number;
    tax_rate_percent: number;
    line_total: number;
    landed_cost_allocated?: number;
    unit_loaded_cost?: number | null;
  }>;
};

export function PurchaseBillPrintDocument({ bill }: { bill: PurchaseBillPrintData }) {
  const vendor = bill.vendors;
  const store = bill.stores;
  const city = [store?.city, store?.state, store?.country].filter(Boolean).join(", ");
  const seller = buildVendorPartyCard(vendor);
  const buyer = {
    name: dash(store?.name ?? COMPANY_NAME),
    address: dash(store?.address_line1),
    street: dash(store?.address_line2),
    city: dash(city),
    phone: dash(store?.phone),
    vatNumber: dash(store?.trn),
  };

  const paid = Number(bill.amount_paid ?? Math.max(0, bill.total_amount - bill.balance_due));

  const qrValue = buildZatcaQrPayload({
    sellerName: seller.name,
    vatNumber:
      [seller.vatNumber, buyer.vatNumber].find((v) => v && v !== "—") ?? "",
    timestampIso: invoiceTimestampIso(bill.purchase_date),
    totalWithVat: Number(bill.total_amount ?? 0),
    vatAmount: Number(bill.tax_amount ?? 0),
  });

  return (
    <InvoicePrintRoot kind="bill">
      <TaxInvoiceMasthead
        logoUrl={store?.logo_url}
        storeName={store?.name ?? COMPANY_NAME}
        vatNumber={store?.trn}
      />
      <TaxInvoiceMeta
        documentNumber={bill.purchase_bill_number}
        invoiceDate={formatInvoiceDate(bill.purchase_date)}
        dueDate={bill.due_date ? formatInvoiceDate(bill.due_date) : "—"}
        extraRows={
          bill.vendor_bill_number
            ? [{ label: INVOICE_PRINT_LABELS.vendorInvoice, value: bill.vendor_bill_number }]
            : undefined
        }
        qrValue={qrValue}
      />
      <TaxInvoiceParties seller={seller} buyer={buyer} />
      <TaxInvoiceLineTable
        rows={bill.erp_purchase_bill_lines.map((line) => {
          const qty = Number(line.quantity ?? 0);
          const unit = Number(line.purchase_price ?? 0);
          const taxable = qty * unit;
          const tax =
            Number(line.line_total ?? 0) - taxable ||
            taxable * (Number(line.tax_rate_percent ?? 0) / 100);
          return {
            nature: <span className="bh-inv-item-name">{line.product_name}</span>,
            unitPrice: formatInvoiceUnitPrice(unit),
            quantity: formatQty(qty),
            taxable: formatInvoiceMoney(taxable),
            taxRate: `${line.tax_rate_percent}%`,
            taxAmount: formatInvoiceMoney(tax),
            subtotal: formatInvoiceMoney(line.line_total),
          };
        })}
      />
      <TaxInvoiceTotals
        taxable={formatInvoiceMoney(bill.subtotal)}
        vat={formatInvoiceMoney(bill.tax_amount)}
        extraBeforeTotal={[
          ...(bill.discount > 0
            ? [{ label: INVOICE_PRINT_LABELS.discount, value: `-${formatInvoiceMoney(bill.discount)}` }]
            : []),
          ...(bill.landed_cost_total > 0
            ? [
                {
                  label: INVOICE_PRINT_LABELS.landedCosts,
                  value: formatInvoiceMoney(bill.landed_cost_total),
                },
              ]
            : []),
        ]}
        total={formatInvoiceMoney(bill.total_amount)}
        paid={formatInvoiceMoney(paid)}
        balance={formatInvoiceMoney(bill.balance_due)}
      />
      <TaxInvoiceClosing
        counterpartyLabel={INVOICE_PRINT_LABELS.vendorBalance.en}
        counterpartyBalance={bill.vendor_balance ?? bill.balance_due}
      />
    </InvoicePrintRoot>
  );
}
