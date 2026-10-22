"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { ErpExpenseDetail, PaidThroughAccountOption } from "@/common/erp/purchasing-types";
import { adminGet, adminPatch, adminPost } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import {
  AdminFormActions,
  AdminFormColumns,
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  AdminFormShell,
  CustomerSearchSelect,
  ErpDocumentNumberField,
  VendorSearchSelect,
  type ErpFormViewBaseProps,
} from "@/modules/admin/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import {
  ActiveStoreFormField,
  useActiveStoreFormField,
} from "@/modules/erp/components/use-active-store-form-field";
import { AttachmentField } from "@/modules/erp/components/attachment-field";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";

type ExpenseAccount = { id: string; name: string; code: string };

const SELECT_CLS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs";

export type ExpenseFormViewProps = ErpFormViewBaseProps & {
  mode: "create" | "edit";
  expenseId?: string;
};

export function ExpenseFormView({
  mode,
  expenseId,
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: ExpenseFormViewProps) {
  const router = useRouter();
  const formId = useId();
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode });
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(mode === "edit");
  const [error, setError] = useState<string | null>(null);
  const isModal = variant === "modal";

  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [taxMode, setTaxMode] = useState<"exclusive" | "inclusive">("exclusive");
  const [taxPercent, setTaxPercent] = useState("0");
  const [paidThroughId, setPaidThroughId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const { data: accountOptions } = useQuery({
    queryKey: adminQueryKeys.expenseAccountOptions(effectiveStoreId),
    queryFn: () => {
      const storeQ = effectiveStoreId
        ? `?view=account-options&storeId=${encodeURIComponent(effectiveStoreId)}`
        : "?view=account-options";
      return adminGet<{
        expenseAccounts: ExpenseAccount[];
        paidThrough: PaidThroughAccountOption[];
      }>(`erp/expenses${storeQ}`);
    },
    enabled: Boolean(effectiveStoreId),
    staleTime: 60_000,
  });
  const expenseAccounts = accountOptions?.expenseAccounts ?? [];
  const paidAccounts = accountOptions?.paidThrough ?? [];
  const [vendorId, setVendorId] = useState("");
  const [vendorLabel, setVendorLabel] = useState("");
  const [userId, setUserId] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [expenseNumber, setExpenseNumber] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "edit" || !expenseId) return;
    adminGet<ErpExpenseDetail>(`erp/expenses/${expenseId}`)
      .then((expense) => {
        setExpenseDate(expense.expense_date);
        setStoreId(expense.store_id);
        setAccountId(expense.account_id);
        setAmount(String(expense.amount));
        setTaxMode(expense.tax_mode === "inclusive" ? "inclusive" : "exclusive");
        setTaxPercent(String(expense.tax_percent));
        setPaidThroughId(expense.paid_through_account_id ?? "");
        setReference(expense.reference ?? "");
        setNotes(expense.notes ?? "");
        setVendorId(expense.vendor_id ?? "");
        setUserId(expense.user_id ?? "");
        setVendorLabel(expense.vendor_name ?? "");
        setCustomerLabel(expense.customer_name ?? "");
        setAttachmentUrl(expense.attachment_url ?? "");
        setExpenseNumber(expense.expense_number ?? null);
      })
      .finally(() => setLoading(false));
  }, [mode, expenseId]);

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/erp/expenses");
    }
  }

  function handleSuccessNavigate(id?: string) {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(id);
      return;
    }
    router.push(id ? `/admin/erp/expenses/${id}` : "/admin/erp/expenses");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!effectiveStoreId) return setError(storeRequiredMessage ?? "Store is required.");
    if (!accountId) return setError("Expense account is required.");
    if (!amt || amt <= 0) return setError("Amount must be positive.");
    if (!paidThroughId) return setError("Paid through account is required.");

    const payload = {
      storeId: effectiveStoreId,
      expenseDate,
      accountId,
      amount: amt,
      taxMode,
      taxPercent: parseFloat(taxPercent) || 0,
      paidThroughAccountId: paidThroughId,
      vendorId: vendorId || null,
      userId: userId || null,
      attachmentUrl: attachmentUrl || null,
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    startTransition(async () => {
      try {
        if (mode === "create") {
          const res = await adminPost<{ id: string }>("erp/expenses", payload);
          handleSuccessNavigate(res.id);
        } else if (expenseId) {
          await adminPatch(`erp/expenses/${expenseId}`, payload);
          handleSuccessNavigate(expenseId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save expense.");
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
        title={mode === "create" ? "New expense" : "Edit expense"}
        size="landscape"
        loading
        loadingFallback={<AdminPageSkeleton />}
      >
        {null}
      </AdminFormShell>
    );
  }

  const title = mode === "create" ? "New expense" : "Edit expense";
  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel={mode === "create" ? "Save expense" : "Save changes"}
      pending={isPending}
    />
  ) : undefined;

  const sections = (
    <>
      <AdminFormColumns cols={2} columnRatio="2:1">
        <AdminFormSection title="Expense details">
          <AdminFormGrid cols={3}>
            <AdminFormField label="Store" required>
              <ActiveStoreFormField
                mode={mode}
                stores={stores}
                activeStoreId={activeStoreId}
                storeId={storeId}
                onStoreIdChange={setStoreId}
                label=""
              />
            </AdminFormField>
            <AdminFormField label="Expense date" required>
              <Input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                required
              />
            </AdminFormField>
            <ErpDocumentNumberField
              kind="EXP"
              enabled={mode === "create"}
              value={mode === "edit" ? expenseNumber : undefined}
            />
            <AdminFormField label="Expense account" required className="sm:col-span-2 lg:col-span-1">
              <select
                className={SELECT_CLS}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                required
              >
                <option value="">Select expense account</option>
                {expenseAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.code ? ` (${a.code})` : ""}
                  </option>
                ))}
              </select>
            </AdminFormField>
            <AdminFormField label="Amount" required>
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </AdminFormField>
            <AdminFormField label="Tax rate %" optional>
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={taxPercent}
                onChange={(e) => setTaxPercent(e.target.value)}
              />
            </AdminFormField>
            <AdminFormField label="Paid through" required>
              <select
                className={SELECT_CLS}
                value={paidThroughId}
                onChange={(e) => setPaidThroughId(e.target.value)}
                required
              >
                <option value="">Select account</option>
                {paidAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.code ? ` (${a.code})` : ""}
                  </option>
                ))}
              </select>
            </AdminFormField>
            <AdminFormField label="Tax treatment" required>
              <select
                className={SELECT_CLS}
                value={taxMode}
                onChange={(e) =>
                  setTaxMode(e.target.value === "inclusive" ? "inclusive" : "exclusive")
                }
              >
                <option value="exclusive">Tax exclusive</option>
                <option value="inclusive">Tax inclusive</option>
              </select>
            </AdminFormField>
            <AdminFormField label="Reference #" optional className="sm:col-span-2 lg:col-span-1">
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Receipt or internal ref"
              />
            </AdminFormField>
          </AdminFormGrid>
        </AdminFormSection>

        <AdminFormSection title="Party">
          <AdminFormGrid cols={1}>
            <AdminFormField label="Vendor" optional>
              <VendorSearchSelect
                value={vendorId || null}
                selectedLabel={vendorLabel || undefined}
                disabled={!effectiveStoreId}
                onChange={(id, option) => {
                  setVendorId(id ?? "");
                  setVendorLabel(option?.label ?? "");
                }}
              />
            </AdminFormField>
            <AdminFormField label="Customer" optional>
              <CustomerSearchSelect
                value={userId || null}
                selectedLabel={customerLabel || undefined}
                onChange={(id, option) => {
                  setUserId(id ?? "");
                  setCustomerLabel(option?.label ?? "");
                }}
              />
            </AdminFormField>
            <AdminFormField label="Attachment" optional>
              <AttachmentField value={attachmentUrl} onChange={setAttachmentUrl} />
            </AdminFormField>
          </AdminFormGrid>
        </AdminFormSection>
      </AdminFormColumns>

      <AdminFormSection title="Notes">
        <AdminFormField label="Internal note" optional>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Why this expense was recorded"
            className="min-h-[5rem] resize-y"
          />
        </AdminFormField>
      </AdminFormSection>
    </>
  );

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Record spend against an expense account and the bank or cash account paid from."
      backHref="/admin/erp/expenses"
      breadcrumb={[
        { label: "Expenses", href: "/admin/erp/expenses" },
        { label: title },
      ]}
      size="landscape"
      formId={formId}
      footer={footer}
      pending={isPending}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
        {sections}
        <ErrorsFeedbackBridge errors={error} />
        {!isModal ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Link href="/admin/erp/expenses" className={buttonVariants({ variant: "outline" })}>
              Cancel
            </Link>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : mode === "create" ? "Save expense" : "Save changes"}
            </Button>
          </div>
        ) : null}
      </form>
    </AdminFormShell>
  );
}

