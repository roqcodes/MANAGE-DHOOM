import { format } from "date-fns";

import type { OrderWithItems } from "@/common/admin/types";

import { BuyHubInvoiceLogo } from "@/modules/brand/components/buyhub-logo";
import { OrderLineItemsTableBody } from "@/modules/orders/components/order-line-items-list";

import { CurrencyAmount } from "@/components/currency-amount";

function shortOrderRef(id: string) {
  return id.split("-")[0]?.toUpperCase() ?? id.slice(0, 8);
}

export function OrderInvoiceDocument({ order }: { order: OrderWithItems }) {
  const placed = order.created_at
    ? format(new Date(order.created_at), "MMMM d, yyyy · h:mm a")
    : "—";
  const total = Number(order.total_amount ?? 0);

  return (
    <article
      data-invoice-document
      className="mx-auto max-w-3xl bg-white px-6 py-8 text-slate-900 print:max-w-none print:px-4 print:py-6 print:text-black"
    >
      <header className="border-b border-slate-200 pb-6 print:border-slate-300 print:pb-4">
        <BuyHubInvoiceLogo />
        <h1 className="mt-3 text-2xl font-bold tracking-tight print:text-xl">
          Order invoice
        </h1>
        <p className="mt-1 font-mono text-sm font-medium text-slate-600 print:text-xs">
          Reference #{shortOrderRef(order.id)}
        </p>
        <p className="mt-0.5 font-mono text-[11px] text-slate-500 print:text-[10px]">
          {order.id}
        </p>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 print:grid-cols-2 print:text-xs">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Date
            </p>
            <p className="mt-0.5 font-semibold">{placed}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Status / payment
            </p>
            <p className="mt-0.5 font-semibold capitalize">
              {order.status}
              <span className="text-slate-400"> · </span>
              {order.payment_status ?? "pending"}
            </p>
          </div>
        </div>
      </header>

      <section className="mt-6 print:mt-4">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 print:text-[9px]">
          Bill to
        </h2>
        <p className="mt-1 text-base font-semibold print:text-sm">
          {order.users?.name ?? "—"}
        </p>
        {order.users?.email ? (
          <p className="text-sm font-medium text-slate-600 print:text-xs">
            {order.users.email}
          </p>
        ) : null}
        {order.users?.phone ? (
          <p className="text-sm font-medium text-slate-600 print:text-xs">
            {order.users.phone}
          </p>
        ) : null}
      </section>

      {order.merchant_note?.trim() ? (
        <section className="mt-6 print:mt-4">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 print:text-[9px]">
            Note for merchant
          </h2>
          <p className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-slate-700 print:border-slate-300 print:bg-transparent print:text-xs">
            {order.merchant_note.trim()}
          </p>
        </section>
      ) : null}

      <section className="mt-8 print:mt-6">
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 print:text-[9px]">
          Line items
        </h2>
        <div className="overflow-hidden rounded-lg border border-slate-200 print:rounded-none print:border-slate-300">
          <table className="w-full border-collapse text-left text-sm print:text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 print:bg-transparent">
                <th className="px-3 py-2.5 font-semibold text-slate-600">Description</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Rate</th>
                <th className="px-3 py-2.5 text-center font-semibold text-slate-600">Qty</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Amount</th>
              </tr>
            </thead>
            <tbody>
              <OrderLineItemsTableBody order={order} />
            </tbody>
          </table>
        </div>
      </section>

      <footer className="mt-8 flex flex-col items-end border-t border-slate-200 pt-6 print:mt-6 print:pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Amount payable
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums print:text-xl">
          <CurrencyAmount amount={total} />
        </p>
        <p className="mt-6 max-w-md text-center text-[10px] font-medium leading-relaxed text-slate-400 print:text-[9px] sm:text-right">
          This document is generated from DHOOM Trading Manage for internal and
          customer reference. Tax lines may apply per your jurisdiction; adjust
          in your billing system as required.
        </p>
      </footer>
    </article>
  );
}
