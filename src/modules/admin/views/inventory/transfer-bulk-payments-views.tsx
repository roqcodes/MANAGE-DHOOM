"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

import type {
  ErpTransferPaymentListRow,
  PendingTransferPaymentRow,
} from "@/common/erp/inventory-types";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { adminListPath, useAdminGetQuery } from "@/modules/admin/lib/use-admin-get-query";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { coalesceNumber } from "@/lib/numeric-input";
import {
  AdminFormActions,
  AdminFormColumns,
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  AdminFormShell,
  AdminPageHeader,
  AdminPageLayout,
  useErpFormModal,
  type ErpFormViewBaseProps,
} from "@/modules/admin/ui";
import { StoreSelect, useErpStores } from "@/modules/erp/components/use-erp-stores";

export function TransferBulkPaymentsListView() {
  const { isOpen, modalProps, openNew } = useErpFormModal("/admin/erp/transfer-bulk-payments");
  const [search, setSearch] = useState("");
  const listPath = adminListPath("erp/transfer-payments", {
    search: search.trim() || undefined,
  });
  const { data, isPending, refetch } = useAdminGetQuery<{
    data: ErpTransferPaymentListRow[];
    total: number;
  }>({
    path: listPath,
  });
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  if (isPending && !data) return <AdminPageSkeleton />;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Stock Transfer Bulk Payment"
        breadcrumb={[{ label: "Transfer bulk payments", href: "/admin/erp/transfer-bulk-payments" }]}
        description="Record payments against pending stock transfer balances."
        actions={
          <Button size="sm" onClick={() => openNew()}>
            <Plus data-icon="inline-start" />
            Add new payment
          </Button>
        }
      />

      <Input
        placeholder="Search payment number…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
          No transfer payments recorded yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Payment #</th>
                <th className="px-3 py-2">Transfer</th>
                <th className="px-3 py-2">From</th>
                <th className="px-3 py-2">To</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium" title={r.payment_number}>
                    {formatErpDocRef("TP", r.id)}
                  </td>
                  <td className="px-3 py-2" title={r.transfer_number ?? undefined}>
                    {r.transfer_id ? formatErpDocRef("ST", r.transfer_id) : "—"}
                  </td>
                  <td className="px-3 py-2">{r.from_store_name ?? "—"}</td>
                  <td className="px-3 py-2">{r.to_store_name ?? "—"}</td>
                  <td className="px-3 py-2">{r.payment_date}</td>
                  <td className="px-3 py-2">{r.payment_mode}</td>
                  <td className="px-3 py-2 tabular-nums">{formatCurrencyAmount(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-slate-500">{total} payments</p>

      {isOpen ? (
        <TransferBulkPaymentFormView
          variant="modal"
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => void refetch()}
        />
      ) : null}
    </AdminPageLayout>
  );
}

export type TransferBulkPaymentFormViewProps = ErpFormViewBaseProps;

export function TransferBulkPaymentFormView({
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: TransferBulkPaymentFormViewProps) {
  const router = useRouter();
  const formId = useId();
  const searchParams = useSearchParams();
  const prefillTransferId = searchParams.get("transferId") ?? "";
  const { stores } = useErpStores();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isModal = variant === "modal";

  const [fromStoreId, setFromStoreId] = useState("");
  const [toStoreId, setToStoreId] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [pendingRows, setPendingRows] = useState<PendingTransferPaymentRow[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!fromStoreId && !toStoreId) return;
    const q = new URLSearchParams({ view: "pending" });
    if (fromStoreId) q.set("fromStoreId", fromStoreId);
    if (toStoreId) q.set("toStoreId", toStoreId);
    adminGet<{ data: PendingTransferPaymentRow[] }>(`erp/transfer-payments?${q.toString()}`).then(
      (res) => {
        setPendingRows(res.data);
        const init: Record<string, number> = {};
        for (const row of res.data) {
          init[row.transfer_id] =
            prefillTransferId && row.transfer_id === prefillTransferId
              ? row.balance_due
              : prefillTransferId
                ? 0
                : row.balance_due;
        }
        setAllocations(init);
      },
    );
  }, [fromStoreId, toStoreId, prefillTransferId]);

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/erp/transfer-bulk-payments");
    }
  }

  function handleSuccessNavigate() {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.();
      return;
    }
    router.push("/admin/erp/transfer-bulk-payments");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const items = Object.entries(allocations)
      .filter(([, amt]) => coalesceNumber(amt) > 0)
      .map(([transferId, amount]) => ({
        transferId,
        amount: coalesceNumber(amount),
      }));

    if (items.length === 0) {
      setError("Select at least one transfer with a payment amount");
      return;
    }

    startTransition(async () => {
      try {
        await adminPost("erp/transfer-payments", {
          paymentDate,
          paymentMode,
          notes: notes || undefined,
          allocations: items,
        });
        handleSuccessNavigate();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Payment failed");
      }
    });
  }

  if (isModal && !open) return null;

  const title = "New transfer payment";
  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel="Record payment"
      pending={pending}
    />
  ) : undefined;

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Allocate payment across pending stock transfer balances."
      backHref="/admin/erp/transfer-bulk-payments"
      breadcrumb={[
        { label: "Transfer Bulk Payments", href: "/admin/erp/transfer-bulk-payments" },
        { label: "New Payment" },
      ]}
      size="landscape"
      formId={formId}
      footer={footer}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <AdminFormColumns cols={2}>
          <AdminFormSection title="Payment details">
            <AdminFormGrid cols={2}>
              <AdminFormField label="Payment from store">
                <StoreSelect
                  value={fromStoreId}
                  onChange={setFromStoreId}
                  stores={stores}
                  allowAll
                  label=""
                />
              </AdminFormField>
              <AdminFormField label="Payment to store">
                <StoreSelect
                  value={toStoreId}
                  onChange={setToStoreId}
                  stores={stores}
                  allowAll
                  label=""
                />
              </AdminFormField>
              <AdminFormField label="Payment date">
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </AdminFormField>
              <AdminFormField label="Payment type">
                <select
                  className="h-9 w-full rounded-md border border-input px-3 text-sm"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                >
                  {["Cash", "Card", "Cheque", "Bank Transfer", "Bank Remittance"].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </AdminFormField>
              <AdminFormField label="Notes" className="sm:col-span-2">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </AdminFormField>
            </AdminFormGrid>
          </AdminFormSection>

          <AdminFormSection title="Pending transfers">
            {pendingRows.length === 0 ? (
              <p className="text-sm text-slate-500">
                No pending transfer balances for selected stores.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Transfer</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Balance due</th>
                      <th className="px-3 py-2">Amount to pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRows.map((row) => (
                      <tr key={row.transfer_id} className="border-t">
                        <td className="px-3 py-2 font-medium">{row.transfer_number}</td>
                        <td className="px-3 py-2">{row.transfer_date}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatCurrencyAmount(row.balance_due)}
                        </td>
                        <td className="px-3 py-2">
                          <NumericInput
                            min={0}
                            max={row.balance_due}
                            step="0.01"
                            value={allocations[row.transfer_id] ?? Number.NaN}
                            onValueChange={(amount) =>
                              setAllocations({
                                ...allocations,
                                [row.transfer_id]: amount,
                              })
                            }
                            className="w-28"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminFormSection>
        </AdminFormColumns>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {!isModal ? (
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Processing…" : "Record Payment"}
            </Button>
            <Link
              href="/admin/erp/transfer-bulk-payments"
              className={buttonVariants({ variant: "outline" })}
            >
              Cancel
            </Link>
          </div>
        ) : null}
      </form>
    </AdminFormShell>
  );
}
