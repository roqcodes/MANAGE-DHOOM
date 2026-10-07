"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";

import type { VendorPurchaseOrderDetail } from "@/modules/vendor/types";
import {
  acceptVendorPurchaseOrderAction,
  markVendorPurchaseOrderDeliveredAction,
} from "@/modules/vendor/actions/vendor-purchase-orders.actions";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import { TableShell } from "@/modules/admin/components/empty-state";
import { CurrencyAmount } from "@/components/currency-amount";
import { currencyLabel, formatCurrencyAmount } from "@/lib/format-currency";

function formatMoney(n: number | null) {
  if (n == null) return "—";
  return formatCurrencyAmount(n, { minimumFractionDigits: 2 });
}

export function VendorPurchaseOrderDetailView({
  po,
}: {
  po: VendorPurchaseOrderDetail;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const status = po.status ?? "";
  const items = po.purchase_order_items ?? [];

  const lineTotal = (qty: number | null, price: number | null) => {
    if (qty == null || price == null) return null;
    return qty * price;
  };

  function onAccept() {
    setMessage(null);
    startTransition(async () => {
      const res = await acceptVendorPurchaseOrderAction(po.id);
      if (!res.ok) {
        setMessage(res.message);
        return;
      }
      router.refresh();
    });
  }

  function onDelivered() {
    setMessage(null);
    startTransition(async () => {
      const res = await markVendorPurchaseOrderDeliveredAction(po.id);
      if (!res.ok) {
        setMessage(res.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Link
        href="/vendor/purchase-orders"
        className="inline-flex items-center gap-2 text-[13px] font-bold text-slate-500 hover:text-[#2563EB]"
      >
        <ArrowLeft size={16} />
        Back to purchase orders
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
            Purchase order
          </p>
          <h1 className="mt-1 font-mono text-xl font-extrabold text-slate-900">
            {po.id}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {po.created_at
              ? format(new Date(po.created_at), "MMM d, yyyy · HH:mm")
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={status} />
          <span className="text-lg font-extrabold text-slate-900">
            <CurrencyAmount amount={po.total_amount} />
          </span>
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {message}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {status === "pending" && (
          <button
            type="button"
            disabled={isPending}
            onClick={onAccept}
            className="rounded-xl bg-[#2563EB] px-5 py-2.5 text-[13px] font-extrabold text-white transition hover:bg-[#1D4ED8] disabled:opacity-50"
          >
            {isPending ? "Working…" : "Accept PO"}
          </button>
        )}
        {status === "accepted" && (
          <button
            type="button"
            disabled={isPending}
            onClick={onDelivered}
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-[13px] font-extrabold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {isPending ? "Working…" : "Mark delivered"}
          </button>
        )}
        {status === "delivered" && (
          <p className="text-sm font-semibold text-emerald-700">
            Delivered — central inventory has been updated for these lines.
          </p>
        )}
      </div>

      <TableShell>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-start">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Variant</th>
                <th className="px-4 py-3 text-end">Qty</th>
                <th className="px-4 py-3 text-end">{currencyLabel("Unit price")}</th>
                <th className="px-4 py-3 text-end">{currencyLabel("Line total")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((line) => {
                const productName = line.product_variants?.products?.name ?? "—";
                const variantName = line.product_variants?.name ?? "—";
                const lt = lineTotal(line.quantity, line.price);
                return (
                  <tr key={line.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 text-[13px] font-semibold text-slate-900">
                      {productName}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-slate-600">
                      {variantName}
                    </td>
                    <td className="px-4 py-3 text-end text-[13px] font-semibold text-slate-800">
                      {line.quantity ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-end text-[13px] text-slate-600">
                      {formatMoney(line.price)}
                    </td>
                    <td className="px-4 py-3 text-end text-[13px] font-bold text-slate-900">
                      {lt != null ? formatMoney(lt) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </TableShell>
    </div>
  );
}
