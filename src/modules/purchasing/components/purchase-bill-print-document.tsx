import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatDateOnly } from "@/lib/format-date";
import {
  InvoicePrintFooter,
  InvoicePrintHeader,
  InvoicePrintLineTable,
  InvoicePrintParties,
  InvoicePrintRoot,
  InvoicePrintTotals,
} from "@/modules/documents/invoice-print-primitives";
import {
  landedAllocFromStoredLine,
  loadedUnitCostFromStoredLine,
} from "@/modules/purchasing/lib/purchase-landed-allocation";

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
  balance_due: number;
  vendors: { name: string | null; address: string | null; trn: string | null } | null;
  stores: { name: string | null } | null;
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
  const showLanded = bill.landed_cost_total > 0;

  const metaRows = [
    { label: "Bill date", value: formatDateOnly(bill.purchase_date) },
    { label: "Due date", value: bill.due_date ? formatDateOnly(bill.due_date) : "On receipt" },
    ...(bill.vendor_bill_number
      ? [{ label: "Vendor invoice #", value: bill.vendor_bill_number }]
      : []),
  ];

  const vendorLines = [
    bill.vendors?.name ?? "—",
    ...(bill.vendors?.address ? [bill.vendors.address] : []),
    ...(bill.vendors?.trn ? [`TRN: ${bill.vendors.trn}`] : []),
  ];

  const columns = [
    { key: "item", label: "Description" },
    { key: "qty", label: "Qty", align: "right" as const, width: "48px" },
    { key: "rate", label: "Rate", align: "right" as const, width: "72px" },
    ...(showLanded
      ? [{ key: "loaded", label: "Loaded unit", align: "right" as const, width: "72px" }]
      : []),
    { key: "taxPct", label: "Tax %", align: "right" as const, width: "48px" },
    ...(showLanded
      ? [{ key: "landed", label: "Landed", align: "right" as const, width: "64px" }]
      : []),
    { key: "total", label: "Line total", align: "right" as const, width: "76px" },
  ];

  return (
    <InvoicePrintRoot kind="bill">
      <InvoicePrintHeader
        title="Purchase bill"
        documentNumber={bill.purchase_bill_number}
        metaRows={metaRows}
      />

      <InvoicePrintParties
        left={{
          title: "Vendor / supplier",
          lines: vendorLines,
        }}
        right={{
          title: "Receiving location",
          lines: [bill.stores?.name ?? "—", "Buyer: DHOOM Trading"],
        }}
      />

      <InvoicePrintLineTable
        columns={columns}
        rows={bill.erp_purchase_bill_lines.map((line) => {
          const landedAlloc = landedAllocFromStoredLine(line);
          const loadedUnit = loadedUnitCostFromStoredLine({
            quantity: line.quantity,
            purchasePrice: line.purchase_price,
            landed_cost_allocated: line.landed_cost_allocated,
            unit_loaded_cost: line.unit_loaded_cost,
          });
          return {
            item: line.product_name,
            qty: line.quantity,
            rate: formatCurrencyAmount(line.purchase_price),
            ...(showLanded
              ? { loaded: formatCurrencyAmount(loadedUnit) }
              : {}),
            taxPct: `${line.tax_rate_percent}%`,
            ...(showLanded
              ? {
                  landed:
                    landedAlloc > 0 ? formatCurrencyAmount(landedAlloc) : "—",
                }
              : {}),
            total: formatCurrencyAmount(line.line_total),
          };
        })}
      />

      <InvoicePrintTotals
        highlightBalance
        lines={[
          { label: "Subtotal", value: formatCurrencyAmount(bill.subtotal) },
          { label: "Tax", value: formatCurrencyAmount(bill.tax_amount) },
          ...(bill.discount > 0
            ? [{ label: "Discount", value: `-${formatCurrencyAmount(bill.discount)}` }]
            : []),
          ...(showLanded
            ? [{ label: "Landed costs", value: formatCurrencyAmount(bill.landed_cost_total) }]
            : []),
          { label: "Bill total", value: formatCurrencyAmount(bill.total_amount), grand: true },
          {
            label: "Balance due",
            value: formatCurrencyAmount(bill.balance_due),
            balance: true,
          },
        ]}
      />

      <InvoicePrintFooter>
        <p>
          Record of purchase from vendor for AP and inventory valuation. Match this bill to the
          vendor&apos;s tax invoice and goods received note before payment.
        </p>
      </InvoicePrintFooter>
    </InvoicePrintRoot>
  );
}
