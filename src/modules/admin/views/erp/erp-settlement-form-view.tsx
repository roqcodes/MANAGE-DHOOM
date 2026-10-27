"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { settlementCreditTypeLabel } from "@/common/erp/commercial-discount";
import type { AccountSettlementPreview } from "@/common/erp/settlement-types";
import { ERP_SUPPLIER_PAYMENT_MODES } from "@/common/erp/purchasing-types";
import type { PaidThroughAccountOption } from "@/common/erp/sales-types";
import { ERP_CUSTOMER_PAYMENT_MODES, paymentModeLabel } from "@/common/erp/sales-types";
import { formatDisplayDecimal, parsePaymentAmount } from "@/lib/decimal-precision";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
import {
  AdminFormActions,
  AdminFormColumns,
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  AdminFormShell,
  applyFieldValidation,
  CustomerSearchSelect,
  VendorSearchSelect,
  type ErpFormViewBaseProps,
  useFormFieldValidation,
} from "@/modules/admin/ui";
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
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";
import { usePaymentAccountOptions } from "@/modules/erp/components/use-payment-account-options";
import {
  ActiveStoreFormField,
  useActiveStoreFormField,
} from "@/modules/erp/components/use-active-store-form-field";

export type SettlementSide = "customer" | "supplier";

export type ErpSettlementFormViewProps = ErpFormViewBaseProps & {
  side: SettlementSide;
  initialPartyId?: string;
  initialPartyLabel?: string;
};

