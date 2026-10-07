"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { ErpExpenseDetail, PaidThroughAccountOption } from "@/common/erp/purchasing-types";
import { adminGet, adminPatch, adminPost } from "@/modules/admin/lib/admin-api-client";
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

type ExpenseAccount = { id: string; name: string; code: string };

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

  const [expenseAccounts, setExpenseAccounts] = useState<ExpenseAccount[]>([]);
  const [paidAccounts, setPaidAccounts] = useState<PaidThroughAccountOption[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [vendorLabel, setVendorLabel] = useState("");
  const [userId, setUserId] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");
  const [isBillable, setIsBillable] = useState(false);
  const [billableCustomerId, setBillableCustomerId] = useState("");
  const [billableCustomerLabel, setBillableCustomerLabel] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");

  useEffect(() => {
    const q = effectiveStoreId
      ? `?view=accounts&storeId=${encodeURIComponent(effectiveStoreId)}`
      : "?view=accounts";
    adminGet<{ data: ExpenseAccount[] }>(`erp/expenses${q}`).then((res) =>
      setExpenseAccounts(res.data),
    );
  }, [effectiveStoreId]);

  useEffect(() => {
    const q = effectiveStoreId
      ? `?view=paid-through&storeId=${encodeURIComponent(effectiveStoreId)}`
      : "?view=paid-through";
    adminGet<{ data: PaidThroughAccountOption[] }>(`erp/expenses${q}`).then((res) =>
      setPaidAccounts(res.data),
    );
  }, [effectiveStoreId]);

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
        setIsBillable(Boolean(expense.is_billable));
        setBillableCustomerId(expense.billable_customer_id ?? "");
        setBillableCustomerLabel(expense.customer_name ?? "");
        setAttachmentUrl(expense.attachment_url ?? "");
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
      isBillable,
      billableCustomerId: isBillable ? billableCustomerId || null : null,
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
        size="xl"
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
      submitLabel="Save"
      pending={isPending}
    />
  ) : undefined;

  const sections = (
    <AdminFormColumns cols={2}>
      <AdminFormSection title="Expense details">
        <AdminFormGrid cols={3}>
          <ErpDocumentNumberField kind="EXP" enabled={mode === "create"} />
          <AdminFormField label="Expense date" required>
            <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required />
          </AdminFormField>
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
          <AdminFormField label="Expense account" required>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
            >
              <option value="">Select expense account</option>
              {expenseAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </AdminFormField>
          <AdminFormField label="Amount" required>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </AdminFormField>
          <AdminFormField label="Tax %">
            <Input type="number" min="0" step="0.01" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} />
          </AdminFormField>
          <AdminFormField label="Paid through" required>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={paidThroughId}
              onChange={(e) => setPaidThroughId(e.target.value)}
              required
            >
              <option value="">Select account</option>
              {paidAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </AdminFormField>
          <AdminFormField label="Tax status" className="sm:col-span-2 lg:col-span-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="taxMode" checked={taxMode === "inclusive"} onChange={() => setTaxMode("inclusive")} />
                Tax inclusive
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="taxMode" checked={taxMode === "exclusive"} onChange={() => setTaxMode("exclusive")} />
                Tax exclusive
              </label>
            </div>
          </AdminFormField>
        </AdminFormGrid>
      </AdminFormSection>

      <AdminFormSection title="Additional info">
        <AdminFormGrid cols={2}>
          <AdminFormField label="Vendor">
            <VendorSearchSelect
              value={vendorId || null}
              selectedLabel={vendorLabel || undefined}
              onChange={(id, option) => {
                setVendorId(id ?? "");
                setVendorLabel(option?.label ?? "");
              }}
            />
          </AdminFormField>
          <AdminFormField label="Customer">
            <CustomerSearchSelect
              value={userId || null}
              selectedLabel={customerLabel || undefined}
              onChange={(id, option) => {
                setUserId(id ?? "");
                setCustomerLabel(option?.label ?? "");
              }}
            />
          </AdminFormField>
          <AdminFormField label="Reference">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference" />
          </AdminFormField>
          <AdminFormField label="Attachment">
            <AttachmentField value={attachmentUrl} onChange={setAttachmentUrl} />
          </AdminFormField>
          <AdminFormField label="Note" className="sm:col-span-2">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Note" />
          </AdminFormField>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={isBillable}
              onChange={(e) => setIsBillable(e.target.checked)}
            />
            Billable to customer
          </label>
          {isBillable ? (
            <AdminFormField label="Billable customer" required className="sm:col-span-2">
              <CustomerSearchSelect
                value={billableCustomerId || null}
                selectedLabel={billableCustomerLabel || undefined}
                onChange={(id, option) => {
                  setBillableCustomerId(id ?? "");
                  setBillableCustomerLabel(option?.label ?? "");
                }}
              />
            </AdminFormField>
          ) : null}
        </AdminFormGrid>
      </AdminFormSection>
    </AdminFormColumns>
  );

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Record an expense with tax and paid-through account."
      backHref="/admin/erp/expenses"
      breadcrumb={[
        { label: "Expenses", href: "/admin/erp/expenses" },
        { label: title },
      ]}
      size="xl"
      formId={formId}
      footer={footer}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
        {sections}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!isModal ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Link href="/admin/erp/expenses" className={buttonVariants({ variant: "outline" })}>
              Cancel
            </Link>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : null}
      </form>
    </AdminFormShell>
  );
}
