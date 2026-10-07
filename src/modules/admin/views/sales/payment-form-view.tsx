"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import type { PaidThroughAccountOption } from "@/common/erp/sales-types";
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
  userId: string;
  customerName: string | null;
  balanceDue: number;
  amount: number;
  receiptRef: string;
};

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
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode: "create" });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isModal = variant === "modal";

  const [depositAccounts, setDepositAccounts] = useState<PaidThroughAccountOption[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<PaidThroughAccountOption[]>([]);
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
    if (!effectiveStoreId) return;
    adminGet<{ data: PaidThroughAccountOption[] }>(
      `erp/payments?view=accounts&storeId=${encodeURIComponent(effectiveStoreId)}`,
    ).then((res) => setDepositAccounts(res.data ?? []));
    adminGet<{ data: PaidThroughAccountOption[] }>(
      `erp/payments?view=expense-accounts&storeId=${encodeURIComponent(effectiveStoreId)}`,
    ).then((res) => setExpenseAccounts(res.data ?? []));
  }, [effectiveStoreId]);

  useEffect(() => {
    if (!preselectedInvoiceId || !effectiveStoreId) return;
    adminGet<InvoiceDetail>(`erp/invoices/${preselectedInvoiceId}`).then((detail) => {
      const balance = detail.balance_due ?? 0;
      if (balance <= 0) return;
      setLines([
        {
          invoiceId: detail.id,
          invoiceNumber: detail.invoice_number,
          userId: detail.user_id,
          customerName: invoiceCustomerLabel(detail),
          balanceDue: balance,
          amount: balance,
          receiptRef: "",
        },
      ]);
    });
  }, [preselectedInvoiceId, effectiveStoreId]);

  const total = lines.reduce((s, l) => s + l.amount, 0);
  const bankChargesAmount = parseFloat(bankCharges) || 0;

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

  async function addLine() {
    const amt = parseFloat(lineAmount);
    if (!selectedInvoiceId) return setError("Select an invoice.");
    if (!amt || amt <= 0) return setError("Enter a positive amount.");
    if (lines.some((l) => l.invoiceId === selectedInvoiceId)) {
      return setError("Invoice already added.");
    }
    if (amt > selectedInvoiceBalance) return setError("Amount exceeds invoice balance.");

    let userId: string;
    try {
      const detail = await adminGet<InvoiceDetail>(`erp/invoices/${selectedInvoiceId}`);
      userId = detail.user_id;
    } catch {
      return setError("Could not load invoice details.");
    }

    const firstUser = lines[0]?.userId;
    if (firstUser && firstUser !== userId) {
      return setError("All invoices must belong to the same customer on a single payment.");
    }

    setLines((prev) => [
      ...prev,
      {
        invoiceId: selectedInvoiceId,
        invoiceNumber: invoiceLabel,
        userId,
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (lines.length === 0) return setError("Add at least one invoice payment.");
    if (!accountId) return setError("Deposit account is required.");
    if (!effectiveStoreId) return setError(storeRequiredMessage ?? "Store is required.");
    if (bankChargesAmount >= total) return setError("Bank charges must be less than total payment.");
    if (bankChargesAmount > 0 && !bankChargesAccountId) {
      return setError("Expense account is required for bank charges.");
    }

    const userId = lines[0].userId;
    if (lines.some((l) => l.userId !== userId)) {
      return setError("All invoices must belong to the same customer.");
    }

    startTransition(async () => {
      try {
        const res = await adminPost<{ id: string }>("erp/payments", {
          userId,
          storeId: effectiveStoreId,
          paymentDate,
          paymentMode,
          accountId,
          totalAmount: total,
          bankCharges: bankChargesAmount,
          bankChargesAccountId: bankChargesAmount > 0 ? bankChargesAccountId : undefined,
          reference: reference.trim() || undefined,
          notes: notes.trim() || undefined,
          allocations: lines.map((l) => ({
            invoiceId: l.invoiceId,
            amount: l.amount,
          })),
        });
        handleSuccessNavigate(res.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to record payment");
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
              <AdminFormField label="Deposit to" required className="sm:col-span-2">
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
              <AdminFormField label="Notes" className="sm:col-span-2">
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
                  min="0"
                  step="0.01"
                  placeholder="Amount"
                  value={lineAmount}
                  onChange={(e) => setLineAmount(e.target.value)}
                />
              </AdminFormField>
            </AdminFormGrid>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void addLine()}>
                Add invoice
              </Button>
              {selectedInvoiceBalance > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setLineAmount(String(selectedInvoiceBalance))}
                >
                  Pay full balance
                </Button>
              ) : null}
            </div>
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

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        {!isModal ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Link href="/admin/erp/payments" className={buttonVariants({ variant: "outline" })}>
              Cancel
            </Link>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Record payment"}
            </Button>
          </div>
        ) : null}
      </form>
    </AdminFormShell>
  );
}
