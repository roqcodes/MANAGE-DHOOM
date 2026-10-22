"use client";

import { paymentModeLabel } from "@/common/erp/sales-types";
import { formatCurrencyAmount } from "@/lib/format-currency";

export type ErpPaymentPrintData = {
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

export function ErpPaymentPrintDocument({ payment }: { payment: ErpPaymentPrintData }) {
  return (
    <article
      data-print-document
      className="mx-auto max-w-2xl bg-white px-6 py-8 text-slate-900 print:max-w-none print:px-4 print:py-6"
    >
      <h1 className="text-2xl font-bold tracking-tight print:text-xl">Payment received</h1>
      <p className="mt-1 font-mono text-sm text-slate-600">{payment.payment_number}</p>
      <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2 print:text-xs">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Customer</p>
          <p className="mt-0.5 font-semibold">
            {payment.users?.name ?? payment.users?.email ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Store</p>
          <p className="mt-0.5 font-semibold">{payment.stores?.name ?? "—"}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Date</p>
          <p className="mt-0.5 font-semibold">{payment.payment_date}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Mode</p>
          <p className="mt-0.5 font-semibold">{paymentModeLabel(payment.payment_mode)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Deposit to
          </p>
          <p className="mt-0.5 font-semibold">{payment.accounts?.name ?? "—"}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Amount</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums">
            {formatCurrencyAmount(payment.total_amount)}
          </p>
        </div>
      </div>
      {payment.bank_charges > 0 ? (
        <p className="mt-4 text-sm print:text-xs">
          Bank charges: {formatCurrencyAmount(payment.bank_charges)}
        </p>
      ) : null}
      {payment.erp_payment_allocations.length > 0 ? (
        <table className="mt-6 w-full border-collapse text-sm print:text-xs">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-slate-500">
              <th className="py-2">Invoice</th>
              <th className="py-2 text-right">Allocated</th>
            </tr>
          </thead>
          <tbody>
            {payment.erp_payment_allocations.map((row, index) => (
              <tr key={index} className="border-b border-slate-100">
                <td className="py-2">{row.invoices?.invoice_number ?? "—"}</td>
                <td className="py-2 text-right tabular-nums">
                  {formatCurrencyAmount(row.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {payment.reference ? (
        <p className="mt-4 text-sm text-slate-600 print:text-xs">Reference: {payment.reference}</p>
      ) : null}
      {payment.notes ? (
        <p className="mt-4 text-sm text-slate-600 print:text-xs whitespace-pre-wrap">{payment.notes}</p>
      ) : null}
    </article>
  );
}
