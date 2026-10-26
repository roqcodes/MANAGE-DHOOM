"use client";

import { TableCell } from "@/components/ui/table";
import { formatCurrencyAmount } from "@/lib/format-currency";
import {
  AdminDataTable,
  AdminDataTableRowsSkeleton,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableRow,
} from "@/modules/admin/ui";

import type { ReportKpiItem } from "../business-overview/report-summaries";

export type VatNetSummary = {
  due_tax?: number;
  recoverable_tax?: number;
  carry_forward_applied?: number;
  net_payable?: number;
  net_reclaimable?: number;
};

export function buildNetVatKpis(net: VatNetSummary): ReportKpiItem[] {
  const due = Number(net.due_tax ?? 0);
  const recoverable = Number(net.recoverable_tax ?? 0);
  const carryForward = Number(net.carry_forward_applied ?? 0);
  const payable = Math.max(0, Number(net.net_payable ?? 0));
  const reclaimable = Math.max(0, Number(net.net_reclaimable ?? 0));
  const items: ReportKpiItem[] = [
    { label: "Output tax (due)", value: formatCurrencyAmount(due) },
    { label: "Input tax (recoverable)", value: formatCurrencyAmount(recoverable) },
  ];
  if (carryForward > 0) {
    items.push({
      label: "Prior-period credit applied",
      value: formatCurrencyAmount(carryForward),
    });
  }
  items.push({
    label: "Tax payable",
    value: formatCurrencyAmount(payable),
  });
  if (reclaimable > 0) {
    items.push({
      label: "Recoverable credit (carry forward)",
      value: formatCurrencyAmount(reclaimable),
    });
  }
  return items;
}

export function NetVatDueSection({ net }: { net: VatNetSummary }) {
  const due = Number(net.due_tax ?? 0);
  const recoverable = Number(net.recoverable_tax ?? 0);
  const carryForward = Number(net.carry_forward_applied ?? 0);
  const payable = Math.max(0, Number(net.net_payable ?? 0));
  const reclaimable = Math.max(0, Number(net.net_reclaimable ?? 0));

  const rows: [string, number][] = [
    ["Total output tax for the period", due],
    ["Total input tax for the period", recoverable],
  ];
  if (carryForward > 0) {
    rows.push(["Prior-period VAT credit applied", carryForward]);
  }
  rows.push(["Tax payable", payable]);
  if (reclaimable > 0) {
    rows.push(["Recoverable credit (carry forward)", reclaimable]);
  }

  return (
    <div className="border-t bg-muted/20 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Net VAT due
      </p>
      <AdminDataTable className="max-w-xl border-0 shadow-none">
        <AdminTableBody>
          {rows.map(([label, amount]) => (
            <AdminTableRow key={label}>
              <AdminTableCell className="text-sm">{label}</AdminTableCell>
              <AdminTableCell className="text-right text-sm tabular-nums font-medium">
                {formatCurrencyAmount(amount)}
              </AdminTableCell>
            </AdminTableRow>
          ))}
        </AdminTableBody>
      </AdminDataTable>
    </div>
  );
}

export function VatReportTableSkeleton({ columns }: { columns: number }) {
  return (
    <AdminDataTable>
      <AdminDataTableRowsSkeleton rows={6} columns={columns} />
    </AdminDataTable>
  );
}

export type SummaryStoreRow = {
  store_name?: string;
  standard_rated_sales?: number;
  standard_rated_purchases?: number;
  credit_adjustment?: number;
  vendor_credit_adjustment?: number;
  tax_amount?: number;
};

export function sumSummaryRows(
  rows: SummaryStoreRow[],
  keys: { taxable: keyof SummaryStoreRow; adjustment: keyof SummaryStoreRow; tax: "tax_amount" },
) {
  return {
    taxable: rows.reduce((s, r) => s + Number(r[keys.taxable] ?? 0), 0),
    adjustment: rows.reduce((s, r) => s + Number(r[keys.adjustment] ?? 0), 0),
    tax: rows.reduce((s, r) => s + Number(r.tax_amount ?? 0), 0),
  };
}

