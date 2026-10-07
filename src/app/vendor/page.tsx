"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package, ClipboardList } from "lucide-react";

import { PageHeader } from "@/modules/admin/components/page-header";
import { VendorStatsRow } from "@/modules/vendor/components/vendor-stats-row";
import { VendorPoActivityFeed } from "@/modules/vendor/components/vendor-po-activity-feed";

interface DashboardStats {
  pendingPo: number;
  acceptedPo: number;
  deliveredPo: number;
  supplySkus: number;
  lowStockSkus: number;
}

interface RecentPo {
  id: string;
  status: string;
  total_amount: number | null;
  created_at: string | null;
}

interface DashboardResponse {
  stats: DashboardStats;
  recent: RecentPo[];
}

export default function VendorHomePage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    fetch("/api/vendor/dashboard")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch dashboard");
        return res.json();
      })
      .then((result) => {
        setData(result);
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
      <div className="mx-auto w-full max-w-4xl px-5 py-6 sm:px-6">
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <Package className="mx-auto h-12 w-12 animate-spin text-slate-400" />
            <p className="mt-4 text-sm text-slate-500">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto w-full max-w-4xl px-5 py-6 sm:px-6">
        <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <div className="text-center">
            <Package className="mx-auto h-12 w-12 text-slate-400" />
            <p className="mt-4 text-sm text-slate-500">Failed to load dashboard</p>
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

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-6 sm:px-6">
      <PageHeader
        title="Vendor home"
        subtitle="Overview of purchase orders and your supply catalog."
      />

      <div className="mb-5">
        <VendorStatsRow stats={data.stats} />
      </div>

      <div className="mb-5">
        <VendorPoActivityFeed recent={data.recent} />
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-2">
        <Link
          href="/vendor/products"
          className="group flex flex-col rounded-[24px] border border-slate-100 bg-white p-4 shadow-[0_4px_16px_rgba(26,26,46,0.04)] transition hover:border-[#2563EB]/20"
        >
          <Package
            className="mb-3 text-slate-300 transition group-hover:text-[#2563EB]"
            size={28}
          />
          <h2 className="text-lg font-extrabold text-slate-900">Supply</h2>
          <p className="mt-1 text-sm text-slate-500">
            Update stock and base prices for your assigned variants.
          </p>
        </Link>

        <Link
          href="/vendor/purchase-orders"
          className="group flex flex-col rounded-[24px] border border-slate-100 bg-white p-4 shadow-[0_4px_16px_rgba(26,26,46,0.04)] transition hover:border-[#2563EB]/20"
        >
          <ClipboardList
            className="mb-3 text-slate-300 transition group-hover:text-[#2563EB]"
            size={28}
          />
          <h2 className="text-lg font-extrabold text-slate-900">
            Purchase orders
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Review POs, accept them, and mark delivery to update central stock.
          </p>
        </Link>
      </div>
    </div>
  );
}
