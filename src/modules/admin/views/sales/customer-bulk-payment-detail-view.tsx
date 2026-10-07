"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";

import type {
  BulkCustomerPaymentBatchRow,
  BulkCustomerPaymentLine,
} from "@/common/erp/sales-types";
import { paymentModeLabel } from "@/common/erp/sales-types";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { ErpDocumentTabsLayout } from "@/modules/erp/components/erp-document-tabs-layout";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminDetailSkeleton } from "@/modules/admin/components/admin-page-skeleton";

function formatDisplayDate(value: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd/MM/yyyy");
  } catch {
    return value;
  }
}

export function CustomerBulkPaymentDetailView({ batchId }: { batchId: string }) {
  const [batch, setBatch] = useState<BulkCustomerPaymentBatchRow | null>(null);
  const [lines, setLines] = useState<BulkCustomerPaymentLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminGet<{
      batch: BulkCustomerPaymentBatchRow;
      lines: BulkCustomerPaymentLine[];
    }>(`erp/customer-bulk-payments/${encodeURIComponent(batchId)}`)
      .then((res) => {
        setBatch(res.batch);
        setLines(res.lines);
      })
      .finally(() => setLoading(false));
  }, [batchId]);

  if (loading) {
    return (
      <AdminPageLayout>
        <AdminDetailSkeleton />
      </AdminPageLayout>
    );
  }
  if (!batch) {
    return (
      <AdminPageLayout>
        <p className="text-sm text-muted-foreground">Bulk payment not found.</p>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Bulk customer payment"
        description={`${formatDisplayDate(batch.payment_date)} · ${batch.store_name ?? "No store"}`}
        backHref="/admin/erp/customer-bulk-payments"
        breadcrumb={[
          { label: "Bulk payments", href: "/admin/erp/customer-bulk-payments" },
          { label: "Detail" },
        ]}
      />

      <ErpDocumentTabsLayout
        detailsLabel="Bulk payment details"
        entityId={batchId}
        auditEntityType="customer_payment_batch"
        journalSourceType="customer_payment_batch"
      >
      <Card>
        <CardHeader>
          <CardTitle>Bulk payment details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem label="Payment date" value={formatDisplayDate(batch.payment_date)} />
          <DetailItem label="Store" value={batch.store_name ?? "—"} />
          <DetailItem label="Account" value={batch.account_name ?? "—"} />
          <DetailItem label="Payment mode" value={paymentModeLabel(batch.payment_mode)} />
          <DetailItem label="Amount" value={formatCurrencyAmount(batch.total_amount)} />
          <DetailItem label="Created by" value={batch.created_by_name ?? "—"} />
          {batch.receipts ? (
            <DetailItem label="Receipts #" value={batch.receipts} className="sm:col-span-2" />
          ) : null}
          {batch.notes ? (
            <DetailItem label="Notes" value={batch.notes} className="sm:col-span-2 lg:col-span-3" />
          ) : null}
        </CardContent>
      </Card>

      {lines.map((line) => (
        <Card key={line.payment_id}>
          <CardHeader className="border-b bg-muted/30">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span>
                <span className="text-muted-foreground">Customer:</span>{" "}
                <span className="font-medium">{line.customer_name ?? "—"}</span>
              </span>
              <span>
                <span className="text-muted-foreground">Payment:</span>{" "}
                <span className="font-semibold tabular-nums">
                  {formatCurrencyAmount(line.amount)}
                </span>
              </span>
              <span>
                <span className="text-muted-foreground">Receipt #:</span>{" "}
                {line.receipt_ref ?? "—"}
              </span>
              <span>
                <span className="text-muted-foreground">Store:</span>{" "}
                {line.store_name ?? "—"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {line.allocations.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead className="text-right">Invoice amount</TableHead>
                    <TableHead className="text-right">Paid amt</TableHead>
                    <TableHead className="text-right">Tot. paid</TableHead>
                    <TableHead className="text-right">Curr. balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {line.allocations.map((alloc) => (
                    <TableRow key={alloc.invoice_id}>
                      <TableCell className="font-medium">{alloc.invoice_number}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {formatDisplayDate(alloc.due_date)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrencyAmount(alloc.invoice_amount)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-destructive">
                        {formatCurrencyAmount(alloc.paid_amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrencyAmount(alloc.total_paid_to_invoice)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrencyAmount(alloc.current_balance)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={alloc.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">No invoice allocations.</p>
            )}
            <p className="border-t p-3 text-right text-sm font-semibold tabular-nums">
              Total paid: {formatCurrencyAmount(line.amount)}
            </p>
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end">
        <Link
          href="/admin/erp/customer-bulk-payments"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          Back to list
        </Link>
      </div>
      </ErpDocumentTabsLayout>
    </AdminPageLayout>
  );
}

function DetailItem({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}
