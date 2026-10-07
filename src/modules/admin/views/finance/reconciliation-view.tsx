"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { SortableTableHead, useSortableData } from "@/modules/admin/ui";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type BalanceCheckRow = {
  id: string;
  invoice_number?: string;
  purchase_bill_number?: string;
  payment_number?: string;
  total_amount: number;
  amount_paid?: number;
  credits_applied?: number;
  balance_due?: number;
  computed_balance?: number;
  reconciled: boolean;
  unallocated_amount?: number;
  allocated?: number;
};

type ReconciliationSnapshot = {
  journal_balanced: boolean;
  journal_unbalanced_count: number;
  central_inventory_total: number;
  store_inventory_total: number;
  inventory_store_gap: number;
  legacy_unallocated_stock: number;
  invoice_balance_checks: BalanceCheckRow[];
  purchase_bill_balance_checks: BalanceCheckRow[];
  payment_allocation_checks: BalanceCheckRow[];
};

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
  ) : (
    <XCircle className="h-4 w-4 text-destructive" />
  );
}

export function AdminReconciliationView() {
  const [data, setData] = useState<ReconciliationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [showIssuesOnly, setShowIssuesOnly] = useState(true);

  useEffect(() => {
    adminGet<ReconciliationSnapshot>("erp/finance-dashboard?view=reconciliation")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const invoiceRows = useMemo(() => {
    const rows = data?.invoice_balance_checks ?? [];
    return showIssuesOnly ? rows.filter((r) => !r.reconciled) : rows;
  }, [data, showIssuesOnly]);

  const billRows = useMemo(() => {
    const rows = data?.purchase_bill_balance_checks ?? [];
    return showIssuesOnly ? rows.filter((r) => !r.reconciled) : rows;
  }, [data, showIssuesOnly]);

  const paymentRows = useMemo(() => {
    const rows = data?.payment_allocation_checks ?? [];
    return showIssuesOnly ? rows.filter((r) => !r.reconciled) : rows;
  }, [data, showIssuesOnly]);

  const {
    sorted: sortedInvoices,
    sortKey: invoiceSortKey,
    sortDirection: invoiceSortDirection,
    toggleSort: toggleInvoiceSort,
  } = useSortableData(invoiceRows, "invoice_number", "asc");

  const {
    sorted: sortedBills,
    sortKey: billSortKey,
    sortDirection: billSortDirection,
    toggleSort: toggleBillSort,
  } = useSortableData(billRows, "purchase_bill_number", "asc");

  const {
    sorted: sortedPayments,
    sortKey: paymentSortKey,
    sortDirection: paymentSortDirection,
    toggleSort: togglePaymentSort,
  } = useSortableData(paymentRows, "payment_number", "asc");

  if (loading) return <AdminPageSkeleton />;
  if (!data) return <p className="p-4 text-sm text-destructive">Failed to load reconciliation data.</p>;

  const issueCount =
    (data.journal_balanced ? 0 : 1) +
    (Math.abs(data.inventory_store_gap) > 0.001 ? 1 : 0) +
    invoiceRows.length +
    billRows.length +
    paymentRows.length;

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-lg font-semibold">Reconciliation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cross-checks journal entries, inventory totals, invoice balances, and payment allocations.
          Use this to spot data inconsistencies before month-end.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Journal entries</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-sm">
            <StatusIcon ok={data.journal_balanced} />
            {data.journal_balanced
              ? "All posted journals balanced"
              : `${data.journal_unbalanced_count} unbalanced`}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Inventory gap</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-sm">
            <StatusIcon ok={Math.abs(data.inventory_store_gap) <= 0.001} />
            {formatCurrencyAmount(data.inventory_store_gap, { minimumFractionDigits: 0 })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Central stock</CardTitle>
          </CardHeader>
          <CardContent className="text-sm tabular-nums">
            {formatCurrencyAmount(data.central_inventory_total, { minimumFractionDigits: 0 })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Store stock total</CardTitle>
          </CardHeader>
          <CardContent className="text-sm tabular-nums">
            {formatCurrencyAmount(data.store_inventory_total, { minimumFractionDigits: 0 })}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {issueCount === 0 ? "No issues detected in current checks." : `${issueCount} potential issue(s)`}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showIssuesOnly}
            onChange={(e) => setShowIssuesOnly(e.target.checked)}
          />
          Show issues only
        </label>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoice balance checks</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {invoiceRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoice balance issues.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Invoice"
                    sortKey="invoice_number"
                    activeKey={invoiceSortKey}
                    direction={invoiceSortDirection}
                    onSort={toggleInvoiceSort}
                  />
                  <SortableTableHead
                    label="Total"
                    sortKey="total_amount"
                    activeKey={invoiceSortKey}
                    direction={invoiceSortDirection}
                    onSort={toggleInvoiceSort}
                    align="right"
                  />
                  <SortableTableHead
                    label="Paid"
                    sortKey="amount_paid"
                    activeKey={invoiceSortKey}
                    direction={invoiceSortDirection}
                    onSort={toggleInvoiceSort}
                    align="right"
                  />
                  <SortableTableHead
                    label="Credits"
                    sortKey="credits_applied"
                    activeKey={invoiceSortKey}
                    direction={invoiceSortDirection}
                    onSort={toggleInvoiceSort}
                    align="right"
                  />
                  <SortableTableHead
                    label="Balance"
                    sortKey="balance_due"
                    activeKey={invoiceSortKey}
                    direction={invoiceSortDirection}
                    onSort={toggleInvoiceSort}
                    align="right"
                  />
                  <SortableTableHead
                    label="OK"
                    sortKey="reconciled"
                    activeKey={invoiceSortKey}
                    direction={invoiceSortDirection}
                    onSort={toggleInvoiceSort}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedInvoices.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.invoice_number}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrencyAmount(row.total_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrencyAmount(row.amount_paid ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrencyAmount(row.credits_applied ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrencyAmount(row.balance_due ?? 0)}</TableCell>
                    <TableCell><StatusIcon ok={row.reconciled} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Purchase bill balance checks</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {billRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No purchase bill balance issues.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Bill"
                    sortKey="purchase_bill_number"
                    activeKey={billSortKey}
                    direction={billSortDirection}
                    onSort={toggleBillSort}
                  />
                  <SortableTableHead
                    label="Total"
                    sortKey="total_amount"
                    activeKey={billSortKey}
                    direction={billSortDirection}
                    onSort={toggleBillSort}
                    align="right"
                  />
                  <SortableTableHead
                    label="Paid"
                    sortKey="amount_paid"
                    activeKey={billSortKey}
                    direction={billSortDirection}
                    onSort={toggleBillSort}
                    align="right"
                  />
                  <SortableTableHead
                    label="Credits"
                    sortKey="credits_applied"
                    activeKey={billSortKey}
                    direction={billSortDirection}
                    onSort={toggleBillSort}
                    align="right"
                  />
                  <SortableTableHead
                    label="Balance"
                    sortKey="balance_due"
                    activeKey={billSortKey}
                    direction={billSortDirection}
                    onSort={toggleBillSort}
                    align="right"
                  />
                  <SortableTableHead
                    label="OK"
                    sortKey="reconciled"
                    activeKey={billSortKey}
                    direction={billSortDirection}
                    onSort={toggleBillSort}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedBills.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.purchase_bill_number}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrencyAmount(row.total_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrencyAmount(row.amount_paid ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrencyAmount(row.credits_applied ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrencyAmount(row.balance_due ?? 0)}</TableCell>
                    <TableCell><StatusIcon ok={row.reconciled} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment allocation checks</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {paymentRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payment allocation issues.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Payment"
                    sortKey="payment_number"
                    activeKey={paymentSortKey}
                    direction={paymentSortDirection}
                    onSort={togglePaymentSort}
                  />
                  <SortableTableHead
                    label="Total"
                    sortKey="total_amount"
                    activeKey={paymentSortKey}
                    direction={paymentSortDirection}
                    onSort={togglePaymentSort}
                    align="right"
                  />
                  <SortableTableHead
                    label="Allocated"
                    sortKey="allocated"
                    activeKey={paymentSortKey}
                    direction={paymentSortDirection}
                    onSort={togglePaymentSort}
                    align="right"
                  />
                  <SortableTableHead
                    label="Unallocated"
                    sortKey="unallocated_amount"
                    activeKey={paymentSortKey}
                    direction={paymentSortDirection}
                    onSort={togglePaymentSort}
                    align="right"
                  />
                  <SortableTableHead
                    label="OK"
                    sortKey="reconciled"
                    activeKey={paymentSortKey}
                    direction={paymentSortDirection}
                    onSort={togglePaymentSort}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPayments.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.payment_number}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrencyAmount(row.total_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrencyAmount(row.allocated ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrencyAmount(row.unallocated_amount ?? 0)}</TableCell>
                    <TableCell><StatusIcon ok={row.reconciled} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
