"use client";

import { useEffect, useState } from "react";

import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
import type {
  ErpStockAdjustmentListRow,
  ErpTransferRequestListRow,
  ErpStoreTransferListRow,
  ErpStoreListRow,
  StockDetailRow,
} from "@/common/erp/inventory-types";

function SimpleTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-100">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminErpStoresView() {
  const [rows, setRows] = useState<ErpStoreListRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    adminGet<{ data: ErpStoreListRow[] }>("erp/stores")
      .then((res) => setRows(res.data ?? []))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <p className="p-4 text-sm">Loading…</p>;
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Stores</h1>
      <SimpleTable
        headers={["Name", "Type", "Country", "Currency", "Markup %", "Active"]}
        rows={rows.map((r) => [
          r.name,
          r.store_type ?? "—",
          r.country ?? "—",
          r.currency ?? "—",
          r.markup_percent,
          r.is_active ? "Yes" : "No",
        ])}
      />
    </div>
  );
}

export function AdminStockAdjustmentsView() {
  const [rows, setRows] = useState<ErpStockAdjustmentListRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    adminGet<{ data: ErpStockAdjustmentListRow[] }>("erp/stock-adjustments?page=0")
      .then((res) => setRows(res.data))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <p className="p-4 text-sm">Loading…</p>;
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Stock Adjustments</h1>
      <SimpleTable
        headers={["Number", "Store", "Date", "Status", "Add Cost", "Remove Cost"]}
        rows={rows.map((r) => [
          r.adjustment_number,
          r.store_name ?? "—",
          r.adjustment_date,
          r.status,
          formatCurrencyAmount(r.total_add_cost),
          formatCurrencyAmount(r.total_remove_cost),
        ])}
      />
    </div>
  );
}

export function AdminTransferRequestsView() {
  const [rows, setRows] = useState<ErpTransferRequestListRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    adminGet<{ data: ErpTransferRequestListRow[] }>("erp/transfer-requests?page=0")
      .then((res) => setRows(res.data))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <p className="p-4 text-sm">Loading…</p>;
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Stock Transfer Requests</h1>
      <SimpleTable
        headers={["Number", "From", "To", "Date", "Status"]}
        rows={rows.map((r) => [
          r.request_number,
          r.from_store_name ?? "—",
          r.to_store_name ?? "—",
          r.request_date,
          r.status,
        ])}
      />
    </div>
  );
}

export function AdminStoreTransfersView() {
  const [rows, setRows] = useState<ErpStoreTransferListRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    adminGet<{ data: ErpStoreTransferListRow[] }>("erp/store-transfers?page=0")
      .then((res) => setRows(res.data))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <p className="p-4 text-sm">Loading…</p>;
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Store Transfers</h1>
      <SimpleTable
        headers={["Number", "From", "To", "Date", "Status"]}
        rows={rows.map((r) => [
          r.transfer_number,
          r.from_store_name ?? "—",
          r.to_store_name ?? "—",
          r.transfer_date,
          r.status,
        ])}
      />
    </div>
  );
}

export function AdminStockDetailsView() {
  const [rows, setRows] = useState<StockDetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    adminGet<{ data: StockDetailRow[] }>("erp/stock-details?page=0")
      .then((res) => setRows(res.data))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <p className="p-4 text-sm">Loading…</p>;
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Store inventory</h1>
      <SimpleTable
        headers={["Product", "Variant", "Central", "Store", "Purchase", "Sales"]}
        rows={rows.map((r) => [
          r.product_name,
          r.variant_name ?? "—",
          r.central_stock,
          r.store_stock ?? "—",
          r.purchase_price != null ? formatCurrencyAmount(r.purchase_price) : "—",
          r.sales_price != null ? formatCurrencyAmount(r.sales_price) : "—",
        ])}
      />
    </div>
  );
}
