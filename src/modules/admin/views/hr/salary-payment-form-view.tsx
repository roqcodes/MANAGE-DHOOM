"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { ErpEmployeeOption } from "@/common/erp/hr-types";
import { ERP_SALARY_PAYMENT_MODES } from "@/common/erp/hr-types";
import type { PaidThroughAccountOption } from "@/common/erp/purchasing-types";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
import {
  AdminFormActions,
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  AdminFormShell,
  type ErpFormViewBaseProps,
} from "@/modules/admin/ui";
import { Input } from "@/components/ui/input";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";

export type SalaryPaymentFormViewProps = ErpFormViewBaseProps;

export function SalaryPaymentFormView({
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: SalaryPaymentFormViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formId = useId();
  const { activeStoreId } = useErpStores();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isModal = variant === "modal";

  const [employees, setEmployees] = useState<ErpEmployeeOption[]>([]);
  const [accounts, setAccounts] = useState<PaidThroughAccountOption[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentMode, setPaymentMode] = useState<string>(ERP_SALARY_PAYMENT_MODES[0]);
  const [accountId, setAccountId] = useState("");

  const selectedEmployee = employees.find((e) => e.id === employeeId);

  useEffect(() => {
    const preselected = searchParams.get("employeeId");
    if (preselected) setEmployeeId(preselected);
  }, [searchParams]);

  useEffect(() => {
    const q = activeStoreId ? `?view=options&storeId=${encodeURIComponent(activeStoreId)}` : "?view=options";
    adminGet<{ data: ErpEmployeeOption[] }>(`erp/employees${q}`).then((res) =>
      setEmployees(res.data ?? []),
    );
  }, [activeStoreId]);

  useEffect(() => {
    const q = activeStoreId
      ? `?view=accounts&storeId=${encodeURIComponent(activeStoreId)}`
      : "?view=accounts";
    adminGet<{ data: PaidThroughAccountOption[] }>(`erp/salary-payments${q}`).then((res) =>
      setAccounts(res.data ?? []),
    );
  }, [activeStoreId]);

  useEffect(() => {
    if (!employeeId || !selectedEmployee) return;
    adminGet<{ data: PaidThroughAccountOption[] }>(
      `erp/salary-payments?view=accounts&storeId=${encodeURIComponent(selectedEmployee.store_id)}`,
    ).then((res) => setAccounts(res.data ?? []));
  }, [employeeId, selectedEmployee?.store_id]);

  function handleCancel() {
    if (isModal) onOpenChange?.(false);
    else router.push("/admin/erp/salary-payments");
  }

  function handleSuccessNavigate() {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.();
      return;
    }
    router.push("/admin/erp/salary-payments");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = parseFloat(amountPaid);
    if (!employeeId) return setError("Select an employee.");
    if (!amount || amount <= 0) return setError("Enter a positive amount.");

    startTransition(async () => {
      try {
        await adminPost("erp/salary-payments", {
          employeeId,
          storeId: selectedEmployee!.store_id,
          paymentDate,
          totalPaid: amount,
          paymentMode,
          paidThroughAccountId: accountId || undefined,
        });
        handleSuccessNavigate();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save payment.");
      }
    });
  }

  if (isModal && !open) return null;

  const title = "Add salary payment";
  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel="Save payment"
      pending={isPending}
    />
  ) : undefined;

  const balanceSummary = selectedEmployee ? (
    <div className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm sm:col-span-2">
      <p>
        Salary balance:{" "}
        <span className="font-semibold tabular-nums">
          {formatCurrencyAmount(selectedEmployee.salary_balance)}
        </span>
      </p>
      <p>
        Advance balance:{" "}
        <span className="font-semibold tabular-nums">
          {formatCurrencyAmount(selectedEmployee.advance_balance)}
        </span>
      </p>
      <p className="text-xs text-muted-foreground">
        Any amount over the salary balance is recorded as an advance.
      </p>
    </div>
  ) : null;

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Pay salary to an employee. Posts to cash/bank and salaries payable."
      backHref="/admin/erp/salary-payments"
      breadcrumb={[
        { label: "Salary payments", href: "/admin/erp/salary-payments" },
        { label: "Add payment" },
      ]}
      size="lg"
      formId={formId}
      footer={footer}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <AdminFormSection title="Payment details">
          <AdminFormGrid>
            <AdminFormField label="Employee" htmlFor="employeeId" required className="sm:col-span-2">
              <select
                id="employeeId"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              >
                <option value="">Select employee…</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} — Balance {emp.salary_balance.toFixed(2)}
                  </option>
                ))}
              </select>
            </AdminFormField>
            <AdminFormField label="Payment date" htmlFor="paymentDate" required>
              <Input id="paymentDate" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </AdminFormField>
            <AdminFormField label="Payment mode" htmlFor="paymentMode">
              <select
                id="paymentMode"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
              >
                {ERP_SALARY_PAYMENT_MODES.map((mode) => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </select>
            </AdminFormField>
            <AdminFormField label="Paid through account" htmlFor="accountId">
              <select
                id="accountId"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">Default (Cash)</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </AdminFormField>
            <AdminFormField label="Amount paid" htmlFor="amountPaid" required>
              <Input
                id="amountPaid"
                type="number"
                min="0"
                step="0.001"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                required
              />
            </AdminFormField>
            {balanceSummary}
          </AdminFormGrid>
        </AdminFormSection>

        {!isModal ? (
          <AdminFormActions
            formId={formId}
            onCancel={handleCancel}
            submitLabel="Save payment"
            pending={isPending}
          />
        ) : null}
      </form>
    </AdminFormShell>
  );
}
