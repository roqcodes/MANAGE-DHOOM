"use client";

import { useEffect, useState } from "react";

import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
import type { ErpInvoiceListRow } from "@/common/erp/sales-types";

export function AdminErpInvoicesView() {
  const [rows, setRows] = useState<ErpInvoiceListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminGet<{ data: ErpInvoiceListRow[]; total: number }>("erp/invoices?page=0")
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <AdminPageSkeleton />;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">ERP Invoices</h1>
        <span className="text-sm text-slate-500">{total} total</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Number</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Store</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Paid</th>
              <th className="px-3 py-2">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{row.invoice_number}</td>
                <td className="px-3 py-2">{row.customer_name ?? "—"}</td>
                <td className="px-3 py-2">{row.store_name ?? "—"}</td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2 tabular-nums">{formatCurrencyAmount(row.total_amount)}</td>
                <td className="px-3 py-2 tabular-nums">{formatCurrencyAmount(row.amount_paid)}</td>
                <td className="px-3 py-2 tabular-nums">{formatCurrencyAmount(row.balance_due)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