export function VatSummaryStoreTable({
  title,
  rows,
  taxableKey,
  adjustmentKey,
  adjustmentLabel,
  totalLabel,
}: {
  title: string;
  rows: SummaryStoreRow[];
  taxableKey: "standard_rated_sales" | "standard_rated_purchases";
  adjustmentKey: "credit_adjustment" | "vendor_credit_adjustment";
  adjustmentLabel: string;
  totalLabel: string;
}) {
  const totals = sumSummaryRows(rows, {
    taxable: taxableKey,
    adjustment: adjustmentKey,
    tax: "tax_amount",
  });

  return (
    <div className="border-b">
      <p className="bg-muted/40 px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-primary">
        {title}
      </p>
      <AdminDataTable className="border-0 shadow-none">
        <AdminTableHeader>
          <AdminTableCell className="text-xs font-medium">Store</AdminTableCell>
          <AdminTableCell className="text-right text-xs font-medium">
            Standard rated (domestic)
          </AdminTableCell>
          <AdminTableCell className="text-right text-xs font-medium">{adjustmentLabel}</AdminTableCell>
          <AdminTableCell className="text-right text-xs font-medium">Tax amount</AdminTableCell>
        </AdminTableHeader>
        <AdminTableBody>
          {rows.length === 0 ? (
            <AdminTableRow>
              <TableCell colSpan={4} className="text-sm text-muted-foreground">
                No transactions in this period.
              </TableCell>
            </AdminTableRow>
          ) : (
            rows.map((row, i) => (
              <AdminTableRow key={`${row.store_name}-${i}`}>
                <AdminTableCell>{row.store_name ?? "—"}</AdminTableCell>
                <AdminTableCell className="text-right tabular-nums">
                  {formatCurrencyAmount(Number(row[taxableKey] ?? 0))}
                </AdminTableCell>
                <AdminTableCell className="text-right tabular-nums">
                  {formatCurrencyAmount(Number(row[adjustmentKey] ?? 0))}
                </AdminTableCell>
                <AdminTableCell className="text-right tabular-nums">
                  {formatCurrencyAmount(Number(row.tax_amount ?? 0))}
                </AdminTableCell>
              </AdminTableRow>
            ))
          )}
          <AdminTableRow className="bg-muted/50 font-semibold hover:bg-muted/50">
            <AdminTableCell>{totalLabel}</AdminTableCell>
            <AdminTableCell className="text-right tabular-nums">
              {formatCurrencyAmount(totals.taxable)}
            </AdminTableCell>
            <AdminTableCell className="text-right tabular-nums">
              {formatCurrencyAmount(totals.adjustment)}
            </AdminTableCell>
            <AdminTableCell className="text-right tabular-nums">
              {formatCurrencyAmount(totals.tax)}
            </AdminTableCell>
          </AdminTableRow>
        </AdminTableBody>
      </AdminDataTable>
    </div>
  );
}

export type VatDetailLine = {
  party_name?: string | null;
  party_trn?: string | null;
  transaction_date?: string;
  transaction_number?: string;
  transaction_type?: string;
  store_name?: string | null;
  taxable_amount?: number;
  vat_amount?: number;
  vat_percentage?: number | null;
};

function vatAdjustmentSign(transactionType?: string) {
  const type = (transactionType ?? "").toLowerCase();
  return type === "credit note" || type === "vendor credit" ? -1 : 1;
}

function signedVatAmount(row: VatDetailLine) {
  return vatAdjustmentSign(row.transaction_type) * Number(row.vat_amount ?? 0);
}

function signedTaxableAmount(row: VatDetailLine) {
  return vatAdjustmentSign(row.transaction_type) * Number(row.taxable_amount ?? 0);
}

export function buildVatSummaryKpis(
  salesRows: SummaryStoreRow[],
  purchaseRows: SummaryStoreRow[],
  net: VatNetSummary,
): ReportKpiItem[] {
  const salesTax = salesRows.reduce((s, r) => s + Number(r.tax_amount ?? 0), 0);
  const purchaseTax = purchaseRows.reduce((s, r) => s + Number(r.tax_amount ?? 0), 0);
  const netTail = buildNetVatKpis(net).slice(2);
  return [
    { label: "Output tax", value: formatCurrencyAmount(salesTax) },
    { label: "Input tax", value: formatCurrencyAmount(purchaseTax) },
    ...netTail,
  ].slice(0, 5);
}

