"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { ERP_SUPPLIER_PAYMENT_MODES } from "@/common/erp/purchasing-types";
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
  clearFormSubmitFeedback,
  formErrorsAdapter,
  PurchaseBillSearchSelect,
  validateBeforeFormSave,
  VendorSearchSelect,
  type ErpFormViewBaseProps,
  useFormFieldValidation,
} from "@/modules/admin/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PaymentFormInlineAlert } from "@/modules/erp/components/payment-form-inline-alert";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";
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
  purchaseBillId: string;
  billNumber: string;
  vendorId: string;
  vendorName: string | null;
  balanceDue: number;
  amount: number;
};

function mergePendingLines(prev: PendingLine[], incoming: PendingLine[]): PendingLine[] {
  const byBillId = new Map<string, PendingLine>();

  for (const line of [...prev, ...incoming]) {
    const existing = byBillId.get(line.purchaseBillId);
    if (!existing) {
      byBillId.set(line.purchaseBillId, line);
      continue;
    }
    const amount = quantizePaymentAmount(
      Math.min(existing.balanceDue, existing.amount + line.amount),
    );
    byBillId.set(line.purchaseBillId, { ...existing, amount });
  }

  return Array.from(byBillId.values());
}

export type SupplierPaymentFormViewProps = ErpFormViewBaseProps;

