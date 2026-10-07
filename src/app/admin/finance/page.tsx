"use client";

import { useEffect, useState } from "react";
import { Package, DollarSign, TrendingUp, ClipboardList } from "lucide-react";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { currencyLabel, formatCurrencyAmount } from "@/lib/format-currency";

interface FinanceSummary {
  totalRevenue: number;
  totalOutstanding: number;
  walletLiability: number;
  pendingPayments: number;
}

interface TransactionSummary {
  totalIn: number;
  totalOut: number;
  net: number;
}

interface Receivable {
  invoice_id: string;
  invoice_number: string;
  customer_name: string | null;
  total_amount: number | null;
  outstanding_amount: number;
  due_date: string | null;
  status: string;
}

interface ProfitMarginReport {
  period_start: string | null;
  period_end: string | null;
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
  ordersCount: number;
}

interface FinanceResponse {
  summary: FinanceSummary;
  transactions: TransactionSummary;
  period: string;
}

interface ReceivablesResponse {
  receivables: Receivable[];
  totalOutstanding: number;
  count: number;
}

interface ProfitMarginResponse {
  reports: ProfitMarginReport[];
  totals: {
    totalRevenue: number;
    totalCost: number;
    totalMargin: number;
    ordersCount: number;
    avgMarginPercent: number;
  };
}

