"use client";

import {
  creditKindLabel,
  formatCustomerCreditNoteRef,
} from "@/common/erp/commercial-discount";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatErpDocRef } from "@/lib/erp-document-ref";

export type ErpCreditNotePrintData = {
  id: string;
  credit_note_number: string;
  credit_kind?: string | null;
  credit_note_date: string;
  total_amount: number;
  reference: string | null;
  notes: string | null;
  users: { name: string | null } | null;
  stores: { name: string } | null;
  source_invoice: { id: string; invoice_number: string } | null;
  erp_credit_note_lines: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    tax_rate_percent: number;
    line_total: number;
  }>;
};

export function ErpCreditNotePrintDocument({ creditNote }: { creditNote: ErpCreditNotePrintData }) {
  const isDiscount = creditNote.credit_kind === "discount";
  const displayRef = formatCustomerCreditNoteRef({
    id: creditNote.id,
    credit_note_number: creditNote.credit_note_number,
    credit_kind: creditNote.credit_kind,
  });

  return (
    <article
      data-print-document
      className="mx-auto max-w-3xl bg-white px-6 py-8 text-slate-900 print:max-w-none print:px-4 print:py-6"
    >
      <h1 className="text-2xl font-bold tracking-tight print:text-xl">
        {isDiscount ? "Discount credit" : "Credit note"}
      </h1>
      <p className="mt-1 font-mono text-sm text-slate-600">{displayRef}</p>
      <p className="mt-1 text-xs text-slate-500">{creditKindLabel(creditNote.credit_kind)}</p>
      <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2 print:text-xs">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Customer</p>
          <p className="mt-0.5 font-semibold">{creditNote.users?.name ?? "—"}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Store</p>
          <p className="mt-0.5 font-semibold">{creditNote.stores?.name ?? "—"}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Date</p>
          <p className="mt-0.5 font-semibold">{creditNote.credit_note_date}</p>
        </div>
        {creditNote.source_invoice ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Source invoice
            </p>
            <p className="mt-0.5 font-semibold">
              {creditNote.source_invoice.invoice_number?.trim() ||
                formatErpDocRef("INV", creditNote.source_invoice.id)}
            </p>
          </div>
        ) : null}
      </div>
      <table className="mt-6 w-full border-collapse text-sm print:text-xs">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-slate-500">
            <th className="py-2">Item</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Rate</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {creditNote.erp_credit_note_lines.map((line, index) => (
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
        Total: {formatCurrencyAmount(creditNote.total_amount)}
      </p>
      {creditNote.reference ? (
        <p className="mt-4 text-sm text-slate-600 print:text-xs">Reference: {creditNote.reference}</p>
      ) : null}
      {creditNote.notes ? (
        <p className="mt-2 text-sm text-slate-600 print:text-xs whitespace-pre-wrap">{creditNote.notes}</p>
      ) : null}
    </article>
  );
}
