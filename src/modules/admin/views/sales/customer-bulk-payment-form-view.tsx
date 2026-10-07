"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { ErpInvoiceListRow, PaidThroughAccountOption } from "@/common/erp/sales-types";
import { ERP_CUSTOMER_PAYMENT_MODES, paymentModeLabel } from "@/common/erp/sales-types";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
import {
  AdminFormActions,
  AdminFormColumns,
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  AdminFormShell,
  InvoiceSearchSelect,
  type ErpFormViewBaseProps,
} from "@/modules/admin/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ActiveStoreFormField,
  useActiveStoreFormField,
} from "@/modules/erp/components/use-active-store-form-field";

type PendingLine = {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string | null;
  balanceDue: number;
  amount: number;
  receiptRef: string;
};

export type CustomerBulkPaymentFormViewProps = ErpFormViewBaseProps;

export function CustomerBulkPaymentFormView({
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: CustomerBulkPaymentFormViewProps) {
  const router = useRouter();
  const formId = useId();
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode: "create" });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isModal = variant === "modal";

  const [accounts, setAccounts] = useState<PaidThroughAccountOption[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<PaidThroughAccountOption[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [invoiceLabel, setInvoiceLabel] = useState("");
  const [selectedInvoiceBalance, setSelectedInvoiceBalance] = useState(0);
  const [selectedInvoiceCustomer, setSelectedInvoiceCustomer] = useState<string | null>(null);
  const [lineAmount, setLineAmount] = useState("");
  const [receiptRef, setReceiptRef] = useState("");
  const [fifoAmount, setFifoAmount] = useState("");
  const [lines, setLines] = useState<PendingLine[]>([]);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState<string>(ERP_CUSTOMER_PAYMENT_MODES[0]);
  const [accountId, setAccountId] = useState("");
  const [bankCharges, setBankCharges] = useState("");
  const [bankChargesAccountId, setBankChargesAccountId] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!effectiveStoreId) return;
    adminGet<{ data: PaidThroughAccountOption[] }>(
      `erp/customer-bulk-payments?view=accounts&storeId=${encodeURIComponent(effectiveStoreId)}`,
    ).then((res) => setAccounts(res.data ?? []));
    adminGet<{ data: PaidThroughAccountOption[] }>(
      `erp/customer-bulk-payments?view=expense-accounts&storeId=${encodeURIComponent(effectiveStoreId)}`,
    ).then((res) => setExpenseAccounts(res.data ?? []));
  }, [effectiveStoreId]);

  const total = lines.reduce((s, l) => s + l.amount, 0);
  const bankChargesAmount = parseFloat(bankCharges) || 0;

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/erp/customer-bulk-payments");
    }
  }

  function handleSuccessNavigate(batchId?: string) {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(batchId);
      return;
    }
    router.push(
      batchId
        ? `/admin/erp/customer-bulk-payments/${encodeURIComponent(batchId)}`
        : "/admin/erp/customer-bulk-payments",
    );
  }

  function addLine() {
    const amt = parseFloat(lineAmount);
    if (!selectedInvoiceId) return setError("Select an invoice.");
    if (!amt || amt <= 0) return setError("Enter a positive amount.");
    if (lines.some((l) => l.invoiceId === selectedInvoiceId)) {
      return setError("Invoice already added.");
    }
    if (amt > selectedInvoiceBalance) return setError("Amount exceeds invoice balance.");
    setLines((prev) => [
      ...prev,
      {
        invoiceId: selectedInvoiceId,
        invoiceNumber: invoiceLabel,
        customerName: selectedInvoiceCustomer,
        balanceDue: selectedInvoiceBalance,
        amount: amt,
        receiptRef: receiptRef.trim(),
      },
    ]);
    setLineAmount("");
    setReceiptRef("");
    setSelectedInvoiceId("");
    setInvoiceLabel("");
    setSelectedInvoiceBalance(0);
    setSelectedInvoiceCustomer(null);
    setError(null);
  }

  function removeLine(invoiceId: string) {
    setLines((prev) => prev.filter((l) => l.invoiceId !== invoiceId));
  }

  async function fetchOpenInvoices(): Promise<ErpInvoiceListRow[]> {
    const q = new URLSearchParams({
      page: "0",
      limit: "100",
      openOnly: "1",
      storeId: effectiveStoreId,
    });
    const full = await adminGet<{ data: ErpInvoiceListRow[] }>(`erp/invoices?${q.toString()}`);
    return (full.data ?? []).filter((row) => row.balance_due > 0);
  }

  async function applyFifo() {
    setError(null);
    const amount = parseFloat(fifoAmount);
    if (!effectiveStoreId) return setError(storeRequiredMessage ?? "Store is required.");
    if (!amount || amount <= 0) return setError("Enter a positive FIFO amount.");

    try {
      const exclude = lines.map((l) => l.invoiceId).join(",");
      const res = await adminGet<{
        allocations: Array<{ invoiceId: string; amount: number }>;
      }>(
        `erp/customer-bulk-payments?view=fifo&storeId=${encodeURIComponent(effectiveStoreId)}&amount=${amount}&exclude=${encodeURIComponent(exclude)}`,
      );

      const openInvoices = await fetchOpenInvoices();
      const lookup = new Map(openInvoices.map((row) => [row.id, row]));
      const newLines: PendingLine[] = [];

      for (const alloc of res.allocations) {
        if (lines.some((line) => line.invoiceId === alloc.invoiceId)) continue;
        const invoice = lookup.get(alloc.invoiceId);
        if (!invoice) continue;
        newLines.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          customerName: invoice.customer_name,
          balanceDue: invoice.balance_due,
          amount: alloc.amount,
          receiptRef: "",
        });
      }

      if (newLines.length === 0) {
        setError("No open invoices available for FIFO allocation.");
        return;
      }

      setLines((prev) => [...prev, ...newLines]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "FIFO allocation failed.");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lines.length === 0) return setError("Add at least one invoice payment.");
    if (!accountId) return setError("Deposit account is required.");
    if (!effectiveStoreId) return setError(storeRequiredMessage ?? "Store is required.");
    if (bankChargesAmount >= total) return setError("Bank charges must be less than total payment.");
    if (bankChargesAmount > 0 && !bankChargesAccountId) {
      return setError("Expense account is required for bank charges.");
    }

    startTransition(async () => {
      try {
        const res = await adminPost<{ batchId: string }>("erp/customer-bulk-payments", {
          storeId: effectiveStoreId,
          paymentDate,
          paymentMode,
          accountId,
          bankCharges: bankChargesAmount,
          bankChargesAccountId: bankChargesAmount > 0 ? bankChargesAccountId : undefined,
          notes: notes || undefined,
          lines: lines.map((l) => ({
            invoiceId: l.invoiceId,
            amount: l.amount,
            receiptRef: l.receiptRef || undefined,
          })),
        });
        handleSuccessNavigate(res.batchId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save bulk payment.");
      }
    });
  }

  if (isModal && !open) return null;

  const title = "Bulk payment";
  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel="Save bulk payment"
      pending={isPending}
    />
  ) : undefined;

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Apply one deposit across multiple customer invoices."
      backHref="/admin/erp/customer-bulk-payments"
      breadcrumb={[
        { label: "Payment bulk", href: "/admin/erp/customer-bulk-payments" },
        { label: "Add bulk payment" },
      ]}
      size="landscape"
      formId={formId}
      footer={footer}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <AdminFormColumns cols={2}>
          <AdminFormSection title="Payment details">
            <AdminFormGrid cols={3}>
              <AdminFormField label="Store" required>
                <ActiveStoreFormField
                  mode="create"
                  stores={stores}
                  activeStoreId={activeStoreId}
                  storeId={storeId}
                  onStoreIdChange={setStoreId}
                  label=""
                />
              </AdminFormField>
              <AdminFormField label="Payment date" required>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </AdminFormField>
              <AdminFormField label="Payment mode">
                <select
                  className="h-9 w-full rounded-md border px-3 text-sm"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                >
                  {ERP_CUSTOMER_PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {paymentModeLabel(m)}
                    </option>
                  ))}
                </select>
              </AdminFormField>
              <AdminFormField label="Deposit to" required className="sm:col-span-2">
                <select
                  className="h-9 w-full rounded-md border px-3 text-sm"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  required
                >
                  <option value="">Select account</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </AdminFormField>
              <AdminFormField label="Bank charges">
                <Input
                  type="number"
                  step="0.01"
                  value={bankCharges}
                  onChange={(e) => setBankCharges(e.target.value)}
                />
              </AdminFormField>
              <AdminFormField label="Bank charges account">
                <select
                  className="h-9 w-full rounded-md border px-3 text-sm"
                  value={bankChargesAccountId}
                  onChange={(e) => setBankChargesAccountId(e.target.value)}
                >
                  <option value="">Select expense account</option>
                  {expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </AdminFormField>
              <AdminFormField label="Notes" className="sm:col-span-2">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </AdminFormField>
            </AdminFormGrid>
          </AdminFormSection>

          <AdminFormSection title="Add invoice payment">
            <AdminFormGrid cols={1}>
              <AdminFormField label="Invoice" required>
                <InvoiceSearchSelect
                  value={selectedInvoiceId || null}
                  selectedLabel={invoiceLabel || undefined}
                  storeId={effectiveStoreId || undefined}
                  openOnly
                  disabled={!effectiveStoreId}
                  onChange={(id, option) => {
                    setSelectedInvoiceId(id ?? "");
                    setInvoiceLabel(option?.label ?? "");
                    setSelectedInvoiceCustomer(option?.sublabel ?? null);
                    const balance = option?.amount ?? 0;
                    setSelectedInvoiceBalance(balance);
                    if (id && balance > 0) setLineAmount(String(balance));
                    if (!id) setLineAmount("");
                  }}
                />
              </AdminFormField>
              {selectedInvoiceId ? (
                <p className="text-sm text-muted-foreground">
                  Balance due: {formatCurrencyAmount(selectedInvoiceBalance)}
                  {selectedInvoiceCustomer ? ` · ${selectedInvoiceCustomer}` : ""}
                </p>
              ) : null}
              <AdminFormField label="Receipt #">
                <Input
                  placeholder="Receipt #"
                  value={receiptRef}
                  onChange={(e) => setReceiptRef(e.target.value)}
                />
              </AdminFormField>
              <AdminFormField label="Amount">
                <Input
                  type="number"
                  placeholder="Amount"
                  value={lineAmount}
                  onChange={(e) => setLineAmount(e.target.value)}
                />
              </AdminFormField>
            </AdminFormGrid>
            <div className="mt-3">
              <Button type="button" variant="outline" onClick={addLine}>
                Add invoice
              </Button>
            </div>
          </AdminFormSection>
        </AdminFormColumns>

        <AdminFormSection title="FIFO allocation">
          <div className="flex flex-wrap items-end gap-2">
            <AdminFormField label="Amount to allocate (oldest invoices first)" className="min-w-[200px]">
              <Input
                type="number"
                value={fifoAmount}
                onChange={(e) => setFifoAmount(e.target.value)}
                className="w-40"
              />
            </AdminFormField>
            <Button type="button" variant="secondary" onClick={() => void applyFifo()}>
              Apply FIFO
            </Button>
          </div>
        </AdminFormSection>

        {lines.length > 0 ? (
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Receipt #</TableHead>
                    <TableHead className="text-right">Due</TableHead>
                    <TableHead className="text-right">Paying</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.invoiceId}>
                      <TableCell>{l.invoiceNumber}</TableCell>
                      <TableCell>{l.customerName ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{l.receiptRef || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrencyAmount(l.balanceDue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrencyAmount(l.amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatCurrencyAmount(Math.max(0, l.balanceDue - l.amount))}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="text-xs text-rose-600"
                          onClick={() => removeLine(l.invoiceId)}
                        >
                          Remove
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-sm font-medium">Total: {formatCurrencyAmount(total)}</p>
            </CardContent>
          </Card>
        ) : null}

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        {!isModal ? (
          <div className="flex gap-2">
            <Link
              href="/admin/erp/customer-bulk-payments"
              className={buttonVariants({ variant: "outline" })}
            >
              Cancel
            </Link>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save bulk payment"}
            </Button>
          </div>
        ) : null}
      </form>
    </AdminFormShell>
  );
}
