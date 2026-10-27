"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { CommercialDiscountSide } from "@/common/erp/commercial-discount";
import type { PaidThroughAccountOption } from "@/common/erp/sales-types";
import { parsePaymentAmount } from "@/lib/decimal-precision";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import {
  AdminFormField,
  AdminFormSection,
  AdminFormShell,
  applyFieldValidation,
  CustomerSearchSelect,
  InvoiceSearchSelect,
  PurchaseBillSearchSelect,
  VendorSearchSelect,
  type ErpFormViewBaseProps,
  useFormFieldValidation,
} from "@/modules/admin/ui";
import {
  ActiveStoreFormField,
  useActiveStoreFormField,
} from "@/modules/erp/components/use-active-store-form-field";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type ErpCommercialDiscountFormViewProps = ErpFormViewBaseProps & {
  side: CommercialDiscountSide;
  initialPartyId?: string;
  initialPartyLabel?: string;
  initialSourceDocumentId?: string;
  initialSourceDocumentLabel?: string;
  lockParty?: boolean;
  lockSource?: boolean;
};

type SourceBalance = {
  balanceDue: number;
  status: string;
};

export function ErpCommercialDiscountFormView({
  side,
  variant = "modal",
  open = true,
  onOpenChange,
  onSuccess,
  initialPartyId,
  initialPartyLabel,
  initialSourceDocumentId,
  initialSourceDocumentLabel,
  lockParty = false,
  lockSource = false,
}: ErpCommercialDiscountFormViewProps) {
  const router = useRouter();
  const formId = useId();
  const isSupplier = side === "supplier";
  const isModal = variant === "modal";
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode: "create" });

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | string[] | null>(null);
  const fieldValidation = useFormFieldValidation();
  const [partyId, setPartyId] = useState<string | null>(initialPartyId ?? null);
  const [partyLabel, setPartyLabel] = useState(initialPartyLabel ?? "");
  const [sourceId, setSourceId] = useState<string | null>(initialSourceDocumentId ?? null);
  const [sourceLabel, setSourceLabel] = useState(initialSourceDocumentLabel ?? "");
  const [sourceBalance, setSourceBalance] = useState<SourceBalance | null>(null);
  const [discountDate, setDiscountDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [discountAccountId, setDiscountAccountId] = useState("");
  const [accounts, setAccounts] = useState<PaidThroughAccountOption[]>([]);
  const [reference, setReference] = useState(initialSourceDocumentLabel ?? "");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!effectiveStoreId) return;
    adminGet<{ data: PaidThroughAccountOption[] }>(
      `erp/discounts?view=accounts&side=${side}&storeId=${encodeURIComponent(effectiveStoreId)}`,
    )
      .then((res) => {
        const rows = res.data ?? [];
        setAccounts(rows);
        setDiscountAccountId((current) => {
          if (current && rows.some((row) => row.id === current)) return current;
          const preferred = rows.find((row) =>
            isSupplier
              ? row.code === "DISCOUNT_RECEIVED"
              : row.code === "DISCOUNT_ALLOWED",
          );
          return preferred?.id ?? rows[0]?.id ?? "";
        });
      })
      .catch(() => setAccounts([]));
  }, [effectiveStoreId, side, isSupplier]);

  useEffect(() => {
    if (!sourceId) {
      setSourceBalance(null);
      return;
    }
    if (isSupplier) {
      adminGet<{
        bill: {
          status: string;
          balance_due: number;
          purchase_bill_number?: string;
          store_id?: string;
        };
      }>(`erp/purchase-bills/${sourceId}`)
        .then((res) => {
          setSourceBalance({
            balanceDue: Number(res.bill.balance_due ?? 0),
            status: res.bill.status,
          });
          setReference((current) => current || res.bill.purchase_bill_number || "");
          if (res.bill.store_id) setStoreId(res.bill.store_id);
        })
        .catch(() => setSourceBalance(null));
      return;
    }
    adminGet<{
      status: string;
      balance_due: number;
      invoice_number?: string;
      store_id?: string | null;
    }>(`erp/invoices/${sourceId}`)
      .then((res) => {
        setSourceBalance({
          balanceDue: Number(res.balance_due ?? 0),
          status: res.status,
        });
        setReference((current) => current || res.invoice_number || "");
        if (res.store_id) setStoreId(res.store_id);
      })
      .catch(() => setSourceBalance(null));
  }, [sourceId, isSupplier, setStoreId]);

  const parsedAmount = useMemo(() => parsePaymentAmount(amount), [amount]);
  const parsedTaxRate = useMemo(() => {
    const n = parsePaymentAmount(taxRate || "0");
    return Number.isFinite(n) ? n : 0;
  }, [taxRate]);
  const taxAmount =
    Number.isFinite(parsedAmount) && parsedTaxRate > 0
      ? Math.round((parsedAmount * parsedTaxRate) / (100 + parsedTaxRate) * 100) / 100
      : 0;
  const netAmount = Number.isFinite(parsedAmount)
    ? Math.max(0, Math.round((parsedAmount - taxAmount) * 100) / 100)
    : 0;

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
      return;
    }
    router.back();
  }

  function submit() {
    setError(null);
    const validationMessages = applyFieldValidation(
      [
        {
          key: "party",
          ok: Boolean(partyId),
          message: isSupplier ? "Vendor is required." : "Customer is required.",
        },
        {
          key: "store",
          ok: Boolean(effectiveStoreId),
          message: storeRequiredMessage ?? "Store is required.",
        },
        { key: "discountDate", ok: Boolean(discountDate), message: "Discount date is required." },
        {
          key: "amount",
          ok: Number.isFinite(parsedAmount) && parsedAmount > 0,
          message: "Enter a discount amount greater than zero.",
        },
        {
          key: "sourceDocument",
          ok:
            !sourceBalance ||
            (sourceBalance.status !== "draft" && sourceBalance.status !== "cancelled"),
          message:
            "Choose a posted document. Draft and cancelled documents cannot take a discount.",
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
        const res = await adminPost<{ id: string; side: CommercialDiscountSide }>("erp/discounts", {
          side,
          partyId,
          storeId: effectiveStoreId,
          discountDate,
          amount: parsedAmount,
          taxRatePercent: parsedTaxRate,
          sourceDocumentId: sourceId || undefined,
          discountAccountId: discountAccountId || undefined,
          reference: reference || undefined,
          notes: notes || undefined,
        });
        if (isModal) {
          onOpenChange?.(false);
          onSuccess?.(res.id);
          return;
        }
        router.push(
          isSupplier ? `/admin/erp/vendor-credits/${res.id}` : `/admin/erp/credit-notes/${res.id}`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to record discount.");
      }
    });
  }

  if (isModal && !open) return null;

  const title = isSupplier ? "Record purchase discount" : "Record sales discount";
  const description = isSupplier
    ? "Vendor agreed you can pay less. The original bill is not edited. This credit reduces what you owe and is applied at settlement."
    : "Customer is allowed to pay less. The original invoice is not edited. This credit reduces what they owe and is applied at settlement.";

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="md"
      formId={formId}
      pending={isPending}
      footer={
        <>
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={isPending} onClick={submit}>
            {isPending ? "Recording…" : "Record discount"}
          </Button>
        </>
      }
    >
      <form id={formId} className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        <AdminFormSection title="Discount">
          <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
            <AdminFormField
              label={isSupplier ? "Vendor" : "Customer"}
              required
              fieldKey="party"
              className="sm:col-span-2"
            >
              {isSupplier ? (
                <VendorSearchSelect
                  value={partyId}
                  selectedLabel={partyLabel || undefined}
                  disabled={lockParty}
                  invalid={fieldValidation.isFieldInvalid("party")}
                  onChange={(id, option) => {
                    setPartyId(id);
                    setPartyLabel(option?.label ?? "");
                    if (!lockSource) {
                      setSourceId(null);
                      setSourceLabel("");
                      setSourceBalance(null);
                    }
                  }}
                />
              ) : (
                <CustomerSearchSelect
                  value={partyId}
                  selectedLabel={partyLabel || undefined}
                  disabled={lockParty}
                  invalid={fieldValidation.isFieldInvalid("party")}
                  onChange={(id, option) => {
                    setPartyId(id);
                    setPartyLabel(option?.label ?? "");
                    if (!lockSource) {
                      setSourceId(null);
                      setSourceLabel("");
                      setSourceBalance(null);
                    }
                  }}
                />
              )}
            </AdminFormField>
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
            <AdminFormField label="Date" required fieldKey="discountDate">
              <Input type="date" value={discountDate} onChange={(e) => setDiscountDate(e.target.value)} />
            </AdminFormField>
            <AdminFormField
              label={isSupplier ? "Source purchase bill" : "Source invoice"}
              optional
              fieldKey="sourceDocument"
              className="sm:col-span-2"
            >
              {isSupplier ? (
                <PurchaseBillSearchSelect
                  key={partyId || "no-vendor"}
                  value={sourceId}
                  selectedLabel={sourceLabel || undefined}
                  vendorId={partyId || undefined}
                  storeId={effectiveStoreId || undefined}
                  linkMode="vendorCredit"
                  elevatedDropdown={isModal}
                  disabled={!partyId || lockSource}
                  onChange={(id, option) => {
                    setSourceId(id);
                    setSourceLabel(option?.label ?? "");
                    if (option?.label) setReference(option.label);
                  }}
                />
              ) : (
                <InvoiceSearchSelect
                  key={partyId || "no-customer"}
                  value={sourceId}
                  selectedLabel={sourceLabel || undefined}
                  userId={partyId || undefined}
                  storeId={effectiveStoreId || undefined}
                  disabled={!partyId || lockSource}
                  onChange={(id, option) => {
                    setSourceId(id);
                    setSourceLabel(option?.label ?? "");
                    if (option?.label) setReference(option.label);
                  }}
                />
              )}
              {sourceBalance ? (
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  Open balance: {formatCurrencyAmount(sourceBalance.balanceDue)}
                </p>
              ) : null}
            </AdminFormField>
            <AdminFormField label="Discount amount" required fieldKey="amount">
              <Input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="100"
              />
            </AdminFormField>
            <AdminFormField label="Tax rate %" optional>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                inputMode="decimal"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
            </AdminFormField>
            <AdminFormField
              label={isSupplier ? "Income account" : "Expense account"}
              required
              className="sm:col-span-2"
            >
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={discountAccountId}
                onChange={(e) => setDiscountAccountId(e.target.value)}
              >
                <option value="">Select account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.code})
                  </option>
                ))}
              </select>
            </AdminFormField>
            <AdminFormField label="Reference" className="sm:col-span-2">
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={isSupplier ? "Vendor credit / concession ref" : "Customer concession ref"}
              />
            </AdminFormField>
            <AdminFormField label="Notes" className="sm:col-span-2">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why this discount was given"
                rows={3}
              />
            </AdminFormField>
          </div>
          {Number.isFinite(parsedAmount) && parsedAmount > 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {isSupplier ? "Payables" : "Receivables"} reduce by{" "}
              {formatCurrencyAmount(parsedAmount)}
              {taxAmount > 0
                ? ` (net ${formatCurrencyAmount(netAmount)} + tax ${formatCurrencyAmount(taxAmount)})`
                : null}
              . Stock is not changed.
            </p>
          ) : null}
        </AdminFormSection>
        <ErrorsFeedbackBridge errors={error} />
      </form>
    </AdminFormShell>
  );
}