export default function AdminFinancePage() {
  const [financeData, setFinanceData] = useState<FinanceResponse | null>(null);
  const [receivablesData, setReceivablesData] = useState<ReceivablesResponse | null>(null);
  const [profitData, setProfitData] = useState<ProfitMarginResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "receivables" | "profit">("overview");

  useEffect(() => {
    Promise.all([
      fetch("/api/finance/summary?days=30").then((res) => res.json()),
      fetch("/api/finance/receivables").then((res) => res.json()),
      fetch("/api/finance/profit-margin").then((res) => res.json()),
    ])
      .then(([financeRes, receivablesRes, profitRes]) => {
        setFinanceData(financeRes);
        setReceivablesData(receivablesRes);
        setProfitData(profitRes);
        setIsError(false);
      })
      .catch((err) => {
        console.error(err);
        setIsError(true);
      })
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6">
        <AdminPageSkeleton />
      </div>
    );
  }

  if (isError || !financeData) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6">
        <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <div className="text-center">
            <Package className="mx-auto h-12 w-12 text-slate-400" />
            <p className="mt-4 text-sm text-slate-500">Failed to load finance data</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const formatMoney = (n: number) =>
    formatCurrencyAmount(n, { minimumFractionDigits: 2 });

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Online Store Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">
          DHOOM Trading online orders, wallet, and margin — separate from ERP store reports at{" "}
          <a href="/admin/erp/reports" className="text-primary hover:underline">
            Reports
          </a>
          .
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setActiveTab("overview")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            activeTab === "overview"
              ? "bg-slate-900 text-white"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab("receivables")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            activeTab === "receivables"
              ? "bg-slate-900 text-white"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Receivables
        </button>
        <button
          onClick={() => setActiveTab("profit")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            activeTab === "profit"
              ? "bg-slate-900 text-white"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Profit & Margin
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">{currencyLabel("Online revenue")}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {formatMoney(financeData.summary.totalRevenue)}
                  </p>
                </div>
                <div className="rounded-full bg-emerald-100 p-3">
                  <DollarSign className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">Outstanding invoices</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {formatMoney(financeData.summary.totalOutstanding)}
                  </p>
                </div>
                <div className="rounded-full bg-blue-100 p-3">
                  <ClipboardList className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">Wallet liability</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {formatMoney(financeData.summary.walletLiability)}
                  </p>
                </div>
                <div className="rounded-full bg-purple-100 p-3">
                  <TrendingUp className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">Pending payments</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {formatMoney(financeData.summary.pendingPayments)}
                  </p>
                </div>
                <div className="rounded-full bg-slate-100 p-3">
                  <Package className="h-6 w-6 text-slate-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Transaction Summary */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-bold text-slate-900">Wallet flow ({financeData.period})</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-emerald-50 p-4">
                <p className="text-xs text-emerald-700">{currencyLabel("Credits in")}</p>
                <p className="mt-1 text-xl font-bold text-emerald-900">
                  {formatMoney(financeData.transactions.totalIn)}
                </p>
              </div>
              <div className="rounded-lg bg-red-50 p-4">
                <p className="text-xs text-red-700">{currencyLabel("Debits out")}</p>
                <p className="mt-1 text-xl font-bold text-red-900">
                  {formatMoney(financeData.transactions.totalOut)}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs text-slate-700">{currencyLabel("Net flow")}</p>
                <p
                  className={`mt-1 text-xl font-bold ${
                    financeData.transactions.net >= 0
                      ? "text-emerald-900"
                      : "text-red-900"
                  }`}
                >
                  {formatMoney(financeData.transactions.net)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receivables Tab */}
      {activeTab === "receivables" && receivablesData && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Outstanding Receivables</h2>
              <p className="text-sm text-slate-500">
                {currencyLabel("Total")}:{" "}
                <span className="font-semibold text-slate-900">
                  {formatMoney(receivablesData.totalOutstanding)}
                </span>
              </p>
            </div>
            {receivablesData.receivables.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
                <ClipboardList className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-4 text-sm text-slate-600">No outstanding receivables</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Invoice</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Customer</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">{currencyLabel("Total")}</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">{currencyLabel("Outstanding")}</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Due Date</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {receivablesData.receivables.map((rec) => (
                      <tr key={rec.invoice_id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {rec.invoice_number}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {rec.customer_name || "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {formatMoney(rec.total_amount ?? 0)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-red-600">
                          {formatMoney(rec.outstanding_amount)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {rec.due_date
                            ? new Date(rec.due_date).toLocaleDateString("en-IN")
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              rec.status === "paid"
                                ? "bg-emerald-100 text-emerald-800"
                                : rec.status === "partial"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {rec.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Profit Tab */}
      {activeTab === "profit" && profitData && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <p className="text-xs text-slate-500">{currencyLabel("Total revenue")}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {formatMoney(profitData.totals.totalRevenue)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <p className="text-xs text-slate-500">{currencyLabel("Total cost")}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {formatMoney(profitData.totals.totalCost)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <p className="text-xs text-slate-500">{currencyLabel("Total margin")}</p>
              <p className="mt-1 text-2xl font-bold text-emerald-600">
                {formatMoney(profitData.totals.totalMargin)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <p className="text-xs text-slate-500">Avg Margin %</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {profitData.totals.avgMarginPercent.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Reports Table */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-bold text-slate-900">Profit by Period</h2>
            {profitData.reports.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
                <TrendingUp className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-4 text-sm text-slate-600">No profit data available</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Period</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">{currencyLabel("Revenue")}</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">{currencyLabel("Cost")}</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">{currencyLabel("Margin")}</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">Margin %</th>
                      <th className="px-4 py-3 text-center font-semibold text-slate-700">Orders</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {profitData.reports.map((report, idx) => {
                      const marginPercent =
                        report.totalRevenue > 0
                          ? ((report.totalMargin / report.totalRevenue) * 100).toFixed(1)
                          : "0";
                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-700">
                            {report.period_start && report.period_end
                              ? `${new Date(report.period_start).toLocaleDateString("en-IN")} - ${new Date(report.period_end).toLocaleDateString("en-IN")}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">
                            {formatMoney(report.totalRevenue)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-600">
                            {formatMoney(report.totalCost)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                            {formatMoney(report.totalMargin)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">
                            {marginPercent}%
                          </td>
                          <td className="px-4 py-3 text-center text-slate-700">
                            {report.ordersCount}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
