"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Calendar,
  CreditCard,
  FileText,
  Hash,
  Pencil,
  Phone,
  Plus,
  Store,
  Trash2,
  User,
  Wallet,
} from "lucide-react";

import type { ErpEmployeeDetail } from "@/common/erp/hr-types";
import { adminDelete, adminGet } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { AdminBreadcrumb } from "@/modules/admin/components/admin-breadcrumb";
import { AdminPageLayout } from "@/modules/admin/ui";
import { ActivityLogPanel } from "@/modules/erp/components/activity-log-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatDisplayDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd MMM yyyy");
  } catch {
    return value;
  }
}

function SummaryMetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "warning" | "muted";
}) {
  return (
    <Card size="sm" className="border border-border ring-0">
      <CardContent className="flex flex-col gap-1 pt-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p
          className={cn(
            "text-2xl font-semibold tabular-nums tracking-tight",
            tone === "primary" && "text-primary",
            tone === "warning" && "text-amber-700",
            tone === "muted" && "text-muted-foreground",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function MetaField({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-3", className)}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/80">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="mt-0.5 text-sm font-medium text-foreground">{children}</div>
      </div>
    </div>
  );
}

function TotalsRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className={emphasis ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={cn("tabular-nums", emphasis && "text-base font-semibold")}>{value}</span>
    </div>
  );
}

export function EmployeeDetailView({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [employee, setEmployee] = useState<ErpEmployeeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<"profile" | "statement" | "activity">("statement");

  useEffect(() => {
    adminGet<ErpEmployeeDetail>(`erp/employees/${employeeId}`)
      .then(setEmployee)
      .finally(() => setLoading(false));
  }, [employeeId]);

  const ledgerRows = useMemo(
    () => (employee?.ledger ? [...employee.ledger].reverse() : []),
    [employee?.ledger],
  );

  const totalPaid = useMemo(
    () => employee?.ledger.reduce((sum, row) => sum + row.payment_debit, 0) ?? 0,
    [employee?.ledger],
  );

  const totalAccrued = useMemo(
    () => employee?.ledger.reduce((sum, row) => sum + row.salary_credit, 0) ?? 0,
    [employee?.ledger],
  );

  const balancePayment = employee?.ledger.length
    ? employee.ledger[employee.ledger.length - 1].balance_after
    : (employee?.salary_balance ?? 0);

  async function handleDelete() {
    if (!confirm("Delete this employee? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await adminDelete(`erp/employees/${employeeId}`);
      router.push("/admin/erp/employees");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <AdminPageLayout>
        <AdminPageSkeleton />
      </AdminPageLayout>
    );
  }

  if (!employee) {
    return (
      <AdminPageLayout>
        <AdminBreadcrumb
          backHref="/admin/erp/employees"
          items={[
            { label: "Employees", href: "/admin/erp/employees" },
            { label: "Not found" },
          ]}
        />
        <p className="text-sm text-muted-foreground">This employee could not be found.</p>
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link href="/admin/erp/employees" />}
        >
          Back to employees
        </Button>
      </AdminPageLayout>
    );
  }

  const displayId = employee.employee_code ?? employee.employee_number;

  return (
    <AdminPageLayout>
      <AdminBreadcrumb
        backHref="/admin/erp/employees"
        items={[
          { label: "Employees", href: "/admin/erp/employees" },
          { label: employee.full_name },
        ]}
      />

      <Card className="border border-border ring-0">
        <CardContent className="flex flex-col gap-4 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {employee.is_active ? (
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  Active
                </Badge>
              ) : (
                <Badge variant="destructive">Discontinued</Badge>
              )}
              <span className="font-mono text-xs text-muted-foreground">{displayId}</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{employee.full_name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-3.5" aria-hidden />
                {employee.mobile}
              </span>
              {employee.store_name ? (
                <span className="inline-flex items-center gap-1.5">
                  <Store className="size-3.5" aria-hidden />
                  {employee.store_name}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-3.5" aria-hidden />
                Joined {formatDisplayDate(employee.joining_date)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              nativeButton={false}
              render={
                <Link
                  href={`/admin/erp/salary-payments?form=new&employeeId=${employeeId}`}
                />
              }
            >
              <Plus data-icon="inline-start" />
              Record payment
            </Button>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href={`/admin/erp/employees?form=edit&id=${employeeId}`} />}
            >
              <Pencil data-icon="inline-start" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={deleting}
              onClick={handleDelete}
            >
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryMetricCard
              label="Salary balance"
              value={formatCurrencyAmount(balancePayment)}
              tone={balancePayment > 0 ? "primary" : "muted"}
            />
            <SummaryMetricCard
              label="Advance balance"
              value={formatCurrencyAmount(employee.advance_balance)}
              tone={employee.advance_balance > 0 ? "warning" : "muted"}
            />
            <SummaryMetricCard
              label="Net salary"
              value={formatCurrencyAmount(employee.net_salary)}
            />
            <SummaryMetricCard
              label="Total paid"
              value={formatCurrencyAmount(totalPaid)}
              tone="muted"
            />
          </div>

          <div className="flex gap-1 border-b">
            {(
              [
                ["profile", "Profile"],
                ["statement", "Statement"],
                ["activity", "Activity"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  tab === key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "profile" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border border-border ring-0">
                <CardHeader className="border-b border-border pb-4">
                  <CardTitle className="text-base">Personal information</CardTitle>
                  <CardDescription>Contact and identity details.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-5 pt-5 sm:grid-cols-2">
                  <MetaField icon={User} label="Full name">
                    {employee.full_name}
                  </MetaField>
                  <MetaField icon={Phone} label="Mobile">
                    {employee.mobile}
                  </MetaField>
                  <MetaField icon={Calendar} label="Date of birth">
                    {formatDisplayDate(employee.date_of_birth)}
                  </MetaField>
                  <MetaField icon={Hash} label="Employee ID">
                    {displayId}
                  </MetaField>
                  <MetaField icon={BadgeCheck} label="ID number">
                    {employee.id_number ?? "—"}
                  </MetaField>
                  <MetaField icon={Calendar} label="ID expiry">
                    {formatDisplayDate(employee.id_expiry_date)}
                  </MetaField>
                </CardContent>
              </Card>

              <Card className="border border-border ring-0">
                <CardHeader className="border-b border-border pb-4">
                  <CardTitle className="text-base">Employment</CardTitle>
                  <CardDescription>Store assignment and employment status.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-5 pt-5 sm:grid-cols-2">
                  <MetaField icon={Store} label="Store">
                    {employee.store_name ?? "—"}
                  </MetaField>
                  <MetaField icon={Calendar} label="Joining date">
                    {formatDisplayDate(employee.joining_date)}
                  </MetaField>
                  <MetaField icon={BadgeCheck} label="Status">
                    {employee.is_active ? "Active" : "Discontinued"}
                  </MetaField>
                  {!employee.is_active && employee.discontinuation_date ? (
                    <MetaField icon={Calendar} label="Discontinued on">
                      {formatDisplayDate(employee.discontinuation_date)}
                    </MetaField>
                  ) : null}
                  <MetaField icon={Wallet} label="Basic salary">
                    {formatCurrencyAmount(employee.basic_salary)}
                  </MetaField>
                  <MetaField icon={CreditCard} label="Allowance">
                    {formatCurrencyAmount(employee.allowance)}
                  </MetaField>
                </CardContent>
              </Card>

              {employee.notes?.trim() ? (
                <Card className="border border-border ring-0 lg:col-span-2">
                  <CardHeader className="border-b border-border pb-4">
                    <CardTitle className="text-base">Notes</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-5">
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {employee.notes}
                    </p>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          ) : null}

          {tab === "statement" ? (
            <Card className="border border-border ring-0">
              <CardHeader className="border-b border-border">
                <CardTitle>Salary statement</CardTitle>
                <CardDescription>
                  Accrued salary, payments, and running balance for this employee.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {ledgerRows.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                    <Wallet className="size-10 text-muted-foreground/40" aria-hidden />
                    <p className="text-sm font-medium">No salary entries yet</p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      Record a salary payment or generate pay slips to build the statement.
                    </p>
                    <Button
                      size="sm"
                      nativeButton={false}
                      render={
                        <Link
                          href={`/admin/erp/salary-payments?form=new&employeeId=${employeeId}`}
                        />
                      }
                    >
                      <Plus data-icon="inline-start" />
                      Record payment
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead>Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Salary</TableHead>
                          <TableHead className="text-right">Payment</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ledgerRows.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {formatDisplayDate(row.entry_date)}
                            </TableCell>
                            <TableCell className="max-w-[240px] truncate text-sm">
                              {row.description}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {row.salary_credit > 0
                                ? formatCurrencyAmount(row.salary_credit)
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {row.payment_debit > 0
                                ? formatCurrencyAmount(row.payment_debit)
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium tabular-nums">
                              {formatCurrencyAmount(row.balance_after)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={4} className="text-right font-medium">
                            Balance payable
                          </TableCell>
                          <TableCell className="text-right font-bold tabular-nums">
                            {formatCurrencyAmount(balancePayment)}
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {tab === "activity" ? (
            <Card className="border border-border ring-0">
              <CardHeader>
                <CardTitle>Activity</CardTitle>
                <CardDescription>Changes and actions recorded for this employee.</CardDescription>
              </CardHeader>
              <CardContent>
                <ActivityLogPanel entityType="employee" entityId={employeeId} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card className="h-fit border border-border ring-0">
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="text-base">Salary summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-5 text-sm">
              <TotalsRow label="Basic salary" value={formatCurrencyAmount(employee.basic_salary)} />
              <TotalsRow label="Allowance" value={formatCurrencyAmount(employee.allowance)} />
              <Separator />
              <TotalsRow
                label="Net salary"
                value={formatCurrencyAmount(employee.net_salary)}
                emphasis
              />
              <Separator />
              <TotalsRow label="Salary accrued" value={formatCurrencyAmount(totalAccrued)} />
              <TotalsRow label="Payments made" value={formatCurrencyAmount(totalPaid)} />
              <TotalsRow
                label="Advance balance"
                value={formatCurrencyAmount(employee.advance_balance)}
              />
              <Separator />
              <TotalsRow
                label="Balance payable"
                value={formatCurrencyAmount(balancePayment)}
                emphasis
              />
            </CardContent>
          </Card>

          <Card className="h-fit border border-border ring-0">
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="text-base">Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-5">
              <Button
                size="sm"
                className="w-full justify-start"
                nativeButton={false}
                render={
                  <Link
                    href={`/admin/erp/salary-payments?form=new&employeeId=${employeeId}`}
                  />
                }
              >
                <Wallet data-icon="inline-start" />
                Record salary payment
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-start"
                nativeButton={false}
                render={<Link href="/admin/erp/pay-slips" />}
              >
                <FileText data-icon="inline-start" />
                View pay slips
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-start"
                nativeButton={false}
                render={<Link href={`/admin/erp/employees?form=edit&id=${employeeId}`} />}
              >
                <Pencil data-icon="inline-start" />
                Edit employee
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminPageLayout>
  );
}
