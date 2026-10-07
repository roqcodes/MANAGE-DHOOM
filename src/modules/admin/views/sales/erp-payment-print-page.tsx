"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { AdminPrintSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { InvoicePrintToolbar } from "@/modules/admin/components/invoice-print-toolbar";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { paymentModeLabel } from "@/common/erp/sales-types";

type PaymentPrintData = {
  payment_number: string;
  payment_date: string;
  payment_mode: string;
  total_amount: number;
  bank_charges: number;
  reference: string | null;
  notes: string | null;
  users: { name: string | null; email: string | null } | null;
  stores: { name: string } | null;
  accounts: { name: string } | null;
  erp_payment_allocations: Array<{
    amount: number;
    invoices: { invoice_number: string } | null;
  }>;
};

export function ErpPaymentPrintPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [detail, setDetail] = useState<PaymentPrintData | null>(null);

  useEffect(() => {
    if (!id) return;
    adminGet<PaymentPrintData>(`erp/payments/${id}`).then(setDetail);
  }, [id]);

  if (!detail) {
    return <AdminPrintSkeleton />;
  }

  return (
    <div className="min-h-0 flex-1 bg-slate-50 print:bg-white">
      <InvoicePrintToolbar
        backHref={`/admin/erp/payments/${id}`}
        title={`Payment receipt · ${detail.payment_number}`}
      />
      <article className="mx-auto max-w-2xl bg-white px-6 py-8 text-slate-900 print:px-4">
        <h1 className="text-2xl font-bold">Payment received</h1>
        <p className="mt-1 font-mono text-sm text-slate-600">{detail.payment_number}</p>
        <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-slate-500">Customer</p>
            <p className="font-semibold">{detail.users?.name ?? detail.users?.email ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Store</p>
            <p className="font-semibold">{detail.stores?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Date</p>
            <p className="font-semibold">{detail.payment_date}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Mode</p>
            <p className="font-semibold">{paymentModeLabel(detail.payment_mode)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Deposit to</p>
            <p className="font-semibold">{detail.accounts?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Amount</p>
            <p className="text-lg font-bold tabular-nums">
              {formatCurrencyAmount(detail.total_amount)}
            </p>
          </div>
        </div>
        {detail.bank_charges > 0 ? (
          <p className="mt-4 text-sm">
            Bank charges: {formatCurrencyAmount(detail.bank_charges)}
          </p>
        ) : null}
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-slate-500">
              <th className="py-2">Invoice</th>
              <th className="py-2 text-right">Allocated</th>
            </tr>
          </thead>
          <tbody>
            {detail.erp_payment_allocations.map((row, index) => (
              <tr key={index} className="border-b border-slate-100">
                <td className="py-2">{row.invoices?.invoice_number ?? "—"}</td>
                <td className="py-2 text-right tabular-nums">
                  {formatCurrencyAmount(row.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {detail.notes ? <p className="mt-4 text-sm text-slate-600">{detail.notes}</p> : null}
      </article>
    </div>
  );
}
