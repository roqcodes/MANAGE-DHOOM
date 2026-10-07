"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Package } from "lucide-react";

import { PageHeader } from "@/modules/admin/components/page-header";
import { VendorProductsPanel } from "@/modules/vendor/components/vendor-products-panel";
import { VendorAvailableVariantsPanel } from "@/modules/vendor/components/vendor-available-variants-panel";
import { VendorSupplyTabNav } from "@/modules/vendor/components/vendor-supply-tab-nav";

interface ProductRow {
  id: string;
  product_variants: {
    products: {
      id: string;
      name: string | null;
      categories: {
        id: string;
        name: string | null;
      } | null;
      image_url: string | null;
    } | null;
    name: string | null;
  } | null;
  base_price: number | null;
  stock: number | null;
}

interface AvailableVariantRow {
  id: string;
  name: string | null;
  products: {
    id: string;
    name: string | null;
    categories: {
      id: string;
      name: string | null;
    } | null;
    image_url: string | null;
  } | null;
}

interface ProductsResponse {
  data: ProductRow[] | AvailableVariantRow[];
  total: number;
  page: number;
  tab: "my" | "add";
}

export default function VendorProductsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<ProductsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const tab = (searchParams?.get("tab") === "add" ? "add" : "my") as "my" | "add";
  const page = parseInt(searchParams?.get("page") ?? "0", 10);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    params.set("tab", tab);
    params.set("page", String(page));

    fetch(`/api/vendor/products?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch products");
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
  }, [tab, page]);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6">
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <Package className="mx-auto h-12 w-12 animate-spin text-slate-400" />
            <p className="mt-4 text-sm text-slate-500">Loading products...</p>
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
            <p className="mt-4 text-sm text-slate-500">Failed to load products</p>
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

  const subtitle = `${data.total} catalog line${data.total !== 1 ? "s" : ""} ${data.tab === "my" ? "on your supply list" : "active variant" + (data.total !== 1 ? "s" : "")} you can add.`;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6">
      <PageHeader title="Supply" subtitle={subtitle} />
      <VendorSupplyTabNav active={data.tab} />
      {data.tab === "my" ? (
        <VendorProductsPanel
          rows={data.data as any}
          total={data.total}
          page={data.page}
        />
      ) : (
        <VendorAvailableVariantsPanel
          rows={data.data as any}
          total={data.total}
          page={data.page}
        />
      )}
    </div>
  );
}
