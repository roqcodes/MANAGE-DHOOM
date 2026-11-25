import type { AdminPurchaseOrderDetail } from "@/common/admin/types";
import { COMPANY_NAME } from "@/modules/brand/lib/brand";
import {
  dash,
  INVOICE_PRINT_LABELS,
  PURCHASE_ORDER_TITLE_AR,
  PURCHASE_ORDER_TITLE_EN,
} from "@/modules/documents/invoice-print-copy";
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

function shortPoRef(id: string) {
  return `PO-${id.slice(0, 8).toUpperCase()}`;
}

export function PurchaseOrderInvoiceDocument({
  po,
}: {
  po: AdminPurchaseOrderDetail;
}) {
  const vendor = po.vendors;
  const items = po.purchase_order_items ?? [];
  const number = shortPoRef(po.id);
  const seller = buildVendorPartyCard(vendor);
  const buyer = {
    name: COMPANY_NAME,
    address: "—",
    street: "—",
    city: "—",
    phone: "—",
    vatNumber: "—",
  };

  const qrValue = buildZatcaQrPayload({
    sellerName: buyer.name,
    vatNumber: "",
    timestampIso: invoiceTimestampIso(po.created_at),
    totalWithVat: Number(po.total_amount ?? 0),
    vatAmount: 0,
  });

  return (
    <InvoicePrintRoot kind="purchase">
      <TaxInvoiceMasthead
        storeName={COMPANY_NAME}
        titleEn={PURCHASE_ORDER_TITLE_EN}
        titleAr={PURCHASE_ORDER_TITLE_AR}
      />
      <TaxInvoiceMeta
        numberLabel={INVOICE_PRINT_LABELS.poNumber}
        dateLabel={INVOICE_PRINT_LABELS.poDate}
        documentNumber={number}
        invoiceDate={formatInvoiceDate(po.created_at)}
        dueDate={dash(po.status?.replace(/_/g, " "))}
        dueLabel={{ en: "Status", ar: "الحالة" }}
        qrValue={qrValue}
      />
      <TaxInvoiceParties seller={seller} buyer={buyer} />
      <TaxInvoiceLineTable
        rows={
          items.length === 0
            ? []
            : items.map((line) => {
                const qty = Number(line.quantity ?? 0);
                const unit = Number(line.price ?? 0);
                const taxable = qty * unit;
                const name = line.product_variants?.products?.name ?? "—";
                const variant = line.product_variants?.name;
                return {
                  nature: (
                    <>
                      <span className="bh-inv-item-name">{name}</span>
                      {variant ? <span className="bh-inv-item-desc">{variant}</span> : null}
                    </>
                  ),
                  unitPrice: formatInvoiceUnitPrice(unit),
                  quantity: formatQty(qty),
                  taxable: formatInvoiceMoney(taxable),
                  taxRate: "—",
                  taxAmount: formatInvoiceMoney(0),
                  subtotal: formatInvoiceMoney(taxable),
                };
              })
        }
      />
      <TaxInvoiceTotals
        taxable={formatInvoiceMoney(po.total_amount)}
        vat={formatInvoiceMoney(0)}
        total={formatInvoiceMoney(po.total_amount)}
        paid={formatInvoiceMoney(0)}
        balance={formatInvoiceMoney(po.total_amount)}
      />
      <TaxInvoiceClosing
        counterpartyLabel={INVOICE_PRINT_LABELS.vendorBalance.en}
        counterpartyBalance={po.total_amount}
      />
    </InvoicePrintRoot>
  );
}
