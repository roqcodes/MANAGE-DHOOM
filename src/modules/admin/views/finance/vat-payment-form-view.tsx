"use client";

import { useEffect, useId, useState, useTransition } from "react";
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
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import {
  AdminFormActions,
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  AdminFormShell,
  type ErpFormViewBaseProps,
} from "@/modules/admin/ui";
import { Button, buttonVariants } from "@/components/ui/button";
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
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isModal = variant === "modal";

  const [vatReturn, setVatReturn] = useState<VatReturnDetail | null>(null);
  const [accounts, setAccounts] = useState<PaidThroughAccountOption[]>([]);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [paymentType, setPaymentType] = useState<string>(ERP_VAT_PAYMENT_TYPES[0]);
  const [paidFromAccountId, setPaidFromAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!vatReturnId) {
      setLoading(false);
      return;
    }

    adminGet<VatReturnDetail>(`erp/vat-returns/${vatReturnId}`)
      .then((detail) => {
        setVatReturn(detail);
        setAmount(String(detail.balance_due));
        const q = detail.store_id
          ? `?view=accounts&storeId=${encodeURIComponent(detail.store_id)}`
          : "?view=accounts";
        return adminGet<{ data: PaidThroughAccountOption[] }>(`erp/vat-payments${q}`);
      })
      .then((res) => {
        if (res) setAccounts(res.data);
      })
      .finally(() => setLoading(false));
  }, [vatReturnId]);

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
    if (!vatReturnId) return setError("VAT return is required.");
    if (!paidFromAccountId) return setError("Paid from account is required.");
    const amt = parseFloat(amount);
    if (!amt || amt === 0) return setError("Amount is required.");

    startTransition(async () => {
      try {
        await adminPost("erp/vat-payments", {
          vatReturnId,
          paymentDate,
          paymentType,
          paidFromAccountId,
          amount: amt,
          reference: reference.trim() || undefined,
          notes: notes.trim() || undefined,
        });
        handleSuccessNavigate();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save VAT payment.");
      }
    });
  }

  if (isModal && !open) return null;

  if (loading) {
    return (
      <AdminFormShell
        variant={variant}
        open={open}
        onOpenChange={onOpenChange}
        title="Add VAT payment"
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
        title="Add VAT payment"
        description="Open this page from a filed VAT return to record a payment."
        backHref="/admin/erp/vat-returns"
        breadcrumb={[
          { label: "VAT returns", href: "/admin/erp/vat-returns" },
          { label: "Add VAT payment" },
        ]}
        size="lg"
      >
        <Link href="/admin/erp/vat-returns" className={buttonVariants({ variant: "outline" })}>
          Back to VAT returns
        </Link>
      </AdminFormShell>
    );
  }

  const title = "Add VAT payment";
  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel="Save VAT payment"
      pending={isPending}
    />
  ) : undefined;

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={`Record payment for ${vatReturn.return_number} (${vatReturn.period_label}).`}
      backHref="/admin/erp/vat-payments"
      breadcrumb={[
        { label: "VAT payments", href: "/admin/erp/vat-payments" },
        { label: "Add VAT payment" },
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
                  <TableHead>Number</TableHead>
                  <TableHead>Tax return</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead className="text-right">Total tax payable</TableHead>
                  <TableHead className="text-right">Balance due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">{vatReturn.return_number}</TableCell>
                  <TableCell>{vatReturn.period_label}</TableCell>
                  <TableCell>
                    {formatDisplayDate(vatReturn.period_start)} -{" "}
                    {formatDisplayDate(vatReturn.period_end)}
                  </TableCell>
                  <TableCell>{vatReturn.store_name ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrencyAmount(vatReturn.total_tax_payable)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrencyAmount(vatReturn.balance_due)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </AdminFormSection>

        <AdminFormSection title="Payment details">
          <AdminFormGrid cols={3}>
            <AdminFormField label="Date" required>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
              />
            </AdminFormField>
            <AdminFormField label="Reference #">
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Reference"
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
            <AdminFormField label="Paid from account" required className="sm:col-span-2">
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
            <AdminFormField label="Amount" required>
              <Input
                type="number"
                step="0.01"
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

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {!isModal ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Link href="/admin/erp/vat-payments" className={buttonVariants({ variant: "outline" })}>
              Cancel
            </Link>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save VAT payment"}
            </Button>
          </div>
        ) : null}
      </form>
    </AdminFormShell>
  );
}
