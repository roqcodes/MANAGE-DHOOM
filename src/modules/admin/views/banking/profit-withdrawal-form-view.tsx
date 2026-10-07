"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { BankingAccountRow } from "@/common/erp/finance-types";
import { PAYMENT_MODE_OPTIONS } from "@/common/erp/finance-types";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import {
  AdminFormActions,
  AdminFormColumns,
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  AdminFormShell,
  type ErpFormViewBaseProps,
} from "@/modules/admin/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";

export type ProfitWithdrawalFormViewProps = ErpFormViewBaseProps;

export function ProfitWithdrawalFormView({
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: ProfitWithdrawalFormViewProps) {
  const router = useRouter();
  const formId = useId();
  const { stores, activeStoreId } = useErpStores();
  const [accounts, setAccounts] = useState<BankingAccountRow[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isModal = variant === "modal";

  useEffect(() => {
    const q = activeStoreId ? `?storeId=${encodeURIComponent(activeStoreId)}` : "";
    adminGet<{ data: BankingAccountRow[] }>(`erp/banking${q}`).then((res) =>
      setAccounts(res.data ?? []),
    );
  }, [activeStoreId]);

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/erp/profit-withdrawals");
    }
  }

  function handleSuccessNavigate() {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.();
      return;
    }
    router.push("/admin/erp/profit-withdrawals");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const storeId = fd.get("storeId") as string;
    const fromAccountId = fd.get("fromAccountId") as string;
    const amount = parseFloat((fd.get("amount") as string) || "0");
    if (!storeId || !fromAccountId || amount <= 0) {
      setError("Store, from account, and amount are required");
      return;
    }

    startTransition(async () => {
      try {
        await adminPost("erp/banking", {
          kind: "profit_withdrawal",
          storeId,
          fromAccountId,
          transactionDate:
            (fd.get("transactionDate") as string) || new Date().toISOString().slice(0, 10),
          amount,
          paymentType: (fd.get("paymentType") as string) || "Cash",
          reference: (fd.get("reference") as string).trim() || undefined,
          description: (fd.get("description") as string).trim() || undefined,
          counterAccountId: (fd.get("counterAccountId") as string) || undefined,
        });
        handleSuccessNavigate();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save withdrawal");
      }
    });
  }

  if (isModal && !open) return null;

  const title = "Add profit withdrawal";
  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel="Save"
      pending={pending}
    />
  ) : undefined;

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Record an owner withdrawal from a bank or cash account to drawings."
      backHref="/admin/erp/profit-withdrawals"
      breadcrumb={[
        { label: "Profit withdrawals", href: "/admin/erp/profit-withdrawals" },
        { label: "Add withdrawal" },
      ]}
      size="lg"
      formId={formId}
      footer={footer}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <AdminFormSection title="Withdrawal details">
          <AdminFormColumns cols={2}>
            <AdminFormGrid cols={2}>
              <AdminFormField label="Store" required className="sm:col-span-2">
                <select
                  name="storeId"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={activeStoreId ?? ""}
                  required
                >
                  <option value="">Select store</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </AdminFormField>
              <AdminFormField label="From account" required>
                <select
                  name="fromAccountId"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
              <AdminFormField label="To account">
                <Input value="Drawings" disabled />
                <input type="hidden" name="counterAccountId" value="" />
              </AdminFormField>
              <AdminFormField label="Withdrawal amount" required>
                <Input name="amount" type="number" step="0.01" min={0} defaultValue={0} required />
              </AdminFormField>
              <AdminFormField label="Date" required>
                <Input
                  name="transactionDate"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </AdminFormField>
            </AdminFormGrid>
            <AdminFormGrid cols={2}>
              <AdminFormField label="Payment mode" className="sm:col-span-2">
                <select
                  name="paymentType"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue="Cash"
                >
                  {PAYMENT_MODE_OPTIONS.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </AdminFormField>
              <AdminFormField label="Reference" className="sm:col-span-2">
                <Input name="reference" />
              </AdminFormField>
              <AdminFormField label="Description" className="sm:col-span-2">
                <Textarea name="description" rows={3} />
              </AdminFormField>
            </AdminFormGrid>
          </AdminFormColumns>
        </AdminFormSection>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {!isModal ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Link
              href="/admin/erp/profit-withdrawals"
              className={buttonVariants({ variant: "outline" })}
            >
              Cancel
            </Link>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : null}
      </form>
    </AdminFormShell>
  );
}
