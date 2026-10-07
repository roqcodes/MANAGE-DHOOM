"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { AdminPrintSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { InvoicePrintToolbar } from "@/modules/admin/components/invoice-print-toolbar";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";

type CreditNotePrintData = {
  credit_note_number: string;
  credit_note_date: string;
  total_amount: number;
  reference: string | null;
  notes: string | null;
  users: { name: string | null } | null;
  stores: { name: string } | null;
  source_invoice: { invoice_number: string } | null;
  erp_credit_note_lines: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    tax_rate_percent: number;
    line_total: number;
  }>;
};

export function ErpCreditNotePrintPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [detail, setDetail] = useState<CreditNotePrintData | null>(null);

  useEffect(() => {
    if (!id) return;
    adminGet<CreditNotePrintData>(`erp/credit-notes/${id}`).then(setDetail);
  }, [id]);

  if (!detail) {
    return <AdminPrintSkeleton />;
  }

  return (
    <div className="min-h-0 flex-1 bg-slate-50 print:bg-white">
      <InvoicePrintToolbar
        backHref={`/admin/erp/credit-notes/${id}`}
        title={`Credit note · ${detail.credit_note_number}`}
      />
      <article className="mx-auto max-w-3xl bg-white px-6 py-8 text-slate-900 print:px-4">
        <h1 className="text-2xl font-bold">Credit note</h1>
        <p className="mt-1 font-mono text-sm text-slate-600">{detail.credit_note_number}</p>
        <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-slate-500">Customer</p>
            <p className="font-semibold">{detail.users?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Store</p>
            <p className="font-semibold">{detail.stores?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Date</p>
            <p className="font-semibold">{detail.credit_note_date}</p>
          </div>
          {detail.source_invoice ? (
            <div>
              <p className="text-xs uppercase text-slate-500">Source invoice</p>
              <p className="font-semibold">{detail.source_invoice.invoice_number}</p>
            </div>
          ) : null}
        </div>
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-slate-500">
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Rate</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {detail.erp_credit_note_lines.map((line, index) => (
              <tr key={index} className="border-b border-slate-100">
                <td className="py-2">{line.product_name}</td>
                <td className="py-2 text-right tabular-nums">{line.quantity}</td>
                <td className="py-2 text-right tabular-nums">
                  {formatCurrencyAmount(line.unit_price)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatCurrencyAmount(line.line_total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-right text-lg font-bold tabular-nums">
          Total: {formatCurrencyAmount(detail.total_amount)}
        </p>
      </article>
    </div>
  );
}
