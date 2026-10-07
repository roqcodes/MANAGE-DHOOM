"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Package } from "lucide-react";

import { PageHeader } from "@/modules/admin/components/page-header";
import { VendorPurchaseOrdersPanel } from "@/modules/vendor/components/vendor-purchase-orders-panel";
import type { VendorPoStatusFilter } from "@/modules/vendor/types";
import { VENDOR_PO_STATUS_FILTERS } from "@/modules/vendor/types";

interface PurchaseOrderRow {
  id: string;
  status: string;
  total_amount: number | null;
  created_at: string | null;
}

interface DashboardStats {
  pendingPo: number;
  acceptedPo: number;
  deliveredPo: number;
}

interface PoResponse {
  data: PurchaseOrderRow[];
  total: number;
  page: number;
  status: VendorPoStatusFilter;
  stats: DashboardStats;
}

function parseStatus(raw: string | undefined): VendorPoStatusFilter {
  if (raw && VENDOR_PO_STATUS_FILTERS.includes(raw as VendorPoStatusFilter)) {
    return raw as VendorPoStatusFilter;
  }
  return "pending";
}

export default function VendorPurchaseOrdersPage() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<PoResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const status = parseStatus(searchParams?.get("status") ?? undefined);
  const page = parseInt(searchParams?.get("page") ?? "0", 10);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    params.set("status", status);
    params.set("page", String(page));

    fetch(`/api/vendor/po?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch POs");
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
  }, [status, page]);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6">
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <Package className="mx-auto h-12 w-12 animate-spin text-slate-400" />
            <p className="mt-4 text-sm text-slate-500">Loading purchase orders...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6">
        <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <div className="text-center">
            <Package className="mx-auto h-12 w-12 text-slate-400" />
            <p className="mt-4 text-sm text-slate-500">Failed to load purchase orders</p>
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

  const subtitle = `${data.total} PO${data.total !== 1 ? "s" : ""} with status "${data.status}".`;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6">
      <PageHeader title="Purchase orders" subtitle={subtitle} />
      <VendorPurchaseOrdersPanel
        orders={data.data}
        total={data.total}
        page={data.page}
        statusFilter={data.status}
      />
    </div>
  );
}
