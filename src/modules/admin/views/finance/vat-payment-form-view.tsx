"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";

import {
  ERP_VAT_PAYMENT_TYPES,
  type VatReturnDetail,
} from "@/common/erp/finance-types";
import type { PaidThroughAccountOption } from "@/common/erp/purchasing-types";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { validateVatRefundAmount } from "@/lib/erp/vat-refund-eligibility";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import {
  AdminFormActions,
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  AdminFormShell,
  applyFieldValidation,
  type ErpFormViewBaseProps,
  useFormFieldValidation,
} from "@/modules/admin/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";
import { validateVatPaymentAmount } from "@/modules/erp/lib/payment-balance-validation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatDisplayDate(value: string) {
  try {
    return format(parseISO(value), "dd/MM/yyyy");
  } catch {
    return value;
  }
}

export type VatPaymentFormViewProps = ErpFormViewBaseProps;

export function VatPaymentFormView({
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: VatPaymentFormViewProps) {
  const router = useRouter();
  const formId = useId();
  const searchParams = useSearchParams();
  const vatReturnId = searchParams.get("vatReturnId") ?? "";
  const isRefund = searchParams.get("kind") === "refund";
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | string[] | null>(null);
  const fieldValidation = useFormFieldValidation();
  const isModal = variant === "modal";

  const [vatReturn, setVatReturn] = useState<VatReturnDetail | null>(null);
  const [accounts, setAccounts] = useState<PaidThroughAccountOption[]>([]);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [paymentType, setPaymentType] = useState<string>(ERP_VAT_PAYMENT_TYPES[0]);
  const [paidFromAccountId, setPaidFromAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const defaultAmount = useMemo(() => {
    if (!vatReturn) return "";
    if (isRefund) return String(vatReturn.refund_remaining ?? 0);
    return String(vatReturn.balance_due);
  }, [vatReturn, isRefund]);

  useEffect(() => {
    if (!vatReturnId) {
      setLoading(false);
      return;
    }

    adminGet<VatReturnDetail>(`erp/vat-returns/${vatReturnId}`)
      .then((detail) => {
        setVatReturn(detail);
        setAmount(
          isRefund ? String(detail.refund_remaining ?? 0) : String(detail.balance_due),
        );
        const q = detail.store_id
          ? `?view=accounts&storeId=${encodeURIComponent(detail.store_id)}`
          : "?view=accounts";
        return adminGet<{ data: PaidThroughAccountOption[] }>(`erp/vat-payments${q}`);
      })
      .then((res) => {
        if (res) setAccounts(res.data);
      })
      .finally(() => setLoading(false));
  }, [vatReturnId, isRefund]);

  useEffect(() => {
    if (vatReturn && defaultAmount) setAmount(defaultAmount);
  }, [defaultAmount, vatReturn?.id]);

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/erp/vat-payments");
    }
  }

  function handleSuccessNavigate() {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.();
      return;
    }
    router.push("/admin/erp/vat-payments");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    const refundErr =
      vatReturn && isRefund
        ? validateVatRefundAmount(
            amt,
            vatReturn.recoverable_tax,
            vatReturn.refund_received_total,
          )
        : null;
    const vatErr =
      vatReturn && !isRefund ? validateVatPaymentAmount(amt, vatReturn.balance_due) : null;
    const validationMessages = applyFieldValidation(
      [
        { key: "vatReturn", ok: Boolean(vatReturnId), message: "VAT return is required." },
        {
          key: "paidFromAccount",
          ok: Boolean(paidFromAccountId),
          message: isRefund
            ? "Deposit to account is required."
            : "Paid from account is required.",
        },
        { key: "amount", ok: Boolean(amt && amt !== 0), message: "Amount is required." },
        ...(refundErr ? [{ key: "amount", ok: false, message: refundErr }] : []),
        ...(vatErr ? [{ key: "amount", ok: false, message: vatErr }] : []),
      ],
      fieldValidation.markFieldValidationFailed,
      fieldValidation.clearFieldValidation,
    );
    if (validationMessages) {
      setError(
        validationMessages.length === 1 ? validationMessages[0] : validationMessages,
      );
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        await adminPost("erp/vat-payments", {
          vatReturnId,
          paymentDate,
          paymentType,
          paidFromAccountId,
          amount: amt,
          kind: isRefund ? "refund" : "payment",
          reference: reference.trim() || undefined,
          notes: notes.trim() || undefined,
        });
        handleSuccessNavigate();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save VAT transaction.");
      }
    });
  }

  if (isModal && !open) return null;

  const title = isRefund ? "Record VAT refund received" : "Add VAT payment";
  const description = isRefund
    ? "Record cash or bank received from the tax authority. This is not income — it clears recoverable VAT credit."
    : "Pay tax authority for VAT owed on this return.";

  if (loading) {
    return (
      <AdminFormShell
        variant={variant}
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        size="lg"
        loading
        loadingFallback={<AdminPageSkeleton />}
      >
        {null}
      </AdminFormShell>
    );
  }

  if (!vatReturnId || !vatReturn) {
    if (isModal) return null;
    return (
      <AdminFormShell
        variant={variant}
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        description="Open this page from a filed VAT return."
        backHref="/admin/erp/vat-returns"
        breadcrumb={[
          { label: "VAT returns", href: "/admin/erp/vat-returns" },
          { label: title },
        ]}
        size="lg"
      >
        <Link href="/admin/erp/vat-returns" className={buttonVariants({ variant: "outline" })}>
          Back to VAT returns
        </Link>
      </AdminFormShell>
    );
  }

  if (isRefund && vatReturn.refund_remaining <= 0) {
    return (
      <AdminFormShell
        variant={variant}
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        description="No refundable credit remains on this return."
        size="lg"
      >
        <p className="text-sm text-muted-foreground">
          Recoverable credit: {formatCurrencyAmount(vatReturn.recoverable_tax)} · Already
          received: {formatCurrencyAmount(vatReturn.refund_received_total)}
        </p>
      </AdminFormShell>
    );
  }

  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel={isRefund ? "Record refund received" : "Save VAT payment"}
      pending={isPending}
    />
  ) : undefined;

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={`${description} (${vatReturn.return_number} · ${vatReturn.period_label}).`}
      backHref="/admin/erp/vat-payments"
      breadcrumb={[
        { label: "VAT payments", href: "/admin/erp/vat-payments" },
        { label: title },
      ]}
      size="lg"
      formId={formId}
      footer={footer}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <AdminFormSection title="VAT return summary">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Return</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Tax payable</TableHead>
                  <TableHead className="text-right">Recoverable</TableHead>
                  {isRefund ? (
                    <>
                      <TableHead className="text-right">Refunded</TableHead>
                      <TableHead className="text-right">Remaining</TableHead>
                    </>
                  ) : (
                    <TableHead className="text-right">Balance due</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">{vatReturn.return_number}</TableCell>
                  <TableCell>
                    {formatDisplayDate(vatReturn.period_start)} –{" "}
                    {formatDisplayDate(vatReturn.period_end)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrencyAmount(vatReturn.total_tax_payable)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrencyAmount(vatReturn.recoverable_tax)}
                  </TableCell>
                  {isRefund ? (
                    <>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrencyAmount(vatReturn.refund_received_total)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCurrencyAmount(vatReturn.refund_remaining)}
                      </TableCell>
                    </>
                  ) : (
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrencyAmount(vatReturn.balance_due)}
                    </TableCell>
                  )}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </AdminFormSection>

        <AdminFormSection title={isRefund ? "Refund received" : "Payment details"}>
          <AdminFormGrid cols={3}>
            <AdminFormField label="Date" required>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
              />
            </AdminFormField>
            <AdminFormField label={isRefund ? "Claim / reference #" : "Reference #"}>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={isRefund ? "Authority claim or UTR" : "Reference"}
              />
            </AdminFormField>
            <AdminFormField label="Payment type" required>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                required
              >
                {ERP_VAT_PAYMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </AdminFormField>
            <AdminFormField
              label={isRefund ? "Deposit to account" : "Paid from account"}
              required
              fieldKey="paidFromAccount"
              className="sm:col-span-2"
            >
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={paidFromAccountId}
                onChange={(e) => setPaidFromAccountId(e.target.value)}
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
            <AdminFormField label="Amount" required fieldKey="amount">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </AdminFormField>
            <AdminFormField label="Note" className="sm:col-span-2">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Note"
              />
            </AdminFormField>
          </AdminFormGrid>
        </AdminFormSection>

        <ErrorsFeedbackBridge errors={error} />

        {!isModal ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Link href="/admin/erp/vat-payments" className={buttonVariants({ variant: "outline" })}>
              Cancel
            </Link>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : isRefund ? "Record refund received" : "Save VAT payment"}
            </Button>
          </div>
        ) : null}
      </form>
    </AdminFormShell>
  );
}
