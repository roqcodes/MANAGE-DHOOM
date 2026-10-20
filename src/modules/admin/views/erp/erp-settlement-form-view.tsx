"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { PayablePurchaseBillRow } from "@/common/erp/purchasing-types";
import { ERP_SUPPLIER_PAYMENT_MODES } from "@/common/erp/purchasing-types";
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
  VendorSearchSelect,
  type ErpFormViewBaseProps,
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
import {
  ActiveStoreFormField,
  useActiveStoreFormField,
} from "@/modules/erp/components/use-active-store-form-field";

export type SettlementSide = "customer" | "supplier";

export type ErpSettlementFormViewProps = ErpFormViewBaseProps & {
  side: SettlementSide;
  /** Pre-select party when opened from customer/vendor profile */
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
  const [error, setError] = useState<string | null>(null);
  const isModal = variant === "modal";

  const [partyId, setPartyId] = useState<string | null>(prefillPartyId || null);
  const [partyLabel, setPartyLabel] = useState(initialPartyLabel ?? "");
  const [depositAccounts, setDepositAccounts] = useState<PaidThroughAccountOption[]>([]);
  const [discountAccounts, setDiscountAccounts] = useState<PaidThroughAccountOption[]>([]);
  const [bills, setBills] = useState<PayablePurchaseBillRow[]>([]);
  const [invoices, setInvoices] = useState<ReceivableInvoiceRow[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState<string>(paymentModes[0]);
  const [accountId, setAccountId] = useState("");
  const [settlementDiscount, setSettlementDiscount] = useState("");
  const [discountAccountId, setDiscountAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (prefillPartyId && !partyId) setPartyId(prefillPartyId);
  }, [prefillPartyId, partyId]);

  useEffect(() => {
    if (!effectiveStoreId) return;
    adminGet<{ data: PaidThroughAccountOption[] }>(
      `${apiBase}?view=accounts&storeId=${encodeURIComponent(effectiveStoreId)}`,
    ).then((res) => setDepositAccounts(res.data ?? []));
    adminGet<{ data: PaidThroughAccountOption[] }>(
      `${apiBase}?view=settlement-discount-accounts&storeId=${encodeURIComponent(effectiveStoreId)}`,
    ).then((res) => setDiscountAccounts(res.data ?? []));
  }, [effectiveStoreId, apiBase]);

  useEffect(() => {
    if (!partyId || !effectiveStoreId) {
      setBills([]);
      setInvoices([]);
      return;
    }
    setLoadingDocs(true);
    const view = isSupplier ? "payable-bills" : "receivable-invoices";
    const partyParam = isSupplier ? `vendorId=${encodeURIComponent(partyId)}` : `userId=${encodeURIComponent(partyId)}`;
    adminGet<{ data: PayablePurchaseBillRow[] | ReceivableInvoiceRow[] }>(
      `${apiBase}?view=${view}&${partyParam}&storeId=${encodeURIComponent(effectiveStoreId)}`,
    )
      .then((res) => {
        if (isSupplier) setBills((res.data as PayablePurchaseBillRow[]) ?? []);
        else setInvoices((res.data as ReceivableInvoiceRow[]) ?? []);
      })
      .catch(() => {
        setBills([]);
        setInvoices([]);
      })
      .finally(() => setLoadingDocs(false));
  }, [partyId, effectiveStoreId, apiBase, isSupplier]);

  const openLines = useMemo(() => {
    if (isSupplier) {
      return bills.map((b) => ({
        id: b.id,
        number: b.purchase_bill_number,
        date: b.purchase_date,
        balance: b.balance_due,
      }));
    }
    return invoices.map((inv) => ({
      id: inv.id,
      number: inv.invoice_number,
      date: inv.due_date ?? "—",
      balance: inv.balance_due,
    }));
  }, [bills, invoices, isSupplier]);

  const outstandingTotal = openLines.reduce((s, l) => s + l.balance, 0);
  const discountAmount = Math.max(0, parseFloat(settlementDiscount) || 0);
  const cashAmount = Math.max(0, outstandingTotal - discountAmount);

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
    if (!partyId) return setError(isSupplier ? "Select a vendor." : "Select a customer.");
    if (!effectiveStoreId) return setError(storeRequiredMessage ?? "Store is required.");
    if (!accountId) return setError(isSupplier ? "Paid through account is required." : "Deposit account is required.");
    if (openLines.length === 0) return setError("No open balances to settle.");
    if (discountAmount >= outstandingTotal) {
      return setError("Discount must be less than outstanding balance.");
    }
    if (cashAmount <= 0) return setError("Amount to pay must be positive.");
    if (discountAmount > 0 && !discountAccountId) {
      return setError(
        isSupplier
          ? "Select an income account for the settlement discount."
          : "Select an expense account for the settlement discount.",
      );
    }

    startTransition(async () => {
      try {
        const allocations = isSupplier
          ? openLines.map((l) => ({ purchaseBillId: l.id, amount: l.balance }))
          : openLines.map((l) => ({ invoiceId: l.id, amount: l.balance }));

        const body = isSupplier
          ? {
              vendorId: partyId,
              storeId: effectiveStoreId,
              paymentDate,
              paymentMode,
              accountId,
              totalAmount: cashAmount,
              settlementDiscount: discountAmount,
              settlementDiscountAccountId: discountAmount > 0 ? discountAccountId : undefined,
              reference: reference || undefined,
              notes: notes || `Account settlement${discountAmount > 0 ? ` (discount ${discountAmount})` : ""}`,
              isBulk: false,
              allocations,
            }
          : {
              userId: partyId,
              storeId: effectiveStoreId,
              paymentDate,
              paymentMode,
              accountId,
              totalAmount: cashAmount,
              settlementDiscount: discountAmount,
              settlementDiscountAccountId: discountAmount > 0 ? discountAccountId : undefined,
              reference: reference || undefined,
              notes: notes || `Account settlement${discountAmount > 0 ? ` (discount ${discountAmount})` : ""}`,
              isBulk: false,
              allocations,
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
    ? "Clear all open purchase bills. Enter a discount if the vendor agreed to accept less than the full payable."
    : "Clear all open invoices. Enter a discount if the customer paid less than the full receivable.";

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
              <AdminFormField label={isSupplier ? "Vendor" : "Customer"} required>
                {isSupplier ? (
                  <VendorSearchSelect
                    value={partyId}
                    selectedLabel={partyLabel}
                    onChange={(id, option) => {
                      setPartyId(id);
                      setPartyLabel(option?.label ?? "");
                    }}
                  />
                ) : (
                  <CustomerSearchSelect
                    value={partyId}
                    selectedLabel={partyLabel}
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

          <AdminFormSection title="Open balances" className="lg:col-span-2">
            {loadingDocs ? (
              <p className="text-sm text-muted-foreground">Loading open documents…</p>
            ) : openLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {partyId
                  ? "No open balances for this account in the selected store."
                  : "Select a party to load open balances."}
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isSupplier ? "Bill" : "Invoice"}</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openLines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="font-medium">{line.number}</TableCell>
                        <TableCell>{line.date}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrencyAmount(line.balance)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={2} className="font-medium">Total outstanding</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatCurrencyAmount(outstandingTotal)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </AdminFormSection>

          <AdminFormSection title="Settlement amounts" className="lg:col-span-2">
            <AdminFormGrid cols={3}>
              <AdminFormField label="Settlement discount">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0"
                  value={settlementDiscount}
                  onChange={(e) => setSettlementDiscount(e.target.value)}
                />
              </AdminFormField>
              <AdminFormField label={isSupplier ? "Amount to pay" : "Amount received"}>
                <Input
                  readOnly
                  className="bg-muted"
                  value={outstandingTotal > 0 ? cashAmount.toFixed(2) : ""}
                />
              </AdminFormField>
              {discountAmount > 0 ? (
                <AdminFormField
                  label={
                    isSupplier ? "Purchase discount (income)" : "Settlement discount (expense)"
                  }
                  required
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
                Documents totalling {formatCurrencyAmount(outstandingTotal)} will be marked settled;
                {isSupplier ? " you pay" : " you receive"}{" "}
                {formatCurrencyAmount(cashAmount)} with{" "}
                {formatCurrencyAmount(discountAmount)} recorded as discount.
              </p>
            ) : null}
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
              <AdminFormField label={isSupplier ? "Paid through" : "Deposit to"} required>
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

