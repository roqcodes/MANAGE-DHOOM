"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import type { PaidThroughAccountOption } from "@/common/erp/purchasing-types";
import { ERP_SUPPLIER_PAYMENT_MODES } from "@/common/erp/purchasing-types";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
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
import { Card, CardContent } from "@/components/ui/card";
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
  vendorId: string;
  vendorName: string | null;
  balanceDue: number;
  amount: number;
};

export type SupplierPaymentFormViewProps = ErpFormViewBaseProps;

export function SupplierPaymentFormView({
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: SupplierPaymentFormViewProps) {
  const router = useRouter();
  const formId = useId();
  const searchParams = useSearchParams();
  const prefillBillId = searchParams.get("billId") ?? "";
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode: "create" });
  const [isPending, startTransition] = useTransition();
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
  const [reference, setReference] = useState("");
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

  useEffect(() => {
    if (!prefillBillId || !effectiveStoreId) return;
    adminGet<{
      bill: {
        id: string;
        vendor_id: string;
        balance_due: number;
        purchase_bill_number: string;
        vendors?: { name: string | null } | null;
      };
    }>(`erp/purchase-bills/${prefillBillId}`).then((res) => {
      const bill = res.bill;
      const balance = bill.balance_due ?? 0;
      if (balance <= 0) return;
      setLines([
        {
          purchaseBillId: bill.id,
          billNumber: bill.purchase_bill_number,
          vendorId: bill.vendor_id,
          vendorName: bill.vendors?.name ?? null,
          balanceDue: balance,
          amount: balance,
        },
      ]);
    });
  }, [prefillBillId, effectiveStoreId]);

  const total = lines.reduce((s, l) => s + l.amount, 0);
  const bankChargesAmount = parseFloat(bankCharges) || 0;

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/erp/supplier-payments");
    }
  }

  function handleSuccessNavigate(id?: string) {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(id);
      return;
    }
    router.push(id ? `/admin/erp/supplier-payments/${id}` : "/admin/erp/supplier-payments");
  }

  function addLine() {
    const amt = parseFloat(lineAmount);
    if (!vendorId) return setError("Select a vendor.");
    if (!selectedBillId) return setError("Select a purchase bill.");
    if (!amt || amt <= 0) return setError("Enter a positive amount.");
    if (lines.some((l) => l.purchaseBillId === selectedBillId)) {
      return setError("Bill already added.");
    }
    if (amt > selectedBillBalance) return setError("Amount exceeds bill balance.");
    const firstVendor = lines[0]?.vendorId;
    if (firstVendor && firstVendor !== vendorId) {
      return setError("All bills must belong to the same vendor on a single payment.");
    }
    setLines((prev) => [
      ...prev,
      {
        purchaseBillId: selectedBillId,
        billNumber: billLabel,
        vendorId,
        vendorName: vendorLabel || null,
        balanceDue: selectedBillBalance,
        amount: amt,
      },
    ]);
    setLineAmount("");
    setSelectedBillId("");
    setBillLabel("");
    setSelectedBillBalance(0);
    setError(null);
  }

  function removeLine(billId: string) {
    setLines((prev) => prev.filter((l) => l.purchaseBillId !== billId));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (lines.length === 0) return setError("Add at least one bill payment.");
    if (!accountId) return setError("Paid through account is required.");
    if (!effectiveStoreId) return setError(storeRequiredMessage ?? "Store is required.");
    if (bankChargesAmount >= total) return setError("Bank charges must be less than total payment.");
    if (bankChargesAmount > 0 && !bankChargesAccountId) {
      return setError("Expense account is required for bank charges.");
    }

    const paymentVendorId = lines[0].vendorId;
    if (lines.some((l) => l.vendorId !== paymentVendorId)) {
      return setError("All bills must belong to the same vendor.");
    }

    startTransition(async () => {
      try {
        const res = await adminPost<{ id: string }>("erp/supplier-payments", {
          vendorId: paymentVendorId,
          storeId: effectiveStoreId,
          paymentDate,
          paymentMode,
          accountId,
          totalAmount: total,
          bankCharges: bankChargesAmount,
          bankChargesAccountId: bankChargesAccountId || undefined,
          reference: reference || undefined,
          notes: notes || undefined,
          isBulk: false,
          allocations: lines.map((l) => ({
            purchaseBillId: l.purchaseBillId,
            amount: l.amount,
          })),
        });
        handleSuccessNavigate(res.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save payment.");
      }
    });
  }

  if (isModal && !open) return null;

  const title = "Add payment made";
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
      description="Record a supplier payment against one or more purchase bills."
      backHref="/admin/erp/supplier-payments"
      breadcrumb={[
        { label: "Payments made", href: "/admin/erp/supplier-payments" },
        { label: "Add payment" },
      ]}
      size="landscape"
      formId={formId}
      footer={footer}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <AdminFormColumns cols={2}>
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
              <AdminFormField label="Paid through account" required className="sm:col-span-2">
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
              <AdminFormField label="Reference #">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Notes" className="sm:col-span-2">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </AdminFormField>
            </AdminFormGrid>
          </AdminFormSection>

          <AdminFormSection title="Add bill payment">
            <AdminFormGrid cols={1}>
              <AdminFormField label="Vendor" required>
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
              <AdminFormField label="Purchase bill" required>
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
                <Input
                  type="number"
                  placeholder="Amount"
                  value={lineAmount}
                  onChange={(e) => setLineAmount(e.target.value)}
                />
              </AdminFormField>
            </AdminFormGrid>
            <div className="mt-3">
              <Button type="button" variant="outline" onClick={addLine}>
                Add bill
              </Button>
            </div>
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
              href="/admin/erp/supplier-payments"
              className={buttonVariants({ variant: "outline" })}
            >
              Cancel
            </Link>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save payment"}
            </Button>
          </div>
        ) : null}
      </form>
    </AdminFormShell>
  );
}
