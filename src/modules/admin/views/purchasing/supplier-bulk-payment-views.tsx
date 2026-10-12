"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import type {
  BulkSupplierPaymentBatchRow,
  BulkSupplierPaymentLine,
  ErpPurchaseBillListRow,
  PaidThroughAccountOption,
} from "@/common/erp/purchasing-types";
import { ERP_SUPPLIER_PAYMENT_MODES } from "@/common/erp/purchasing-types";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { AdminBreadcrumb } from "@/modules/admin/components/admin-breadcrumb";
import {
  AdminFormActions,
  AdminFormColumns,
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  AdminFormShell,
  PurchaseBillSearchSelect,
  VendorSearchSelect,
  type ErpFormViewBaseProps,
} from "@/modules/admin/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  ActiveStoreFormField,
  useActiveStoreFormField,
} from "@/modules/erp/components/use-active-store-form-field";

type PendingLine = {
  purchaseBillId: string;
  billNumber: string;
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
    const amount = Math.min(existing.balanceDue, existing.amount + line.amount);
    byBillId.set(line.purchaseBillId, { ...existing, amount });
  }

  return Array.from(byBillId.values());
}

export type SupplierBulkPaymentFormViewProps = ErpFormViewBaseProps;

export function SupplierBulkPaymentFormView({
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: SupplierBulkPaymentFormViewProps) {
  const router = useRouter();
  const formId = useId();
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode: "create" });
  const [isPending, startTransition] = useTransition();
  const [isAddingLine, setIsAddingLine] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isModal = variant === "modal";

  const [accounts, setAccounts] = useState<PaidThroughAccountOption[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<PaidThroughAccountOption[]>([]);
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
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!effectiveStoreId) return;
    adminGet<{ data: PaidThroughAccountOption[] }>(
      `erp/supplier-payments?view=accounts&storeId=${encodeURIComponent(effectiveStoreId)}`,
    ).then((res) => setAccounts(res.data ?? []));
    adminGet<{ data: PaidThroughAccountOption[] }>(
      `erp/supplier-payments?view=expense-accounts&storeId=${encodeURIComponent(effectiveStoreId)}`,
    ).then((res) => setExpenseAccounts(res.data ?? []));
  }, [effectiveStoreId]);

  const total = lines.reduce((s, l) => s + l.amount, 0);
  const bankChargesAmount = parseFloat(bankCharges) || 0;

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/erp/supplier-bulk-payments");
    }
  }

  function handleSuccessNavigate(batchId?: string) {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(batchId);
      return;
    }
    router.push(
      batchId
        ? `/admin/erp/supplier-bulk-payments/${encodeURIComponent(batchId)}`
        : "/admin/erp/supplier-bulk-payments",
    );
  }

  async function buildFifoLines(amount: number, excludeBillIds: string[]): Promise<PendingLine[]> {
    if (!effectiveStoreId) return [];
    const exclude = excludeBillIds.join(",");
    const fifoUrl = vendorId
      ? `erp/supplier-payments?view=fifo&storeId=${encodeURIComponent(effectiveStoreId)}&vendorId=${encodeURIComponent(vendorId)}&amount=${amount}&exclude=${encodeURIComponent(exclude)}`
      : `erp/supplier-payments?view=fifo&storeId=${encodeURIComponent(effectiveStoreId)}&amount=${amount}&exclude=${encodeURIComponent(exclude)}`;
    const res = await adminGet<{
      allocations: Array<{
        purchaseBillId?: string;
        purchase_bill_id?: string;
        amount: number;
      }>;
    }>(fifoUrl);

    type BillLookup = {
      id: string;
      purchase_bill_number: string;
      balance_due: number;
      vendor_name?: string | null;
    };
    const lookup = new Map<string, BillLookup>();
    if (vendorId) {
      const billsRes = await adminGet<{ data: BillLookup[] }>(
        `erp/supplier-payments?view=payable-bills&vendorId=${encodeURIComponent(vendorId)}&storeId=${encodeURIComponent(effectiveStoreId)}`,
      );
      for (const row of billsRes.data ?? []) {
        if (row.balance_due > 0) lookup.set(row.id, row);
      }
    } else {
      const q = new URLSearchParams({
        page: "0",
        limit: "100",
        openOnly: "1",
        storeId: effectiveStoreId,
      });
      const full = await adminGet<{ data: ErpPurchaseBillListRow[] }>(
        `erp/purchase-bills?${q.toString()}`,
      );
      for (const row of full.data ?? []) {
        if (row.balance_due > 0) lookup.set(row.id, row);
      }
    }
    const pending: PendingLine[] = [];

    for (const alloc of res.allocations) {
      const purchaseBillId = alloc.purchaseBillId ?? alloc.purchase_bill_id;
      if (!purchaseBillId || excludeBillIds.includes(purchaseBillId)) continue;
      const bill = lookup.get(purchaseBillId);
      if (!bill) continue;
      pending.push({
        purchaseBillId: bill.id,
        billNumber: bill.purchase_bill_number,
        vendorName: bill.vendor_name ?? (vendorLabel || null),
        balanceDue: bill.balance_due,
        amount: alloc.amount,
      });
    }

    return pending;
  }

  async function addLine() {
    setError(null);
    const amt = parseFloat(lineAmount);
    if (!amt || amt <= 0) return setError("Enter a positive amount.");
    if (!effectiveStoreId) return setError(storeRequiredMessage ?? "Store is required.");

    setIsAddingLine(true);
    try {
      if (!selectedBillId) {
        const fifoLines = await buildFifoLines(amt, lines.map((l) => l.purchaseBillId));
        if (fifoLines.length === 0) {
          setError("No open bills available for FIFO allocation.");
          return;
        }
        setLines((prev) => mergePendingLines(prev, fifoLines));
        setLineAmount("");
        setError(null);
        return;
      }

      if (!vendorId) {
        setError("Select a vendor when adding a specific bill.");
        return;
      }
      if (lines.some((l) => l.purchaseBillId === selectedBillId)) {
        setError("Bill already added.");
        return;
      }
      if (amt > selectedBillBalance) {
        setError("Amount exceeds bill balance.");
        return;
      }
      setLines((prev) =>
        mergePendingLines(prev, [
          {
            purchaseBillId: selectedBillId,
            billNumber: billLabel,
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
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add bill payment.");
    } finally {
      setIsAddingLine(false);
    }
  }

  function removeLine(billId: string) {
    setLines((prev) => prev.filter((l) => l.purchaseBillId !== billId));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lines.length === 0) return setError("Add at least one bill payment.");
    if (!accountId) return setError("Paid through account is required.");
    if (!effectiveStoreId) return setError(storeRequiredMessage ?? "Store is required.");
    if (bankChargesAmount >= total) return setError("Bank charges must be less than total payment.");
    if (bankChargesAmount > 0 && !bankChargesAccountId) {
      return setError("Expense account is required for bank charges.");
    }

    startTransition(async () => {
      try {
        const res = await adminPost<{ batchId: string }>("erp/supplier-payments", {
          bulk: true,
          storeId: effectiveStoreId,
          paymentDate,
          paymentMode,
          accountId,
          bankCharges: bankChargesAmount,
          bankChargesAccountId: bankChargesAccountId || undefined,
          notes: notes || undefined,
          billLines: lines.map((l) => ({
            purchaseBillId: l.purchaseBillId,
            amount: l.amount,
          })),
        });
        handleSuccessNavigate(res.batchId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save bulk payment.");
      }
    });
  }

  if (isModal && !open) return null;

  const title = "Bulk payment";
  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel="Save bulk payment"
      pending={isPending}
    />
  ) : undefined;

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Apply one payment across multiple purchase bills."
      backHref="/admin/erp/supplier-bulk-payments"
      breadcrumb={[
        { label: "Payment Bulk", href: "/admin/erp/supplier-bulk-payments" },
        { label: "Add bulk payment" },
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
              <AdminFormField label="Notes" className="sm:col-span-2 lg:col-span-3">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </AdminFormField>
            </AdminFormGrid>
          </AdminFormSection>

          <AdminFormSection title="Add bill payment">
            <AdminFormGrid cols={1}>
              <AdminFormField
                label="Vendor"
                hint="Optional for FIFO — limits allocation to one vendor's bills."
              >
                <VendorSearchSelect
                  value={vendorId || null}
                  selectedLabel={vendorLabel || undefined}
                  disabled={!effectiveStoreId}
                  onChange={(id, option) => {
                    setVendorId(id ?? "");
                    setVendorLabel(option?.label ?? "");
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
                    if (id && balance > 0) setLineAmount(String(balance));
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
                    placeholder="Amount"
                    value={lineAmount}
                    onChange={(e) => setLineAmount(e.target.value)}
                    className="min-w-0 flex-1"
                    disabled={isAddingLine}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 min-w-[6.5rem] justify-center"
                    disabled={isAddingLine || !effectiveStoreId}
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

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        {!isModal ? (
          <div className="flex gap-2">
            <Link
              href="/admin/erp/supplier-bulk-payments"
              className={buttonVariants({ variant: "outline" })}
            >
              Cancel
            </Link>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save bulk payment"}
            </Button>
          </div>
        ) : null}
      </form>
    </AdminFormShell>
  );
}

export function SupplierBulkPaymentDetailView() {
  const params = useParams();
  const batchId = decodeURIComponent((params as { batchId: string }).batchId);
  const [batch, setBatch] = useState<BulkSupplierPaymentBatchRow | null>(null);
  const [lines, setLines] = useState<BulkSupplierPaymentLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminGet<{
      batch: BulkSupplierPaymentBatchRow;
      lines: BulkSupplierPaymentLine[];
    }>(`erp/supplier-payments/bulk/${encodeURIComponent(batchId)}`)
      .then((res) => {
        setBatch(res.batch);
        setLines(res.lines);
      })
      .finally(() => setLoading(false));
  }, [batchId]);

  if (loading) return <p className="p-4 text-sm">Loading…</p>;
  if (!batch) return <p className="p-4 text-sm">Bulk payment not found.</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <AdminBreadcrumb
        backHref="/admin/erp/supplier-bulk-payments"
        items={[
          { label: "Payment Bulk", href: "/admin/erp/supplier-bulk-payments" },
          { label: "Detail" },
        ]}
      />

      <div className="space-y-1 rounded-lg border p-4 text-sm">
        <h1 className="text-lg font-semibold">Bulk payment</h1>
        <p>Payment date: {batch.payment_date}</p>
        <p>Mode: {batch.payment_mode}</p>
        <p>Account: {batch.account_name ?? "—"}</p>
        <p>Note: {batch.notes ?? "—"}</p>
        <p>Total: {formatCurrencyAmount(batch.total_amount)}</p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Supplier</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Current balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <TableRow key={l.payment_id}>
              <TableCell>{l.vendor_name ?? "—"}</TableCell>
              <TableCell>{formatCurrencyAmount(l.amount)}</TableCell>
              <TableCell>{formatCurrencyAmount(l.current_balance)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
