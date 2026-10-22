"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { ERP_CUSTOMER_PAYMENT_MODES, paymentModeLabel } from "@/common/erp/sales-types";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { usePaymentAccountOptions } from "@/modules/erp/components/use-payment-account-options";
import { formatCurrencyAmount } from "@/lib/format-currency";
import {
  formatDisplayDecimal,
  parsePaymentAmount,
  quantizePaymentAmount,
} from "@/lib/decimal-precision";
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
  sumPaymentAmounts,
  validateFifoAllocationAmount,
  validatePaymentLinesBalance,
  validateSingleDocumentPaymentAmount,
} from "@/modules/erp/lib/payment-balance-validation";

type PendingLine = {
  invoiceId: string;
  invoiceNumber: string;
  userId: string;
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
    const amount = quantizePaymentAmount(
      Math.min(existing.balanceDue, existing.amount + line.amount),
    );
    byInvoiceId.set(line.invoiceId, { ...existing, amount });
  }

  return Array.from(byInvoiceId.values());
}

type InvoiceDetail = {
  id: string;
  user_id: string;
  balance_due: number;
  invoice_number: string;
  store_id: string | null;
  users: { name: string | null; email: string | null } | null;
};

export type PaymentFormViewProps = ErpFormViewBaseProps;

function invoiceCustomerLabel(detail: InvoiceDetail) {
  return detail.users?.name ?? detail.users?.email ?? "";
}

