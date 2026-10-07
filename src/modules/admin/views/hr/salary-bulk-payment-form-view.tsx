"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ActiveStoreFormField,
  useActiveStoreFormField,
} from "@/modules/erp/components/use-active-store-form-field";

type LineState = {
  employeeId: string;
  employeeName: string;
  balance: number;
  advanceBalance: number;
  paymentFromAdvance: string;
  salaryPayment: string;
  comment: string;
};

export type SalaryBulkPaymentFormViewProps = ErpFormViewBaseProps;

export function SalaryBulkPaymentFormView({
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: SalaryBulkPaymentFormViewProps) {
  const router = useRouter();
  const formId = useId();
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode: "create" });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isModal = variant === "modal";
  const [accounts, setAccounts] = useState<PaidThroughAccountOption[]>([]);
  const [lines, setLines] = useState<LineState[]>([]);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState<string>(ERP_SALARY_PAYMENT_MODES[0]);
  const [accountId, setAccountId] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!effectiveStoreId) {
      setLines([]);
      return;
    }
    adminGet<{ data: PaidThroughAccountOption[] }>(
      `erp/salary-payments?view=accounts&storeId=${encodeURIComponent(effectiveStoreId)}`,
    ).then((res) => setAccounts(res.data ?? []));
    adminGet<{ data: ErpEmployeeOption[] }>(
      `erp/employees?view=options&storeId=${encodeURIComponent(effectiveStoreId)}`,
    ).then((res) =>
      setLines(
        (res.data ?? []).map((emp) => ({
          employeeId: emp.id,
          employeeName: emp.full_name,
          balance: emp.salary_balance,
          advanceBalance: emp.advance_balance,
          paymentFromAdvance: "",
          salaryPayment: "",
          comment: "",
        })),
      ),
    );
  }, [effectiveStoreId]);

  function updateLine(index: number, patch: Partial<LineState>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function lineTotal(line: LineState) {
    return parseFloat(line.salaryPayment) || 0;
  }

  const totals = lines.reduce(
    (acc, line) => {
      const salary = parseFloat(line.salaryPayment) || 0;
      const fromAdvance = parseFloat(line.paymentFromAdvance) || 0;
      return {
        balance: acc.balance + line.balance,
        advance: acc.advance + line.advanceBalance,
        fromAdvance: acc.fromAdvance + fromAdvance,
        salary: acc.salary + salary,
        total: acc.total + salary,
      };
    },
    { balance: 0, advance: 0, fromAdvance: 0, salary: 0, total: 0 },
  );

  function handleCancel() {
    if (isModal) onOpenChange?.(false);
    else router.push("/admin/erp/salary-bulk-payments");
  }

  function handleSuccessNavigate() {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.();
      return;
    }
    router.push("/admin/erp/salary-bulk-payments");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!effectiveStoreId) return setError(storeRequiredMessage ?? "Store is required.");

    const paymentLines = lines
      .map((line) => ({
        employeeId: line.employeeId,
        totalPayment: parseFloat(line.salaryPayment) || 0,
        paymentFromAdvance: parseFloat(line.paymentFromAdvance) || 0,
        comment: line.comment.trim() || undefined,
      }))
      .filter((l) => l.totalPayment > 0);

    if (paymentLines.length === 0) {
      return setError("Enter at least one salary payment amount.");
    }

    startTransition(async () => {
      try {
        await adminPost("erp/salary-bulk-payments", {
          storeId: effectiveStoreId,
          paymentDate,
          paymentMode,
          paidThroughAccountId: accountId || undefined,
          notes: notes.trim() || undefined,
          lines: paymentLines,
        });
        handleSuccessNavigate();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save bulk payment.");
      }
    });
  }

  if (isModal && !open) return null;

  const title = "Add bulk salary payment";
  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel="Save payment"
      pending={isPending}
    />
  ) : undefined;

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Any amount over an employee's salary balance is recorded as advance."
      backHref="/admin/erp/salary-bulk-payments"
      breadcrumb={[
        { label: "Salary bulk payments", href: "/admin/erp/salary-bulk-payments" },
        { label: "Add bulk payment" },
      ]}
      size="xl"
      formId={formId}
      footer={footer}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <AdminFormSection title="Batch details">
          <AdminFormGrid>
            <ActiveStoreFormField
              mode="create"
              stores={stores}
              activeStoreId={activeStoreId}
              storeId={storeId}
              onStoreIdChange={setStoreId}
            />
            <AdminFormField label="Payment date" htmlFor="paymentDate" required>
              <Input id="paymentDate" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </AdminFormField>
            <AdminFormField label="Payment mode" htmlFor="paymentMode" required>
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
            <AdminFormField label="Paid through account" htmlFor="accountId" required>
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
            <AdminFormField label="Note" htmlFor="notes" className="sm:col-span-2">
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </AdminFormField>
          </AdminFormGrid>
        </AdminFormSection>

        <AdminFormSection title="Employee payments">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Advance</TableHead>
                  <TableHead>From advance</TableHead>
                  <TableHead>Salary payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Comment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Select a store to load employees.
                    </TableCell>
                  </TableRow>
                ) : (
                  lines.map((line, index) => (
                    <TableRow key={line.employeeId}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="min-w-[140px]">{line.employeeName}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrencyAmount(line.balance)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrencyAmount(line.advanceBalance)}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          className="min-w-[100px]"
                          value={line.paymentFromAdvance}
                          onChange={(e) => updateLine(index, { paymentFromAdvance: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          className="min-w-[100px]"
                          value={line.salaryPayment}
                          onChange={(e) => updateLine(index, { salaryPayment: e.target.value })}
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCurrencyAmount(lineTotal(line))}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={line.comment}
                          onChange={(e) => updateLine(index, { comment: e.target.value })}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {lines.length > 0 ? (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="font-medium">Total</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCurrencyAmount(totals.balance)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCurrencyAmount(totals.advance)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCurrencyAmount(totals.fromAdvance)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCurrencyAmount(totals.salary)}</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{formatCurrencyAmount(totals.total)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              ) : null}
            </Table>
          </div>
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
