"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LayoutGrid } from "lucide-react";

import type { AvailableCatalogVariantRow } from "@/modules/vendor/types";
import { addVariantToSupplyAction } from "@/modules/vendor/actions/vendor-products.actions";
import { EmptyState, TableShell } from "@/modules/admin/components/empty-state";
import { Pagination } from "@/modules/admin/components/pagination";

function VariantRow({ row }: { row: AvailableCatalogVariantRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [basePrice, setBasePrice] = useState("");
  const [stock, setStock] = useState("0");
  const [message, setMessage] = useState<string | null>(null);

  const productName = row.products?.name ?? "—";
  const variantName = row.name ?? "—";
  const categoryName = row.products?.categories?.name ?? "—";
  const imageUrl = row.products?.image_url?.trim() || null;

  function submit() {
    setMessage(null);
    const bp = parseFloat(basePrice);
    const st = parseInt(stock, 10);
    if (Number.isNaN(bp) || bp <= 0) {
      setMessage("Enter a price greater than 0.");
      return;
    }
    if (Number.isNaN(st) || st < 0) {
      setMessage("Stock must be ≥ 0.");
      return;
    }

    startTransition(async () => {
      const res = await addVariantToSupplyAction({
        variantId: row.id,
        basePrice: bp,
        stock: st,
      });
      if (!res.ok) {
        setMessage(res.message);
        return;
      }
      setOpen(false);
      setBasePrice("");
      setStock("0");
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-slate-50 last:border-0">
      <td className="px-4 py-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <LayoutGrid className="text-slate-300" size={22} />
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-[13px] font-semibold text-slate-900">
        {productName}
      </td>
      <td className="px-4 py-3 text-[13px] text-slate-600">{variantName}</td>
      <td className="px-4 py-3 text-[13px] text-slate-600">{categoryName}</td>
      <td className="px-4 py-3 text-end">
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-extrabold text-white transition hover:bg-slate-800"
          >
            Add to Supply
          </button>
        ) : (
          <div className="ms-auto flex max-w-[320px] flex-col items-end gap-2 sm:flex-row sm:items-center">
            <input
              type="number"
              min={0.01}
              step="0.01"
              placeholder="Base price"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 px-2 text-[13px] font-semibold text-black outline-none focus:border-[#2563EB] sm:w-24"
            />
            <input
              type="number"
              min={0}
              step={1}
              placeholder="Stock"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 px-2 text-[13px] font-semibold text-black outline-none focus:border-[#2563EB] sm:w-20"
            />
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setOpen(false);
                  setMessage(null);
                }}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={submit}
                className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-[12px] font-extrabold text-white disabled:opacity-50"
              >
                {isPending ? "…" : "Confirm"}
              </button>
            </div>
          </div>
        )}
        {message && (
          <p className="mt-1 text-[11px] font-semibold text-red-600">{message}</p>
        )}
      </td>
    </tr>
  );
}

export function VendorAvailableVariantsPanel({
  rows,
  total,
  page,
}: {
  rows: AvailableCatalogVariantRow[];
  total: number;
  page: number;
}) {
  return (
    <div className="space-y-4">
      <TableShell>
        {rows.length === 0 ? (
          <EmptyState
            icon={<LayoutGrid size={48} strokeWidth={1.25} />}
            message="No more active catalog variants to add, or everything is already on your supply list."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-start">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                  <th className="w-16 px-4 py-3">Image</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Variant</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-end">Add</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <VariantRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          total={total}
          page={page}
          basePath="/vendor/products"
          extraParams={{ tab: "add" }}
        />
      </TableShell>
      <p className="text-[12px] text-slate-400">
        Catalog is managed by DHOOM TRADING. You only set your base price and stock
        for variants you opt in to supply.
      </p>
    </div>
  );
}
