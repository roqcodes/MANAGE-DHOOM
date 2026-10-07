"use client";

import { format } from "date-fns";

import { BuyHubInvoiceLogo } from "@/modules/brand/components/buyhub-logo";
import { formatCurrencyAmount } from "@/lib/format-currency";

export type ErpEstimatePrintData = {
  estimate_number: string;
  status: string;
  estimate_date: string;
  valid_until: string | null;
  subtotal: number;
  tax_amount: number;
  discount: number;
  total_amount: number;
  tax_inclusive: boolean;
  notes: string | null;
  reference: string | null;
  users: {
    name: string | null;
    email: string | null;
    phone: string | null;
    company_name: string | null;
    trn: string | null;
  } | null;
  stores: { name: string } | null;
  erp_estimate_lines: Array<{
    product_name: string;
    description: string | null;
    quantity: number;
    unit_price: number;
    tax_rate_percent: number;
    tax_amount: number;
    line_total: number;
  }>;
};

export function ErpEstimatePrintDocument({ estimate }: { estimate: ErpEstimatePrintData }) {
  const estimateDate = estimate.estimate_date
    ? format(new Date(estimate.estimate_date), "MMMM d, yyyy")
    : "—";

  return (
    <article
      data-estimate-document
      className="mx-auto max-w-3xl bg-white px-6 py-8 text-slate-900 print:max-w-none print:px-4 print:py-6 print:text-black"
    >
      <header className="border-b border-slate-200 pb-6 print:border-slate-300 print:pb-4">
        <BuyHubInvoiceLogo />
        <h1 className="mt-3 text-2xl font-bold tracking-tight print:text-xl">Estimate</h1>
        <p className="mt-1 font-mono text-sm font-medium text-slate-600 print:text-xs">
          {estimate.estimate_number}
        </p>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 print:grid-cols-2 print:text-xs">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Estimate date
            </p>
            <p className="mt-0.5 font-semibold">{estimateDate}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Valid until
            </p>
            <p className="mt-0.5 font-semibold">{estimate.valid_until ?? "—"}</p>
          </div>
        </div>
      </header>

      <section className="mt-6 grid gap-6 sm:grid-cols-2 print:mt-4 print:text-xs">
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Seller
          </h2>
          <p className="mt-1 text-base font-semibold print:text-sm">
            {estimate.stores?.name ?? "—"}
          </p>
        </div>
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Customer
          </h2>
          <p className="mt-1 text-base font-semibold print:text-sm">
            {estimate.users?.name ?? estimate.users?.company_name ?? "—"}
          </p>
          {estimate.users?.company_name ? (
            <p className="text-sm text-slate-600">{estimate.users.company_name}</p>
          ) : null}
          {estimate.users?.email ? (
            <p className="text-sm text-slate-600">{estimate.users.email}</p>
          ) : null}
          {estimate.users?.phone ? (
            <p className="text-sm text-slate-600">{estimate.users.phone}</p>
          ) : null}
          {estimate.users?.trn ? (
            <p className="text-sm text-slate-600">TRN: {estimate.users.trn}</p>
          ) : null}
        </div>
      </section>

      <table className="mt-8 w-full border-collapse text-sm print:mt-4 print:text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-2">Item & description</th>
            <th className="py-2 pr-2 text-right">Qty</th>
            <th className="py-2 pr-2 text-right">Rate</th>
            <th className="py-2 pr-2 text-right">Tax</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {estimate.erp_estimate_lines.map((item, index) => (
            <tr key={`${item.product_name}-${index}`} className="border-b border-slate-100">
              <td className="py-3 pr-2">
                <p className="font-medium">{item.product_name}</p>
                {item.description ? (
                  <p className="text-xs text-slate-500">{item.description}</p>
                ) : null}
              </td>
              <td className="py-3 pr-2 text-right tabular-nums">{item.quantity}</td>
              <td className="py-3 pr-2 text-right tabular-nums">
                {formatCurrencyAmount(item.unit_price)}
              </td>
              <td className="py-3 pr-2 text-right tabular-nums">
                {formatCurrencyAmount(item.tax_amount)}
              </td>
              <td className="py-3 text-right font-medium tabular-nums">
                {formatCurrencyAmount(item.line_total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 flex justify-end print:mt-4">
        <div className="w-full max-w-xs space-y-2 text-sm print:text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Sub total</span>
            <span className="tabular-nums">{formatCurrencyAmount(estimate.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Tax</span>
            <span className="tabular-nums">{formatCurrencyAmount(estimate.tax_amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Discount</span>
            <span className="tabular-nums">{formatCurrencyAmount(estimate.discount)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold print:text-sm">
            <span>Net amount</span>
            <span className="tabular-nums">{formatCurrencyAmount(estimate.total_amount)}</span>
          </div>
        </div>
      </div>

      {estimate.notes ? (
        <p className="mt-6 text-sm text-slate-600 print:mt-4 print:text-xs">
          <span className="font-semibold text-slate-800">Notes: </span>
          {estimate.notes}
        </p>
      ) : null}
    </article>
  );
}
