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

export type VatNetSummary = {
  due_tax?: number;
  recoverable_tax?: number;
  net_payable?: number;
  net_reclaimable?: number;
};

export function NetVatDueSection({ net }: { net: VatNetSummary }) {
  const due = Number(net.due_tax ?? 0);
  const recoverable = Number(net.recoverable_tax ?? 0);
  const payable = Number(net.net_payable ?? 0);
  const reclaimable = Number(net.net_reclaimable ?? 0);
  const netLabel =
    payable > 0
      ? "Net VAT payable for the period"
      : reclaimable > 0
        ? "Net VAT reclaimable for the period"
        : "Net VAT payable (or reclaimable) for the period";
  const netAmount = payable > 0 ? payable : reclaimable > 0 ? -reclaimable : 0;

  const rows = [
    ["Total value of due tax for the period", due],
    ["Total value of recoverable tax for the period", recoverable],
    [netLabel, netAmount],
  ] as const;

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
    taxable: rows.reduce((s, r) => s + Number(r.taxable_amount ?? 0), 0),
    vat: rows.reduce((s, r) => s + Number(r.vat_amount ?? 0), 0),
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
                  {formatCurrencyAmount(Number(row.taxable_amount ?? 0))}
                </AdminTableCell>
                <AdminTableCell className="text-right tabular-nums">
                  {formatCurrencyAmount(Number(row.vat_amount ?? 0))}
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
