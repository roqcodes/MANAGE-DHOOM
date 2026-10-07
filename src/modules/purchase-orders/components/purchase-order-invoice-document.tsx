import { format } from "date-fns";

import type { AdminPurchaseOrderDetail } from "@/common/admin/types";

import { BuyHubInvoiceLogo } from "@/modules/brand/components/buyhub-logo";

import { formatCurrency } from "@/lib/format-currency";

function formatMoney(n: number | null) {
  if (n == null) return "—";
  return formatCurrency(n, { minimumFractionDigits: 2 });
}

function shortPoRef(id: string) {
  return `${id.slice(0, 8)}…`;
}

function lineTotal(qty: number | null, price: number | null) {
  if (qty == null || price == null) return null;
  return qty * price;
}

export function PurchaseOrderInvoiceDocument({
  po,
}: {
  po: AdminPurchaseOrderDetail;
}) {
  const placed = po.created_at
    ? format(new Date(po.created_at), "MMMM d, yyyy · h:mm a")
    : "—";
  const vendor = po.vendors;
  const items = po.purchase_order_items ?? [];

  return (
    <article className="mx-auto max-w-3xl bg-white px-6 py-8 text-slate-900 print:max-w-none print:px-4 print:py-6 print:text-black">
      <header className="border-b border-slate-200 pb-6 print:border-slate-300 print:pb-4">
        <BuyHubInvoiceLogo />
        <h1 className="mt-3 text-2xl font-bold tracking-tight print:text-xl">
          Purchase order
        </h1>
        <p className="mt-1 font-mono text-sm font-medium text-slate-600 print:text-xs">
          PO {shortPoRef(po.id)}
        </p>
        <p className="mt-0.5 font-mono text-[11px] text-slate-500 print:text-[10px]">
          {po.id}
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
              Status
            </p>
            <p className="mt-0.5 font-semibold capitalize">{po.status ?? "—"}</p>
          </div>
        </div>
      </header>

      <section className="mt-6 print:mt-4">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 print:text-[9px]">
          Vendor
        </h2>
        <p className="mt-1 text-base font-semibold print:text-sm">
          {vendor?.name?.trim() ?? "—"}
        </p>
        {vendor?.contact ? (
          <p className="text-sm font-medium text-slate-600 print:text-xs">
            {vendor.contact}
          </p>
        ) : null}
        {vendor?.id ? (
          <p className="mt-1 font-mono text-[11px] font-medium text-slate-400 print:text-[10px]">
            {vendor.id}
          </p>
        ) : null}
      </section>

      <section className="mt-8 print:mt-6">
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 print:text-[9px]">
          Line items
        </h2>
        <div className="overflow-hidden rounded-lg border border-slate-200 print:rounded-none print:border-slate-300">
          <table className="w-full border-collapse text-left text-sm print:text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 print:bg-transparent">
                <th className="px-3 py-2.5 font-semibold text-slate-600">
                  Product · variant
                </th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Qty</th>
                <th className="hidden px-3 py-2.5 text-right font-semibold text-slate-600 sm:table-cell print:table-cell">
                  Unit
                </th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Line</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center font-medium text-slate-500"
                  >
                    No line items.
                  </td>
                </tr>
              ) : (
                items.map((line) => {
                  const pv = line.product_variants;
                  const productName = pv?.products?.name ?? "—";
                  const variantName = pv?.name ?? "—";
                  const lt = lineTotal(line.quantity, line.price);
                  return (
                    <tr key={line.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2.5 align-top">
                        <span className="font-semibold text-slate-900">{productName}</span>
                        <span className="mt-0.5 block text-slate-600">{variantName}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                        {line.quantity ?? "—"}
                      </td>
                      <td className="hidden px-3 py-2.5 text-right tabular-nums text-slate-600 sm:table-cell print:table-cell">
                        {formatMoney(line.price)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                        {lt != null ? formatMoney(lt) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="mt-8 flex flex-col items-end border-t border-slate-200 pt-6 print:mt-6 print:pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          PO total
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums print:text-xl">
          {formatMoney(po.total_amount)}
        </p>
        <p className="mt-6 max-w-md text-center text-[10px] font-medium leading-relaxed text-slate-400 print:text-[9px] sm:text-right">
          Internal purchase order from DHOOM Trading Manage. Use for vendor
          reconciliation and receiving; official tax invoices follow your
          statutory format where applicable.
        </p>
      </footer>
    </article>
  );
}