export function buildVatDetailsKpis(
  outputLines: VatDetailLine[],
  inputLines: VatDetailLine[],
  net: VatNetSummary,
): ReportKpiItem[] {
  const outputVat = outputLines.reduce((s, r) => s + signedVatAmount(r), 0);
  const inputVat = inputLines.reduce((s, r) => s + signedVatAmount(r), 0);
  const netTail = buildNetVatKpis(net).slice(2);
  return [
    { label: "Output lines", value: outputLines.length.toLocaleString() },
    { label: "Output VAT", value: formatCurrencyAmount(outputVat) },
    { label: "Input lines", value: inputLines.length.toLocaleString() },
    { label: "Input VAT", value: formatCurrencyAmount(inputVat) },
    ...netTail,
  ].slice(0, 6);
}

export function VatDetailsTable({
  title,
  partyLabel,
  rows,
}: {
  title: string;
  partyLabel: string;
  rows: VatDetailLine[];
}) {
  const totals = {
    taxable: rows.reduce((s, r) => s + signedTaxableAmount(r), 0),
    vat: rows.reduce((s, r) => s + signedVatAmount(r), 0),
  };

  return (
    <div className="border-b">
      <p className="bg-muted/40 px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-primary">
        {title}
      </p>
      <AdminDataTable className="border-0 shadow-none">
        <AdminTableHeader>
          <AdminTableCell className="text-xs font-medium">{partyLabel}</AdminTableCell>
          <AdminTableCell className="text-xs font-medium">TRN</AdminTableCell>
          <AdminTableCell className="text-xs font-medium">Date</AdminTableCell>
          <AdminTableCell className="text-xs font-medium">Transaction #</AdminTableCell>
          <AdminTableCell className="text-xs font-medium">Type</AdminTableCell>
          <AdminTableCell className="text-right text-xs font-medium">Taxable</AdminTableCell>
          <AdminTableCell className="text-right text-xs font-medium">VAT</AdminTableCell>
          <AdminTableCell className="text-right text-xs font-medium">VAT %</AdminTableCell>
        </AdminTableHeader>
        <AdminTableBody>
          {rows.length === 0 ? (
            <AdminTableRow>
              <TableCell colSpan={8} className="text-sm text-muted-foreground">
                No transactions in this period.
              </TableCell>
            </AdminTableRow>
          ) : (
            rows.map((row, i) => (
              <AdminTableRow key={`${row.transaction_number}-${i}`}>
                <AdminTableCell>{row.party_name ?? "—"}</AdminTableCell>
                <AdminTableCell className="text-muted-foreground">{row.party_trn ?? "—"}</AdminTableCell>
                <AdminTableCell className="tabular-nums">
                  {row.transaction_date?.slice(0, 10) ?? "—"}
                </AdminTableCell>
                <AdminTableCell>{row.transaction_number ?? "—"}</AdminTableCell>
                <AdminTableCell>{row.transaction_type ?? "—"}</AdminTableCell>
                <AdminTableCell className="text-right tabular-nums">
                  {formatCurrencyAmount(signedTaxableAmount(row))}
                </AdminTableCell>
                <AdminTableCell className="text-right tabular-nums">
                  {formatCurrencyAmount(signedVatAmount(row))}
                </AdminTableCell>
                <AdminTableCell className="text-right tabular-nums">
                  {row.vat_percentage != null ? `${row.vat_percentage}%` : "—"}
                </AdminTableCell>
              </AdminTableRow>
            ))
          )}
          <AdminTableRow className="bg-muted/50 font-semibold hover:bg-muted/50">
            <TableCell colSpan={5}>Total</TableCell>
            <AdminTableCell className="text-right tabular-nums">
              {formatCurrencyAmount(totals.taxable)}
            </AdminTableCell>
            <AdminTableCell className="text-right tabular-nums">
              {formatCurrencyAmount(totals.vat)}
            </AdminTableCell>
            <AdminTableCell>{" "}</AdminTableCell>
          </AdminTableRow>
        </AdminTableBody>
      </AdminDataTable>
    </div>
  );
}
