"use client";

import { format } from "date-fns";

import { BuyHubInvoiceLogo } from "@/modules/brand/components/buyhub-logo";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatDateOnly } from "@/lib/format-date";

export type ErpInvoicePrintData = {
  invoice_number: string;
  status: string;
  created_at: string;
  due_date: string | null;
  subtotal: number;
  gst_amount: number;
  discount: number;
  total_amount: number;
  amount_paid: number;
  credits_applied: number;
  balance_due: number;
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
  stores: {
    name: string;
    logo_url?: string | null;
    address_line1?: string | null;
    city?: string | null;
    country?: string | null;
    phone?: string | null;
    trn?: string | null;
  } | null;
  invoice_items: Array<{
    product_name: string;
    description: string | null;
    quantity: number;
    unit_price: number;
    gst_rate: number;
    gst_amount: number;
    total_amount: number;
  }>;
};

export function ErpInvoicePrintDocument({ invoice }: { invoice: ErpInvoicePrintData }) {
  const invoiceDate = invoice.created_at
    ? format(new Date(invoice.created_at), "MMMM d, yyyy")
    : "—";
  const dueDate = invoice.due_date
    ? format(new Date(formatDateOnly(invoice.due_date) + "T12:00:00"), "MMMM d, yyyy")
    : "—";

  return (
    <article
      data-invoice-document
      className="bh-a4-page text-slate-900 print:text-black"
    >
      <header className="border-b border-slate-200 pb-6 print:border-slate-300 print:pb-4">
        {invoice.stores?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={invoice.stores.logo_url}
            alt={invoice.stores.name ?? "Store logo"}
            className="h-12 w-auto object-contain"
          />
        ) : (
          <BuyHubInvoiceLogo />
        )}
        <h1 className="mt-3 text-2xl font-bold tracking-tight print:text-xl">Tax invoice</h1>
        <p className="mt-1 font-mono text-sm font-medium text-slate-600 print:text-xs">
          {invoice.invoice_number}
        </p>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 print:grid-cols-2 print:text-xs">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Invoice date
            </p>
            <p className="mt-0.5 font-semibold">{invoiceDate}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Due date
            </p>
            <p className="mt-0.5 font-semibold">{dueDate}</p>
          </div>
        </div>
      </header>

      <section className="mt-6 grid gap-6 sm:grid-cols-2 print:mt-4 print:text-xs">
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Seller
          </h2>
          <p className="mt-1 text-base font-semibold print:text-sm">
            {invoice.stores?.name ?? "—"}
          </p>
          {invoice.stores?.address_line1 ? (
            <p className="text-sm text-slate-600">{invoice.stores.address_line1}</p>
          ) : null}
          {invoice.stores?.city || invoice.stores?.country ? (
            <p className="text-sm text-slate-600">
              {[invoice.stores?.city, invoice.stores?.country].filter(Boolean).join(", ")}
            </p>
          ) : null}
          {invoice.stores?.phone ? (
            <p className="text-sm text-slate-600">{invoice.stores.phone}</p>
          ) : null}
          {invoice.stores?.trn ? (
            <p className="text-sm text-slate-600">TRN: {invoice.stores.trn}</p>
          ) : null}
        </div>
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Bill to
          </h2>
          <p className="mt-1 text-base font-semibold print:text-sm">
            {invoice.users?.name ?? invoice.users?.company_name ?? "—"}
          </p>
          {invoice.users?.company_name ? (
            <p className="text-sm text-slate-600">{invoice.users.company_name}</p>
          ) : null}
          {invoice.users?.email ? (
            <p className="text-sm text-slate-600">{invoice.users.email}</p>
          ) : null}
          {invoice.users?.phone ? (
            <p className="text-sm text-slate-600">{invoice.users.phone}</p>
          ) : null}
          {invoice.users?.trn ? (
            <p className="text-sm text-slate-600">TRN: {invoice.users.trn}</p>
          ) : null}
        </div>
      </section>

      <section className="mt-6 overflow-x-auto print:mt-4">
        <table className="w-full min-w-full table-fixed border-collapse text-sm print:text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
              <th className="w-8 py-2 pr-2">#</th>
              <th className="py-2 pr-2">Item</th>
              <th className="w-16 py-2 pr-2 text-right">Rate</th>
              <th className="w-12 py-2 pr-2 text-right">Qty</th>
              <th className="w-14 py-2 pr-2 text-right">Tax %</th>
              <th className="w-16 py-2 pr-2 text-right">Tax</th>
              <th className="w-20 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.invoice_items.map((item, index) => (
              <tr key={`${item.product_name}-${index}`} className="border-b border-slate-100">
                <td className="py-2 pr-2 text-slate-500">{index + 1}</td>
                <td className="py-2 pr-2">
                  <p className="font-medium break-words">{item.product_name}</p>
                  {item.description ? (
                    <p className="text-xs text-slate-500">{item.description}</p>
                  ) : null}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {formatCurrencyAmount(item.unit_price)}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{item.quantity}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{item.gst_rate}%</td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {formatCurrencyAmount(item.gst_amount)}
                </td>
                <td className="py-2 text-right font-medium tabular-nums">
                  {formatCurrencyAmount(item.total_amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6 flex justify-end print:mt-4">
        <div className="min-w-[240px] space-y-1 text-sm print:text-xs">
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Subtotal</span>
            <span className="tabular-nums">{formatCurrencyAmount(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Tax</span>
            <span className="tabular-nums">{formatCurrencyAmount(invoice.gst_amount)}</span>
          </div>
          {invoice.discount > 0 ? (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Discount</span>
              <span className="tabular-nums">-{formatCurrencyAmount(invoice.discount)}</span>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-base font-bold print:text-sm">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrencyAmount(invoice.total_amount)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Paid</span>
            <span className="tabular-nums">{formatCurrencyAmount(invoice.amount_paid)}</span>
          </div>
          {invoice.credits_applied > 0 ? (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Credits</span>
              <span className="tabular-nums">{formatCurrencyAmount(invoice.credits_applied)}</span>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 font-semibold text-rose-700">
            <span>Balance due</span>
            <span className="tabular-nums">{formatCurrencyAmount(invoice.balance_due)}</span>
          </div>
        </div>
      </section>

      {invoice.notes ? (
        <section className="mt-6 print:mt-4">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Notes
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 print:text-xs">
            {invoice.notes}
          </p>
        </section>
      ) : null}
    </article>
  );
}