export function ErpSettlementFormView({
  side,
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
  initialPartyId,
  initialPartyLabel,
}: ErpSettlementFormViewProps) {
  const router = useRouter();
  const formId = useId();
  const searchParams = useSearchParams();
  const isSupplier = side === "supplier";
  const apiBase = isSupplier ? "erp/supplier-payments" : "erp/payments";
  const paymentModes = isSupplier ? ERP_SUPPLIER_PAYMENT_MODES : ERP_CUSTOMER_PAYMENT_MODES;

  const prefillPartyId =
    initialPartyId ??
    (isSupplier ? searchParams.get("vendorId") : searchParams.get("userId")) ??
    "";

  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode: "create" });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | string[] | null>(null);
  const fieldValidation = useFormFieldValidation();
  const isModal = variant === "modal";

  const [partyId, setPartyId] = useState<string | null>(prefillPartyId || null);
  const [partyLabel, setPartyLabel] = useState(initialPartyLabel ?? "");
  const { data: customerAccountOptions } = usePaymentAccountOptions(
    isSupplier ? undefined : effectiveStoreId,
  );
  const [supplierDepositAccounts, setDepositAccounts] = useState<PaidThroughAccountOption[]>([]);
  const [supplierDiscountAccounts, setDiscountAccounts] = useState<PaidThroughAccountOption[]>([]);
  const [preview, setPreview] = useState<AccountSettlementPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState<string>(paymentModes[0]);
  const [accountId, setAccountId] = useState("");
  const [settlementDiscount, setSettlementDiscount] = useState("");
  const [discountAccountId, setDiscountAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const depositAccounts = isSupplier
    ? supplierDepositAccounts
    : (customerAccountOptions?.depositAccounts ?? []);
  const discountAccounts = isSupplier
    ? supplierDiscountAccounts
    : (customerAccountOptions?.expenseAccounts ?? []);

  useEffect(() => {
    if (prefillPartyId && !partyId) setPartyId(prefillPartyId);
  }, [prefillPartyId, partyId]);

  useEffect(() => {
    if (!isSupplier || !effectiveStoreId) return;
    adminGet<{ data: PaidThroughAccountOption[] }>(
      `${apiBase}?view=accounts&storeId=${encodeURIComponent(effectiveStoreId)}`,
    ).then((res) => setDepositAccounts(res.data ?? []));
    adminGet<{ data: PaidThroughAccountOption[] }>(
      `${apiBase}?view=settlement-discount-accounts&storeId=${encodeURIComponent(effectiveStoreId)}`,
    ).then((res) => setDiscountAccounts(res.data ?? []));
  }, [effectiveStoreId, apiBase, isSupplier]);

  useEffect(() => {
    if (!partyId || !effectiveStoreId) {
      setPreview(null);
      return;
    }
    setLoadingPreview(true);
    const partyParam = isSupplier
      ? `vendorId=${encodeURIComponent(partyId)}`
      : `userId=${encodeURIComponent(partyId)}`;
    adminGet<{ data: AccountSettlementPreview }>(
      `${apiBase}?view=settlement-preview&${partyParam}&storeId=${encodeURIComponent(effectiveStoreId)}`,
    )
      .then((res) => setPreview(res.data ?? null))
      .catch(() => setPreview(null))
      .finally(() => setLoadingPreview(false));
  }, [partyId, effectiveStoreId, apiBase, isSupplier]);

  const discountAmount = useMemo(() => {
    const parsed = parsePaymentAmount(settlementDiscount);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }, [settlementDiscount]);

  const documentSettleTotal = Number(preview?.documentSettleTotal) || 0;
  const netBalance = Number(preview?.netBalance) || 0;
  const openingPortion = Math.max(0, netBalance - documentSettleTotal);
  const cashAmount = Math.max(0, netBalance - discountAmount);

  type SettlementLineRow = {
    key: string;
    type: string;
    number: string;
    date: string;
    amount: number;
  };

  const settlementLines = useMemo((): SettlementLineRow[] => {
    if (!preview) return [];
    const docType = isSupplier ? "Bill" : "Invoice";
    const settlementSide = isSupplier ? "supplier" : "customer";
    const lines: SettlementLineRow[] = [];

    if (preview.openingBalance > 0) {
      lines.push({
        key: "opening",
        type: "Opening balance",
        number: "—",
        date: "—",
        amount: preview.openingBalance,
      });
    }

    for (const doc of preview.documents) {
      lines.push({
        key: `doc-${doc.id}`,
        type: docType,
        number: doc.number,
        date: doc.date ?? "—",
        amount: doc.balance,
      });
    }

    for (const credit of preview.credits) {
      lines.push({
        key: `credit-${credit.id}`,
        type: settlementCreditTypeLabel(settlementSide, credit.creditKind, credit.number),
        number: credit.number,
        date: credit.date ?? "—",
        amount: -credit.balanceRemaining,
      });
    }

    return lines;
  }, [preview, isSupplier]);

  const listPath = isSupplier ? "/admin/erp/supplier-payments" : "/admin/erp/payments";
  const detailSegment = isSupplier ? "supplier-payments" : "payments";

  function handleCancel() {
    if (isModal) onOpenChange?.(false);
    else router.push(listPath);
  }

  function handleSuccessNavigate(id?: string) {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(id);
      return;
    }
    router.push(id ? `/admin/erp/${detailSegment}/${id}` : listPath);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const validationMessages = applyFieldValidation(
      [
        {
          key: "party",
          ok: Boolean(partyId),
          message: isSupplier ? "Select a vendor." : "Select a customer.",
        },
        {
          key: "store",
          ok: Boolean(effectiveStoreId),
          message: storeRequiredMessage ?? "Store is required.",
        },
        {
          key: "account",
          ok: Boolean(accountId),
          message: isSupplier
            ? "Paid through account is required."
            : "Deposit account is required.",
        },
        {
          key: "settlementPreview",
          ok: Boolean(preview) && netBalance > 0,
          message: "No account balance to settle.",
        },
        {
          key: "settlementDiscount",
          ok: discountAmount <= 0 || documentSettleTotal > 0,
          message: "No open document balance for a settlement discount.",
        },
        {
          key: "settlementDiscount",
          ok: discountAmount <= 0 || discountAmount < documentSettleTotal,
          message: "Discount must be less than the document balance to settle.",
        },
        {
          key: "settlementDiscount",
          ok: discountAmount <= 0 || openingPortion <= 0.001,
          message:
            "Settlement discount applies to open documents only. Pay opening balance separately or remove the discount.",
        },
        { key: "cashAmount", ok: cashAmount > 0, message: "Amount to pay must be positive." },
        {
          key: "discountAccount",
          ok: discountAmount <= 0 || Boolean(discountAccountId),
          message: isSupplier
            ? "Select an income account for the settlement discount."
            : "Select an expense account for the settlement discount.",
        },
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

    startTransition(async () => {
      try {
        const body = isSupplier
          ? {
              accountSettlement: true,
              vendorId: partyId,
              storeId: effectiveStoreId,
              paymentDate,
              paymentMode,
              accountId,
              settlementDiscount: discountAmount,
              settlementDiscountAccountId: discountAmount > 0 ? discountAccountId : undefined,
              reference: reference || undefined,
              notes: notes || undefined,
            }
          : {
              accountSettlement: true,
              userId: partyId,
              storeId: effectiveStoreId,
              paymentDate,
              paymentMode,
              accountId,
              settlementDiscount: discountAmount,
              settlementDiscountAccountId: discountAmount > 0 ? discountAccountId : undefined,
              reference: reference || undefined,
              notes: notes || undefined,
            };

        const res = await adminPost<{ id: string }>(apiBase, body);
        handleSuccessNavigate(res.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to record settlement.");
      }
    });
  }

  if (isModal && !open) return null;

  const title = isSupplier ? "Settle vendor account" : "Settle customer account";
  const description = isSupplier
    ? "Applies vendor credits to open bills (FIFO), then records one payment for the remaining net balance."
    : "Applies credit notes to open invoices (FIFO), then records one payment for the remaining net balance.";

  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel="Record settlement"
      pending={isPending}
    />
  ) : undefined;

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      backHref={listPath}
      breadcrumb={[
        { label: isSupplier ? "Payments made" : "Payments", href: listPath },
        { label: "Settlement" },
      ]}
      size="landscape"
      formId={formId}
      footer={footer}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <AdminFormColumns cols={2}>
          <AdminFormSection title="Account" className="lg:col-span-2">
            <AdminFormGrid cols={3}>
              <AdminFormField label="Store" required fieldKey="store">
                <ActiveStoreFormField
                  mode="create"
                  stores={stores}
                  activeStoreId={activeStoreId}
                  storeId={storeId}
                  onStoreIdChange={setStoreId}
                  label=""
                  invalid={fieldValidation.isFieldInvalid("store")}
                />
              </AdminFormField>
              <AdminFormField label={isSupplier ? "Vendor" : "Customer"} required fieldKey="party">
                {isSupplier ? (
                  <VendorSearchSelect
                    value={partyId}
                    selectedLabel={partyLabel}
                    invalid={fieldValidation.isFieldInvalid("party")}
                    onChange={(id, option) => {
                      setPartyId(id);
                      setPartyLabel(option?.label ?? "");
                    }}
                  />
                ) : (
                  <CustomerSearchSelect
                    value={partyId}
                    selectedLabel={partyLabel}
                    invalid={fieldValidation.isFieldInvalid("party")}
                    onChange={(id, option) => {
                      setPartyId(id);
                      setPartyLabel(option?.label ?? "");
                    }}
                  />
                )}
              </AdminFormField>
              <AdminFormField label="Settlement date" required>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </AdminFormField>
            </AdminFormGrid>
          </AdminFormSection>

          <AdminFormSection
            title="Account items"
            className={
              fieldValidation.isFieldInvalid("settlementPreview")
                ? "ring-2 ring-destructive/60 lg:col-span-2"
                : "lg:col-span-2"
            }
          >
            {loadingPreview ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !partyId ? (
              <p className="text-sm text-muted-foreground">Select a party to load items.</p>
            ) : !preview ? (
              <p className="text-sm text-muted-foreground">Could not load settlement preview.</p>
            ) : settlementLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No balance to settle in this store.</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Number</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settlementLines.map((line) => (
                      <TableRow key={line.key}>
                        <TableCell className="text-muted-foreground">{line.type}</TableCell>
                        <TableCell className="font-medium">{line.number}</TableCell>
                        <TableCell>{line.date}</TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${line.amount < 0 ? "text-emerald-700 dark:text-emerald-400" : ""}`}
                        >
                          {formatCurrencyAmount(line.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell colSpan={3}>Net balance</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrencyAmount(netBalance)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
            {preview?.plannedCreditApplications.length ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Credits are applied to open documents (FIFO) when you record settlement.
              </p>
            ) : null}
            {preview?.openingBalanceNote ? (
              <p className="mt-1 text-sm text-muted-foreground">{preview.openingBalanceNote}</p>
            ) : null}
          </AdminFormSection>

          <AdminFormSection
            title="Settlement amounts"
            className={
              fieldValidation.isFieldInvalid("settlementDiscount") ||
              fieldValidation.isFieldInvalid("cashAmount")
                ? "ring-2 ring-destructive/60 lg:col-span-2"
                : "lg:col-span-2"
            }
          >
            <AdminFormGrid cols={3}>
              <AdminFormField label="Settlement discount" fieldKey="settlementDiscount">
                <Input
                  type="number"
                  min={0}
                  step="0.001"
                  placeholder="0"
                  value={settlementDiscount}
                  onChange={(e) => setSettlementDiscount(e.target.value)}
                />
              </AdminFormField>
              <AdminFormField
                label={isSupplier ? "Amount to pay" : "Amount received"}
                fieldKey="cashAmount"
              >
                <Input
                  readOnly
                  className="bg-muted"
                  value={netBalance > 0 ? formatDisplayDecimal(cashAmount) : ""}
                />
              </AdminFormField>
              {discountAmount > 0 ? (
                <AdminFormField
                  label={
                    isSupplier ? "Purchase discount (income)" : "Settlement discount (expense)"
                  }
                  required
                  fieldKey="discountAccount"
                >
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    value={discountAccountId}
                    onChange={(e) => setDiscountAccountId(e.target.value)}
                  >
                    <option value="">Select account</option>
                    {discountAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.code})
                      </option>
                    ))}
                  </select>
                </AdminFormField>
              ) : null}
            </AdminFormGrid>
            {discountAmount > 0 ? (
              <p className="text-sm text-muted-foreground">
                Document balance after credits{" "}
                {formatCurrencyAmount(documentSettleTotal)};{isSupplier ? " you pay" : " you receive"}{" "}
                {formatCurrencyAmount(cashAmount)} with{" "}
                {formatCurrencyAmount(discountAmount)} recorded as a payment-time discount.
                Posted commercial discounts already reduce document balances before this step.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Open credits and recorded discounts are applied first. Use a payment-time
                discount only for the remaining cash difference.
              </p>
            )}
          </AdminFormSection>

          <AdminFormSection title="Payment" className="lg:col-span-2">
            <AdminFormGrid cols={3}>
              <AdminFormField label="Payment mode">
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                >
                  {paymentModes.map((m) => (
                    <option key={m} value={m}>
                      {isSupplier ? m : paymentModeLabel(m)}
                    </option>
                  ))}
                </select>
              </AdminFormField>
              <AdminFormField label={isSupplier ? "Paid through" : "Deposit to"} required fieldKey="account">
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  <option value="">Select account</option>
                  {depositAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.code})
                    </option>
                  ))}
                </select>
              </AdminFormField>
              <AdminFormField label="Reference">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </AdminFormField>
            </AdminFormGrid>
            <AdminFormField label="Notes">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </AdminFormField>
          </AdminFormSection>
        </AdminFormColumns>

        <ErrorsFeedbackBridge errors={error} />
      </form>
    </AdminFormShell>
  );
}
