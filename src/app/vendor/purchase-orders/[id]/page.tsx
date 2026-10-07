"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Package } from "lucide-react";

import { VendorPurchaseOrderDetailView } from "@/modules/vendor/components/vendor-po-detail";

interface PurchaseOrderDetail {
  id: string;
  vendor_id: string | null;
  status: string | null;
  total_amount: number | null;
  created_at: string | null;
  purchase_order_items: {
    id: string;
    quantity: number | null;
    price: number | null;
    product_variants: {
      products: {
        id: string;
        name: string | null;
      } | null;
      name: string | null;
    } | null;
  }[];
}

interface PoResponse {
  po: PurchaseOrderDetail;
}

export default function VendorPurchaseOrderDetailPage() {
  const params = useParams();
  const [po, setPo] = useState<PurchaseOrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const id = params?.id as string;
    if (!id) return;

    fetch(`/api/vendor/po/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch PO");
        return res.json();
      })
      .then((result) => {
        setPo(result.po);
        setIsError(false);
      })
      .catch((err) => {
        console.error(err);
        setIsError(true);
      })
      .finally(() => setIsLoading(false));
  }, [params?.id]);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6">
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <Package className="mx-auto h-12 w-12 animate-spin text-slate-400" />
            <p className="mt-4 text-sm text-slate-500">Loading purchase order...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !po) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6">
        <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <div className="text-center">
            <Package className="mx-auto h-12 w-12 text-slate-400" />
            <p className="mt-4 text-sm text-slate-500">Failed to load purchase order</p>
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
    <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6">
      <VendorPurchaseOrderDetailView po={po as any} />
    </div>
  );
}
