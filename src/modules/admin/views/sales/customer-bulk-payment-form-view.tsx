"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import type { PaidThroughAccountOption, ReceivableInvoiceRow } from "@/common/erp/sales-types";
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
  CustomerSearchSelect,
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ActiveStoreFormField,
  useActiveStoreFormField,
} from "@/modules/erp/components/use-active-store-form-field";
import { PaymentFormInlineAlert } from "@/modules/erp/components/payment-form-inline-alert";
import { useErpPaymentFormErrors } from "@/modules/erp/hooks/use-erp-payment-form-errors";
import {
  usePaymentFormAddLineBlocked,
  usePaymentFormSubmitBlocked,
} from "@/modules/erp/hooks/use-payment-form-submit-blocked";
import {
  validateFifoAllocationAmount,
  validatePaymentLinesBalance,
  validateSingleDocumentPaymentAmount,
} from "@/modules/erp/lib/payment-balance-validation";

type PendingLine = {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string | null;
  balanceDue: number;
  amount: number;
  receiptRef: string;
};

function mergePendingLines(prev: PendingLine[], incoming: PendingLine[]): PendingLine[] {
  const byInvoiceId = new Map<string, PendingLine>();

  for (const line of [...prev, ...incoming]) {
    const existing = byInvoiceId.get(line.invoiceId);
    if (!existing) {
      byInvoiceId.set(line.invoiceId, line);
      continue;
    }
    const amount = Math.min(existing.balanceDue, existing.amount + line.amount);
    byInvoiceId.set(line.invoiceId, { ...existing, amount });
  }

  return Array.from(byInvoiceId.values());
}

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
  const [isAddingLine, setIsAddingLine] = useState(false);
  const isModal = variant === "modal";
  const { inlineError, setFormError, notifyAmountIssue, clearFormError } =
    useErpPaymentFormErrors(isModal);

  const [accounts, setAccounts] = useState<PaidThroughAccountOption[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<PaidThroughAccountOption[]>([]);
  const [userId, setUserId] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [invoiceLabel, setInvoiceLabel] = useState("");
  const [selectedInvoiceBalance, setSelectedInvoiceBalance] = useState(0);
  const [selectedInvoiceCustomer, setSelectedInvoiceCustomer] = useState<string | null>(null);
  const [lineAmount, setLineAmount] = useState("");
  const [receiptRef, setReceiptRef] = useState("");
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

  const lineTotals = useMemo(
    () =>
      lines.reduce(
        (acc, l) => ({
          due: acc.due + l.balanceDue,
          paying: acc.paying + l.amount,
          remaining: acc.remaining + Math.max(0, l.balanceDue - l.amount),
        }),
        { due: 0, paying: 0, remaining: 0 },
      ),
    [lines],
  );
  const total = lineTotals.paying;
  const bankChargesAmount = parseFloat(bankCharges) || 0;

  const amountGuardInput = {
    inlineError,
    lineAmount,
    documentKind: "invoice" as const,
    selectedDocumentId: selectedInvoiceId,
    selectedDocumentBalance: selectedInvoiceBalance,
    selectedDocumentLabel: invoiceLabel,
    lines: lines.map((l) => ({
      amount: l.amount,
      balanceDue: l.balanceDue,
      label: l.invoiceNumber,
    })),
  };
  const submitBlocked = usePaymentFormSubmitBlocked(amountGuardInput);
  const addLineBlocked = usePaymentFormAddLineBlocked(amountGuardInput);

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

  async function buildFifoLines(amount: number, excludeInvoiceIds: string[]): Promise<PendingLine[]> {
    if (!effectiveStoreId || !userId) return [];
    const exclude = excludeInvoiceIds.join(",");
    const res = await adminGet<{
      allocations: Array<{
        invoiceId?: string;
        invoice_id?: string;
        amount: number;
      }>;
    }>(
      `erp/customer-bulk-payments?view=fifo&storeId=${encodeURIComponent(effectiveStoreId)}&userId=${encodeURIComponent(userId)}&amount=${amount}&exclude=${encodeURIComponent(exclude)}`,
    );

    const receivable = await adminGet<{ data: ReceivableInvoiceRow[] }>(
      `erp/payments?view=receivable-invoices&userId=${encodeURIComponent(userId)}&storeId=${encodeURIComponent(effectiveStoreId)}`,
    );
    const lookup = new Map((receivable.data ?? []).map((row) => [row.id, row]));
    const pending: PendingLine[] = [];

    for (const alloc of res.allocations) {
      const invoiceId = alloc.invoiceId ?? alloc.invoice_id;
      if (!invoiceId || excludeInvoiceIds.includes(invoiceId)) continue;
      const invoice = lookup.get(invoiceId);
      if (!invoice) continue;
      pending.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        customerName: customerLabel || null,
        balanceDue: invoice.balance_due,
        amount: alloc.amount,
        receiptRef: receiptRef.trim(),
      });
    }

    return pending;
  }

  async function addLine() {
    clearFormError();
    const amt = parseFloat(lineAmount);
    if (!amt || amt <= 0) return setFormError("Enter a positive amount.");
    if (!effectiveStoreId) return setFormError(storeRequiredMessage ?? "Store is required.");

    setIsAddingLine(true);
    try {
      if (!userId) {
        setFormError("Select a customer before applying FIFO or adding an invoice.");
        return;
      }

      if (!selectedInvoiceId) {
        const fifoLines = await buildFifoLines(amt, lines.map((l) => l.invoiceId));
        if (fifoLines.length === 0) {
          setFormError("No open invoices available for FIFO allocation.");
          return;
        }
        const fifoErr = validateFifoAllocationAmount(amt, fifoLines, "invoice");
        if (fifoErr) {
          notifyAmountIssue(fifoErr);
          return;
        }
        setLines((prev) => mergePendingLines(prev, fifoLines));
        setLineAmount("");
        setFormError(null);
        return;
      }

      if (lines.some((l) => l.invoiceId === selectedInvoiceId)) {
        setFormError("Invoice already added.");
        return;
      }
      const exceedsMsg = validateSingleDocumentPaymentAmount(
        amt,
        selectedInvoiceBalance,
        "invoice",
        invoiceLabel,
      );
      if (exceedsMsg) {
        notifyAmountIssue(exceedsMsg);
        return;
      }
      setLines((prev) =>
        mergePendingLines(prev, [
          {
            invoiceId: selectedInvoiceId,
            invoiceNumber: invoiceLabel,
            customerName: selectedInvoiceCustomer ?? (customerLabel || null),
            balanceDue: selectedInvoiceBalance,
            amount: amt,
            receiptRef: receiptRef.trim(),
          },
        ]),
      );
      setLineAmount("");
      setReceiptRef("");
      setSelectedInvoiceId("");
      setInvoiceLabel("");
      setSelectedInvoiceBalance(0);
      setSelectedInvoiceCustomer(null);
      setFormError(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to add invoice payment.");
    } finally {
      setIsAddingLine(false);
    }
  }

  function removeLine(invoiceId: string) {
    setLines((prev) => prev.filter((l) => l.invoiceId !== invoiceId));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lines.length === 0) return setFormError("Add at least one invoice payment.");
    const linesBalanceErr = validatePaymentLinesBalance(
      lines.map((l) => ({
        amount: l.amount,
        balanceDue: l.balanceDue,
        label: l.invoiceNumber,
      })),
      "invoice",
    );
    if (linesBalanceErr) {
      notifyAmountIssue(linesBalanceErr);
      return;
    }
    if (!accountId) return setFormError("Deposit account is required.");
    if (!effectiveStoreId) return setFormError(storeRequiredMessage ?? "Store is required.");
    if (bankChargesAmount >= total) return setFormError("Bank charges must be less than total payment.");
    if (bankChargesAmount > 0 && !bankChargesAccountId) {
      return setFormError("Expense account is required for bank charges.");
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
        setFormError(err instanceof Error ? err.message : "Failed to save bulk payment.");
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
      submitDisabled={submitBlocked}
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
        <AdminFormColumns cols={2} columnRatio="2:1">
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
              <AdminFormField label="Deposit to" required>
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
              <AdminFormField label="Notes" className="sm:col-span-2 lg:col-span-3">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </AdminFormField>
            </AdminFormGrid>
          </AdminFormSection>

          <AdminFormSection title="Add invoice payment">
            <AdminFormGrid cols={1}>
              <AdminFormField
                label="Customer"
                required
                hint="Switch customer to add another account's invoices — added lines stay in the table below."
              >
                <CustomerSearchSelect
                  value={userId || null}
                  selectedLabel={customerLabel || undefined}
                  disabled={!effectiveStoreId}
                  onChange={(id, option) => {
                    const prevUserId = userId;
                    const nextUserId = id ?? "";
                    setUserId(nextUserId);
                    if (option?.label !== undefined) {
                      setCustomerLabel(option.label);
                    } else if (!nextUserId) {
                      setCustomerLabel("");
                    }
                    if (nextUserId !== prevUserId) {
                      setSelectedInvoiceId("");
                      setInvoiceLabel("");
                      setSelectedInvoiceBalance(0);
                      setSelectedInvoiceCustomer(null);
                      setLineAmount("");
                    }
                  }}
                />
              </AdminFormField>
              <AdminFormField
                label="Invoice"
                hint="Optional — leave empty to apply the amount FIFO (oldest due first)."
              >
                <InvoiceSearchSelect
                  key={userId || "no-customer"}
                  value={selectedInvoiceId || null}
                  selectedLabel={invoiceLabel || undefined}
                  storeId={effectiveStoreId || undefined}
                  userId={userId || undefined}
                  openOnly
                  disabled={!effectiveStoreId || !userId}
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
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={lineAmount}
                    onChange={(e) => {
                      setLineAmount(e.target.value);
                      clearFormError();
                    }}
                    onBlur={() => {
                      if (!selectedInvoiceId) return;
                      const amt = parseFloat(lineAmount);
                      const msg = validateSingleDocumentPaymentAmount(
                        amt,
                        selectedInvoiceBalance,
                        "invoice",
                        invoiceLabel,
                      );
                      if (msg) notifyAmountIssue(msg);
                    }}
                    className="min-w-0 flex-1"
                    disabled={isAddingLine}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 min-w-[6.5rem] justify-center"
                    disabled={
                      isAddingLine || !effectiveStoreId || addLineBlocked
                    }
                    onClick={() => void addLine()}
                  >
                    {isAddingLine ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        <span className="sr-only">Adding…</span>
                      </>
                    ) : selectedInvoiceId ? (
                      "Add invoice"
                    ) : (
                      "Apply FIFO"
                    )}
                  </Button>
                </div>
              </AdminFormField>
            </AdminFormGrid>
          </AdminFormSection>
        </AdminFormColumns>

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
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="font-medium">Total</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrencyAmount(lineTotals.due)}
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums">
                      {formatCurrencyAmount(lineTotals.paying)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-muted-foreground">
                      {formatCurrencyAmount(lineTotals.remaining)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        ) : null}

        <PaymentFormInlineAlert message={inlineError} />

        {!isModal ? (
          <div className="flex gap-2">
            <Link
              href="/admin/erp/customer-bulk-payments"
              className={buttonVariants({ variant: "outline" })}
            >
              Cancel
            </Link>
            <Button type="submit" disabled={isPending || submitBlocked}>
              {isPending ? "Saving…" : "Save bulk payment"}
            </Button>
          </div>
        ) : null}
      </form>
    </AdminFormShell>
  );
}