export function PaymentFormView({
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: PaymentFormViewProps) {
  const router = useRouter();
  const formId = useId();
  const searchParams = useSearchParams();
  const preselectedInvoiceId = searchParams.get("invoiceId") ?? "";
  const preselectedCustomerId = searchParams.get("customerId") ?? "";
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode: "create" });
  const [pending, startTransition] = useTransition();
  const [isAddingLine, setIsAddingLine] = useState(false);
  const isModal = variant === "modal";
  const { inlineError, setFormError, notifyAmountIssue, clearFormError } =
    useErpPaymentFormErrors(isModal);

  const { data: accountOptions } = usePaymentAccountOptions(effectiveStoreId);
  const depositAccounts = accountOptions?.depositAccounts ?? [];
  const expenseAccounts = accountOptions?.expenseAccounts ?? [];
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
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!preselectedInvoiceId || !effectiveStoreId) return;
    adminGet<InvoiceDetail>(`erp/invoices/${preselectedInvoiceId}`).then((detail) => {
      const balance = detail.balance_due ?? 0;
      if (balance <= 0) return;
      setUserId(detail.user_id);
      setCustomerLabel(invoiceCustomerLabel(detail));
      setLines([
        {
          invoiceId: detail.id,
          invoiceNumber: detail.invoice_number,
          userId: detail.user_id,
          customerName: invoiceCustomerLabel(detail),
          balanceDue: balance,
          amount: quantizePaymentAmount(balance),
          receiptRef: "",
        },
      ]);
    });
  }, [preselectedInvoiceId, effectiveStoreId]);

  useEffect(() => {
    if (!preselectedCustomerId || preselectedInvoiceId) return;
    setUserId(preselectedCustomerId);
  }, [preselectedCustomerId, preselectedInvoiceId]);

  const total = sumPaymentAmounts(lines);
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
      router.push("/admin/erp/payments");
    }
  }

  function handleSuccessNavigate(id?: string) {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(id);
      return;
    }
    router.push(id ? `/admin/erp/payments/${id}` : "/admin/erp/payments");
  }

  async function buildFifoLines(
    amount: number,
    excludeInvoiceIds: string[],
    customerUserId: string,
  ): Promise<PendingLine[]> {
    if (!effectiveStoreId) return [];
    const exclude = excludeInvoiceIds.join(",");
    const res = await adminGet<{
      allocations: Array<{
        invoiceId?: string;
        invoice_id?: string;
        amount: number;
        invoiceNumber?: string;
        balanceDue?: number;
      }>;
    }>(
      `erp/payments?view=fifo&storeId=${encodeURIComponent(effectiveStoreId)}&userId=${encodeURIComponent(customerUserId)}&amount=${amount}&exclude=${encodeURIComponent(exclude)}`,
    );
    const pending: PendingLine[] = [];

    for (const alloc of res.allocations) {
      const invoiceId = alloc.invoiceId ?? alloc.invoice_id;
      if (!invoiceId || excludeInvoiceIds.includes(invoiceId)) continue;
      pending.push({
        invoiceId,
        invoiceNumber: alloc.invoiceNumber ?? invoiceId,
        userId: customerUserId,
        customerName: customerLabel || selectedInvoiceCustomer,
        balanceDue: Number(alloc.balanceDue ?? alloc.amount),
        amount: alloc.amount,
        receiptRef: receiptRef.trim(),
      });
    }

    return pending;
  }

  async function addLine() {
    clearFormError();
    const amt = parsePaymentAmount(lineAmount);
    if (!userId) return setFormError("Select a customer.");
    if (!amt || amt <= 0) return setFormError("Enter a positive amount.");
    if (!effectiveStoreId) return setFormError(storeRequiredMessage ?? "Store is required.");

    const firstUser = lines[0]?.userId;
    if (firstUser && firstUser !== userId) {
      return setFormError("All invoices must belong to the same customer on a single payment.");
    }

    setIsAddingLine(true);
    try {
      if (!selectedInvoiceId) {
        const fifoLines = await buildFifoLines(amt, lines.map((l) => l.invoiceId), userId);
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
            userId,
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
    setFormError(null);
    if (!accountId) return setFormError("Deposit account is required.");
    if (!effectiveStoreId) return setFormError(storeRequiredMessage ?? "Store is required.");

    const fifoOnlyAmount = parsePaymentAmount(lineAmount);
    const useFifoAutoAllocate = lines.length === 0 && userId && fifoOnlyAmount > 0;
    const paymentTotal = useFifoAutoAllocate ? fifoOnlyAmount : total;

    if (!useFifoAutoAllocate && lines.length === 0) {
      return setFormError(
        "Add at least one invoice payment, or select a customer and amount to allocate FIFO.",
      );
    }
    if (bankChargesAmount >= paymentTotal) return setFormError("Bank charges must be less than total payment.");
    if (bankChargesAmount > 0 && !bankChargesAccountId) {
      return setFormError("Expense account is required for bank charges.");
    }

    const paymentUserId = useFifoAutoAllocate ? userId : lines[0].userId;
    if (!useFifoAutoAllocate && lines.some((l) => l.userId !== paymentUserId)) {
      return setFormError("All invoices must belong to the same customer.");
    }

    const linesBalanceErr = validatePaymentLinesBalance(
      lines.map((l) => ({
        amount: l.amount,
        balanceDue: l.balanceDue,
        label: l.invoiceNumber,
      })),
      "invoice",
    );
    if (!useFifoAutoAllocate && linesBalanceErr) {
      notifyAmountIssue(linesBalanceErr);
      return;
    }

    startTransition(async () => {
      try {
        if (useFifoAutoAllocate) {
          const fifoLines = await buildFifoLines(fifoOnlyAmount, [], paymentUserId);
          const fifoErr = validateFifoAllocationAmount(fifoOnlyAmount, fifoLines, "invoice");
          if (fifoErr) {
            notifyAmountIssue(fifoErr);
            return;
          }
        }

        const res = await adminPost<{ id: string }>("erp/payments", {
          userId: paymentUserId,
          storeId: effectiveStoreId,
          paymentDate,
          paymentMode,
          accountId,
          totalAmount: quantizePaymentAmount(paymentTotal),
          bankCharges: bankChargesAmount,
          bankChargesAccountId: bankChargesAmount > 0 ? bankChargesAccountId : undefined,
          reference: reference.trim() || undefined,
          notes: notes.trim() || undefined,
          autoAllocate: useFifoAutoAllocate,
          allocations: useFifoAutoAllocate
            ? []
            : lines.map((l) => ({
                invoiceId: l.invoiceId,
                amount: quantizePaymentAmount(l.amount),
              })),
        });
        handleSuccessNavigate(res.id);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Failed to record payment");
      }
    });
  }

  if (isModal && !open) return null;

  const title = "Payment received";
  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel="Record payment"
      pending={pending}
      submitDisabled={submitBlocked}
    />
  ) : undefined;

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Record a customer payment against one or more invoices."
      backHref="/admin/erp/payments"
      breadcrumb={[
        { label: "Payments", href: "/admin/erp/payments" },
        { label: title },
      ]}
      size="landscape"
      formId={formId}
      footer={footer}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
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
                  required
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
                  {depositAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </AdminFormField>
              <AdminFormField label="Bank charges">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bankCharges}
                  onChange={(e) => setBankCharges(e.target.value)}
                  placeholder="0.00"
                />
              </AdminFormField>
              <AdminFormField label="Bank charges account">
                <select
                  className="h-9 w-full rounded-md border px-3 text-sm"
                  value={bankChargesAccountId}
                  onChange={(e) => setBankChargesAccountId(e.target.value)}
                >
                  <option value="">Select expense account</option>
                  {expenseAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </AdminFormField>
              <AdminFormField label="Reference">
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Cheque / transaction ref"
                />
              </AdminFormField>
              <AdminFormField label="Notes" className="sm:col-span-2 lg:col-span-2">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Internal notes (optional)"
                />
              </AdminFormField>
            </AdminFormGrid>
          </AdminFormSection>

          <AdminFormSection title="Add invoice payment">
            <AdminFormGrid cols={1}>
              <AdminFormField label="Customer" required>
                <CustomerSearchSelect
                  value={userId || null}
                  selectedLabel={customerLabel || undefined}
                  disabled={!effectiveStoreId}
                  onChange={(id, option) => {
                    setUserId(id ?? "");
                    setCustomerLabel(option?.label ?? "");
                    setLines([]);
                    setSelectedInvoiceId("");
                    setInvoiceLabel("");
                    setSelectedInvoiceBalance(0);
                    setSelectedInvoiceCustomer(null);
                    setLineAmount("");
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
                    if (id && balance > 0) setLineAmount(formatDisplayDecimal(balance));
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
                    min="0"
                    step="0.001"
                    placeholder="Amount"
                    value={lineAmount}
                    onChange={(e) => {
                      setLineAmount(e.target.value);
                      clearFormError();
                    }}
                    onBlur={() => {
                      const parsed = parsePaymentAmount(lineAmount);
                      if (Number.isFinite(parsed) && parsed > 0) {
                        setLineAmount(formatDisplayDecimal(parsed));
                      }
                      if (!selectedInvoiceId) return;
                      const amt = parsePaymentAmount(lineAmount);
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
              </Table>
              <p className="mt-3 text-sm font-medium">Total: {formatCurrencyAmount(total)}</p>
            </CardContent>
          </Card>
        ) : null}

        <PaymentFormInlineAlert message={inlineError} />

        {!isModal ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Link href="/admin/erp/payments" className={buttonVariants({ variant: "outline" })}>
              Cancel
            </Link>
            <Button type="submit" disabled={pending || submitBlocked}>
              {pending ? "Saving…" : "Record payment"}
            </Button>
          </div>
        ) : null}
      </form>
    </AdminFormShell>
  );
}
