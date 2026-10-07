"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

import { AdminPrintSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { InvoicePrintToolbar } from "@/modules/admin/components/invoice-print-toolbar";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { downloadElementAsPdf } from "@/lib/html2pdf-download";

type PurchaseBillPrintData = {
  id: string;
  purchase_bill_number: string;
  vendor_bill_number: string | null;
  purchase_date: string;
  due_date: string | null;
  subtotal: number;
  tax_amount: number;
  discount: number;
  landed_cost_total: number;
  total_amount: number;
  balance_due: number;
  vendors: { name: string | null; address: string | null; trn: string | null } | null;
  stores: { name: string | null } | null;
  erp_purchase_bill_lines: Array<{
    product_name: string;
    quantity: number;
    purchase_price: number;
    tax_rate_percent: number;
    line_total: number;
  }>;
};

export function ErpPurchaseBillPrintPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [bill, setBill] = useState<PurchaseBillPrintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const autoDownloadedRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    adminGet<{ bill: PurchaseBillPrintData }>(`erp/purchase-bills/${id}`)
      .then((res) => setBill(res.bill))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load bill"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDownloadPdf = useCallback(async () => {
    const element = document.querySelector("[data-purchase-bill-document]");
    if (!(element instanceof HTMLElement) || !bill) return;

    setDownloading(true);
    try {
      await downloadElementAsPdf(element, `${bill.purchase_bill_number}.pdf`);
    } finally {
      setDownloading(false);
    }
  }, [bill]);

  if (loading) {
    return <AdminPrintSkeleton />;
  }

  if (error || !bill) {
    return <p className="p-6 text-sm text-destructive">{error ?? "Purchase bill not found."}</p>;
  }

  return (
    <div className="min-h-0 flex-1 bg-slate-50 print:bg-white">
      <InvoicePrintToolbar
        backHref={`/admin/erp/purchase-bills/${id}`}
        title={`Purchase bill · ${bill.purchase_bill_number}`}
        onDownloadPdf={handleDownloadPdf}
        downloading={downloading}
      />
      <div className="mx-auto max-w-3xl p-8 print:p-0" data-purchase-bill-document>
        <header className="mb-6 border-b pb-4">
          <h1 className="text-xl font-semibold">Purchase Bill</h1>
          <p className="text-sm text-slate-600">{bill.purchase_bill_number}</p>
        </header>
        <div className="mb-6 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="font-medium">Vendor</p>
            <p>{bill.vendors?.name ?? "—"}</p>
            <p className="text-slate-600">{bill.vendors?.address ?? ""}</p>
            {bill.vendors?.trn ? <p>TRN: {bill.vendors.trn}</p> : null}
          </div>
          <div className="text-right">
            <p>Store: {bill.stores?.name ?? "—"}</p>
            <p>Date: {bill.purchase_date}</p>
            <p>Due: {bill.due_date ?? "—"}</p>
            {bill.vendor_bill_number ? <p>Vendor bill #: {bill.vendor_bill_number}</p> : null}
          </div>
        </div>
        <table className="mb-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-slate-500">
              <th className="py-2">Item</th>
              <th className="py-2">Qty</th>
              <th className="py-2">Rate</th>
              <th className="py-2">Tax</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {bill.erp_purchase_bill_lines.map((line, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-2">{line.product_name}</td>
                <td className="py-2">{line.quantity}</td>
                <td className="py-2">{formatCurrencyAmount(line.purchase_price)}</td>
                <td className="py-2">{line.tax_rate_percent}%</td>
                <td className="py-2 text-right">{formatCurrencyAmount(line.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto max-w-xs space-y-1 text-sm">
          <p className="flex justify-between"><span>Subtotal</span><span>{formatCurrencyAmount(bill.subtotal)}</span></p>
          <p className="flex justify-between"><span>Tax</span><span>{formatCurrencyAmount(bill.tax_amount)}</span></p>
          <p className="flex justify-between"><span>Discount</span><span>{formatCurrencyAmount(bill.discount)}</span></p>
          <p className="flex justify-between"><span>Landed costs</span><span>{formatCurrencyAmount(bill.landed_cost_total)}</span></p>
          <p className="flex justify-between font-semibold"><span>Total</span><span>{formatCurrencyAmount(bill.total_amount)}</span></p>
          <p className="flex justify-between"><span>Balance due</span><span>{formatCurrencyAmount(bill.balance_due)}</span></p>
        </div>
      </div>
    </div>
  );
}
