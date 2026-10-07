"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";

import type { ErpExpenseDetail } from "@/common/erp/purchasing-types";
import { AdminDetailSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { ErpDocumentTabsLayout } from "@/modules/erp/components/erp-document-tabs-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatDisplayDate(value: string) {
  try {
    return format(parseISO(value), "dd-MMM-yyyy");
  } catch {
    return value;
  }
}

function taxModeLabel(mode: string) {
  if (mode === "inclusive") return "Inclusive";
  if (mode === "exclusive") return "Exclusive";
  return "None";
}

export function ExpenseDetailView({ expenseId }: { expenseId: string }) {
  const router = useRouter();
  const [expense, setExpense] = useState<ErpExpenseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [billing, startBill] = useTransition();
  const [billError, setBillError] = useState<string | null>(null);

  useEffect(() => {
    adminGet<ErpExpenseDetail>(`erp/expenses/${expenseId}`)
      .then(setExpense)
      .finally(() => setLoading(false));
  }, [expenseId]);

  if (loading) {
    return (
      <AdminPageLayout>
        <AdminDetailSkeleton />
      </AdminPageLayout>
    );
  }
  if (!expense) {
    return (
      <AdminPageLayout>
        <p className="text-sm text-muted-foreground">Expense not found.</p>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title={expense.expense_number}
        description={`${formatDisplayDate(expense.expense_date)} · ${expense.store_name ?? "—"}`}
        backHref="/admin/erp/expenses"
        breadcrumb={[
          { label: "Expenses", href: "/admin/erp/expenses" },
          { label: expense.expense_number },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            {expense.is_billable && !expense.billed_invoice_id ? (
              <Button
                size="sm"
                disabled={billing}
                onClick={() => {
                  setBillError(null);
                  startBill(async () => {
                    try {
                      const res = await adminPost<{ invoiceId: string }>(
                        `erp/expenses/${expenseId}/bill`,
                        {},
                      );
                      router.push(`/admin/erp/invoices/${res.invoiceId}`);
                    } catch (err) {
                      setBillError(err instanceof Error ? err.message : "Billing failed");
                    }
                  });
                }}
              >
                {billing ? "Creating invoice…" : "Create customer invoice"}
              </Button>
            ) : null}
            {expense.billed_invoice_id ? (
              <Button
                nativeButton={false}
                size="sm"
                variant="outline"
                render={<Link href={`/admin/erp/invoices/${expense.billed_invoice_id}`} />}
              >
                View invoice
              </Button>
            ) : null}
            <Button
              nativeButton={false}
              size="sm"
              variant="outline"
              render={<Link href={`/admin/erp/expenses/${expenseId}/edit`} />}
            >
              Edit
            </Button>
          </div>
        }
      />

      {billError ? <p className="text-sm text-destructive">{billError}</p> : null}

      <ErpDocumentTabsLayout
        detailsLabel="Expense details"
        entityId={expenseId}
        auditEntityType="expense"
        journalSourceType="expense"
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Expense details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
              <DetailItem
                label="Expense amount"
                value={formatCurrencyAmount(expense.total_amount)}
              />
              <DetailItem label="Expense date" value={formatDisplayDate(expense.expense_date)} />
              <DetailItem label="Tax %" value={String(expense.tax_percent)} />
              <DetailItem
                label="Tax amount"
                value={`${formatCurrencyAmount(expense.tax_amount)} (${taxModeLabel(expense.tax_mode)})`}
              />
              <DetailItem
                label="Expense account"
                value={expense.account_name ?? "—"}
                className="sm:col-span-2"
              />
              <DetailItem
                label="Paid through account"
                value={expense.paid_through_name ?? "—"}
              />
              <DetailItem label="Reference #" value={expense.reference ?? "—"} />
              <DetailItem label="Vendor" value={expense.vendor_name ?? "—"} />
              <DetailItem label="Customer" value={expense.customer_name ?? "—"} />
              <DetailItem
                label="Billable"
                value={
                  expense.is_billable
                    ? expense.billed_invoice_id
                      ? "Invoiced"
                      : "Yes — pending invoice"
                    : "No"
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {expense.notes?.trim() || "No notes."}
              </p>
            </CardContent>
            <CardHeader className="border-t">
              <CardTitle>Paid to</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {expense.vendor_name ?? expense.customer_name ?? "—"}
            </CardContent>
          </Card>
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