export function SupplierPaymentFormView({
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: SupplierPaymentFormViewProps) {
  const router = useRouter();
  const formId = useId();
  const searchParams = useSearchParams();
  const prefillBillId = searchParams.get("billId") ?? "";
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode: "create" });
  const [isPending, startTransition] = useTransition();
  const submitInFlightRef = useRef(false);
  const paymentIdempotencyRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `idem:${crypto.randomUUID()}`
      : `idem:${Date.now()}`,
  );
  const [isAddingLine, setIsAddingLine] = useState(false);
  const isModal = variant === "modal";
  const { inlineError, setFormError, notifyAmountIssue, clearFormError } =
    useErpPaymentFormErrors(isModal);
  const fieldValidation = useFormFieldValidation();

  const { data: accountOptions } = usePaymentAccountOptions(effectiveStoreId);
  const accounts = accountOptions?.depositAccounts ?? [];
  const expenseAccounts = accountOptions?.expenseAccounts ?? [];
  const [vendorId, setVendorId] = useState("");
  const [vendorLabel, setVendorLabel] = useState("");
  const [selectedBillId, setSelectedBillId] = useState("");
  const [billLabel, setBillLabel] = useState("");
  const [selectedBillBalance, setSelectedBillBalance] = useState(0);
  const [lineAmount, setLineAmount] = useState("");
  const [lines, setLines] = useState<PendingLine[]>([]);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState<string>(ERP_SUPPLIER_PAYMENT_MODES[0]);
  const [accountId, setAccountId] = useState("");
  const [bankCharges, setBankCharges] = useState("");
  const [bankChargesAccountId, setBankChargesAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const preselected = searchParams.get("vendorId");
    if (preselected) setVendorId(preselected);
  }, [searchParams]);

  useEffect(() => {
    if (!prefillBillId || !effectiveStoreId) return;
    adminGet<{
      bill: {
        id: string;
        vendor_id: string;
        balance_due: number;
        purchase_bill_number: string;
        vendors?: { name: string | null } | null;
      };
    }>(`erp/purchase-bills/${prefillBillId}`).then((res) => {
      const bill = res.bill;
      const balance = bill.balance_due ?? 0;
      if (balance <= 0) return;
      setVendorId(bill.vendor_id);
      setVendorLabel(bill.vendors?.name ?? "");
      setLines([
        {
          purchaseBillId: bill.id,
          billNumber: bill.purchase_bill_number,
          vendorId: bill.vendor_id,
          vendorName: bill.vendors?.name ?? null,
          balanceDue: balance,
          amount: quantizePaymentAmount(balance),
        },
      ]);
    });
  }, [prefillBillId, effectiveStoreId]);

  const total = sumPaymentAmounts(lines);
  const bankChargesAmount = parseFloat(bankCharges) || 0;

  const amountGuardInput = {
    inlineError,
    lineAmount,
    documentKind: "bill" as const,
    selectedDocumentId: selectedBillId,
    selectedDocumentBalance: selectedBillBalance,
    selectedDocumentLabel: billLabel,
    lines: lines.map((l) => ({
      amount: l.amount,
      balanceDue: l.balanceDue,
      label: l.billNumber,
    })),
  };
  const submitBlocked = usePaymentFormSubmitBlocked(amountGuardInput);
  const addLineBlocked = usePaymentFormAddLineBlocked(amountGuardInput);

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/erp/supplier-payments");
    }
  }

  function handleSuccessNavigate(id?: string) {
    clearFormSubmitFeedback({
      setFormErrors: formErrorsAdapter(setFormError),
      clearFieldValidation: fieldValidation.clearFieldValidation,
    });
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(id);
      return;
    }
    router.push(id ? `/admin/erp/supplier-payments/${id}` : "/admin/erp/supplier-payments");
  }

  async function buildFifoLines(
    amount: number,
    excludeBillIds: string[],
  ): Promise<PendingLine[]> {
    if (!effectiveStoreId) return [];
    const exclude = excludeBillIds.join(",");
    const res = await adminGet<{
      allocations: Array<{
        purchaseBillId?: string;
        purchase_bill_id?: string;
        amount: number;
        purchaseBillNumber?: string;
        balanceDue?: number;
      }>;
    }>(
      `erp/supplier-payments?view=fifo&storeId=${encodeURIComponent(effectiveStoreId)}&vendorId=${encodeURIComponent(vendorId)}&amount=${amount}&exclude=${encodeURIComponent(exclude)}`,
    );
    const pending: PendingLine[] = [];

    for (const alloc of res.allocations) {
      const purchaseBillId = alloc.purchaseBillId ?? alloc.purchase_bill_id;
      if (!purchaseBillId || excludeBillIds.includes(purchaseBillId)) continue;
      pending.push({
        purchaseBillId,
        billNumber: alloc.purchaseBillNumber ?? purchaseBillId,
        vendorId,
        vendorName: vendorLabel || null,
        balanceDue: Number(alloc.balanceDue ?? alloc.amount),
        amount: alloc.amount,
      });
    }

    return pending;
  }

  async function addLine() {
    clearFormError();
    const amt = parsePaymentAmount(lineAmount);
    if (!vendorId) return setFormError("Select a vendor.");
    if (!amt || amt <= 0) return setFormError("Enter a positive amount.");
    if (!effectiveStoreId) return setFormError(storeRequiredMessage ?? "Store is required.");

    const firstVendor = lines[0]?.vendorId;
    if (firstVendor && firstVendor !== vendorId) {
      return setFormError("All bills must belong to the same vendor on a single payment.");
    }

    setIsAddingLine(true);
    try {
      if (!selectedBillId) {
        const fifoLines = await buildFifoLines(
          amt,
          lines.map((l) => l.purchaseBillId),
        );
        if (fifoLines.length === 0) {
          setFormError("No open bills available for FIFO allocation.");
          return;
        }
        const fifoErr = validateFifoAllocationAmount(amt, fifoLines, "bill");
        if (fifoErr) {
          notifyAmountIssue(fifoErr);
          return;
        }
        setLines((prev) => mergePendingLines(prev, fifoLines));
        setLineAmount("");
        setFormError(null);
        return;
      }

      if (lines.some((l) => l.purchaseBillId === selectedBillId)) {
        setFormError("Bill already added.");
        return;
      }
      const exceedsMsg = validateSingleDocumentPaymentAmount(
        amt,
        selectedBillBalance,
        "bill",
        billLabel,
      );
      if (exceedsMsg) {
        notifyAmountIssue(exceedsMsg);
        return;
      }
      setLines((prev) =>
        mergePendingLines(prev, [
          {
            purchaseBillId: selectedBillId,
            billNumber: billLabel,
            vendorId,
            vendorName: vendorLabel || null,
            balanceDue: selectedBillBalance,
            amount: amt,
          },
        ]),
      );
      setLineAmount("");
      setSelectedBillId("");
      setBillLabel("");
      setSelectedBillBalance(0);
      setFormError(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to add bill payment.");
    } finally {
      setIsAddingLine(false);
    }
  }

  function removeLine(billId: string) {
    setLines((prev) => prev.filter((l) => l.purchaseBillId !== billId));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitInFlightRef.current || isPending) return;

    const fifoOnlyAmount = parsePaymentAmount(lineAmount);
    const useFifoAutoAllocate = lines.length === 0 && vendorId && fifoOnlyAmount > 0;
    const paymentTotal = useFifoAutoAllocate ? fifoOnlyAmount : total;

    if (
      !validateBeforeFormSave(
        [
          { key: "accountId", label: "Paid through", ok: Boolean(accountId) },
          {
            key: "store",
            label: "Store",
            ok: Boolean(effectiveStoreId),
            message: storeRequiredMessage ?? undefined,
          },
          {
            key: "lines",
            label: "Bill payments",
            ok: useFifoAutoAllocate || lines.length > 0,
            message:
              "Add at least one bill payment, or select a vendor and amount to allocate FIFO.",
          },
          {
            key: "bankCharges",
            ok: bankChargesAmount < paymentTotal,
            message: "Bank charges must be less than total payment.",
          },
          {
            key: "bankChargesAccountId",
            label: "Bank charges account",
            ok: bankChargesAmount <= 0 || Boolean(bankChargesAccountId),
          },
        ],
        {
          markFieldValidationFailed: fieldValidation.markFieldValidationFailed,
          clearFieldValidation: fieldValidation.clearFieldValidation,
          setFormErrors: formErrorsAdapter(setFormError),
        },
      )
    ) {
      return;
    }

    const paymentVendorId = useFifoAutoAllocate ? vendorId : lines[0].vendorId;
    if (!useFifoAutoAllocate && lines.some((l) => l.vendorId !== paymentVendorId)) {
      return setFormError("All bills must belong to the same vendor.");
    }

    const linesBalanceErr = validatePaymentLinesBalance(
      lines.map((l) => ({
        amount: l.amount,
        balanceDue: l.balanceDue,
        label: l.billNumber,
      })),
      "bill",
    );
    if (!useFifoAutoAllocate && linesBalanceErr) {
      notifyAmountIssue(linesBalanceErr);
      return;
    }

    submitInFlightRef.current = true;
    startTransition(async () => {
      try {
        if (useFifoAutoAllocate) {
          const fifoLines = await buildFifoLines(fifoOnlyAmount, []);
          const fifoErr = validateFifoAllocationAmount(fifoOnlyAmount, fifoLines, "bill");
          if (fifoErr) {
            notifyAmountIssue(fifoErr);
            return;
          }
        }

        const res = await adminPost<{ id: string }>("erp/supplier-payments", {
          vendorId: paymentVendorId,
          storeId: effectiveStoreId,
          paymentDate,
          paymentMode,
          accountId,
          totalAmount: quantizePaymentAmount(paymentTotal),
          bankCharges: bankChargesAmount,
          bankChargesAccountId: bankChargesAccountId || undefined,
          reference: reference.trim() || paymentIdempotencyRef.current,
          notes: notes || undefined,
          isBulk: false,
          autoAllocate: useFifoAutoAllocate,
          allocations: useFifoAutoAllocate
            ? []
            : lines.map((l) => ({
                purchaseBillId: l.purchaseBillId,
                amount: quantizePaymentAmount(l.amount),
              })),
        });
        handleSuccessNavigate(res.id);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Failed to save payment.");
      } finally {
        submitInFlightRef.current = false;
      }
    });
  }

  if (isModal && !open) return null;

  const title = "Add payment made";
  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel="Save payment"
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
      description="Record a supplier payment against one or more purchase bills."
      backHref="/admin/erp/supplier-payments"
      breadcrumb={[
        { label: "Payments made", href: "/admin/erp/supplier-payments" },
        { label: "Add payment" },
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
                  {ERP_SUPPLIER_PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </AdminFormField>
              <AdminFormField label="Paid through account" required>
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
              <AdminFormField label="Reference #">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Notes" className="sm:col-span-2 lg:col-span-2">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </AdminFormField>
            </AdminFormGrid>
          </AdminFormSection>

          <AdminFormSection title="Add bill payment">
            <AdminFormGrid cols={1}>
              <AdminFormField label="Vendor" required>
                <VendorSearchSelect
                  value={vendorId || null}
                  selectedLabel={vendorLabel || undefined}
                  disabled={!effectiveStoreId}
                  onChange={(id, option) => {
                    setVendorId(id ?? "");
                    setVendorLabel(option?.label ?? "");
                    setLines([]);
                    setSelectedBillId("");
                    setBillLabel("");
                    setSelectedBillBalance(0);
                    setLineAmount("");
                  }}
                />
              </AdminFormField>
              <AdminFormField
                label="Purchase bill"
                hint="Optional — leave empty to apply the amount FIFO (oldest due first)."
              >
                <PurchaseBillSearchSelect
                  key={vendorId || "no-vendor"}
                  value={selectedBillId || null}
                  selectedLabel={billLabel || undefined}
                  vendorId={vendorId || undefined}
                  storeId={effectiveStoreId || undefined}
                  disabled={!vendorId || !effectiveStoreId}
                  onChange={(id, option) => {
                    setSelectedBillId(id ?? "");
                    setBillLabel(option?.label ?? "");
                    const balance = option?.amount ?? 0;
                    setSelectedBillBalance(balance);
                    if (id && balance > 0) setLineAmount(formatDisplayDecimal(balance));
                    if (!id) setLineAmount("");
                  }}
                />
              </AdminFormField>
              {selectedBillId ? (
                <p className="text-sm text-muted-foreground">
                  Balance due: {formatCurrencyAmount(selectedBillBalance)}
                </p>
              ) : null}
              <AdminFormField label="Amount">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
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
                    ) : selectedBillId ? (
                      "Add bill"
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
                    <TableHead>Bill</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Due</TableHead>
                    <TableHead className="text-right">Paying</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.purchaseBillId}>
                      <TableCell>{l.billNumber}</TableCell>
                      <TableCell>{l.vendorName ?? "—"}</TableCell>
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
                          onClick={() => removeLine(l.purchaseBillId)}
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

        <ErrorsFeedbackBridge errors={inlineError} />
        <PaymentFormInlineAlert message={inlineError} />

        {!isModal ? (
          <div className="flex gap-2">
            <Link
              href="/admin/erp/supplier-payments"
              className={buttonVariants({ variant: "outline" })}
            >
              Cancel
            </Link>
            <Button type="submit" disabled={isPending || submitBlocked}>
              {isPending ? "Saving…" : "Save payment"}
            </Button>
          </div>
        ) : null}
      </form>
    </AdminFormShell>
  );
}
