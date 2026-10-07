"use client";

import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState, useTransition } from "react";
import { Package } from "lucide-react";

import type { VendorProductWithVariant } from "@/common/admin/types";
import { updateVendorCatalogItemAction } from "@/modules/vendor/actions/vendor-products.actions";
import { EmptyState, TableShell } from "@/modules/admin/components/empty-state";
import { Pagination } from "@/modules/admin/components/pagination";

function groupRowsByProduct(rows: VendorProductWithVariant[]) {
  const order: string[] = [];
  const groups = new Map<
    string,
    { name: string; items: VendorProductWithVariant[] }
  >();

  for (const row of rows) {
    const pid = row.product_variants?.products?.id ?? "__none";
    const pname = row.product_variants?.products?.name ?? "—";
    if (!groups.has(pid)) {
      groups.set(pid, { name: pname, items: [] });
      order.push(pid);
    }
    groups.get(pid)!.items.push(row);
  }

  return order.map((id) => ({
    productId: id,
    productName: groups.get(id)!.name,
    items: groups.get(id)!.items,
  }));
}

function VariantTableRow({ row }: { row: VendorProductWithVariant }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [basePrice, setBasePrice] = useState(String(row.base_price ?? ""));
  const [stock, setStock] = useState(String(row.stock ?? 0));
  const [message, setMessage] = useState<string | null>(null);

  const variantName = row.product_variants?.name ?? "—";

  function save() {
    setMessage(null);
    const bp = parseFloat(basePrice);
    const st = parseInt(stock, 10);
    if (Number.isNaN(bp) || bp <= 0) {
      setMessage("Enter a valid price greater than 0.");
      return;
    }
    if (Number.isNaN(st) || st < 0) {
      setMessage("Stock must be a whole number ≥ 0.");
      return;
    }

    startTransition(async () => {
      const res = await updateVendorCatalogItemAction({
        vendorProductId: row.id,
        basePrice: bp,
        stock: st,
      });
      if (!res.ok) {
        setMessage(res.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Fragment>
      <tr className="border-b border-slate-50 last:border-0">
        <td className="max-w-[200px] px-3 py-2 align-middle text-[13px] font-semibold text-slate-900 sm:px-4">
          {variantName}
        </td>
        <td className="w-[120px] px-3 py-2 align-middle sm:px-4">
          <input
            type="number"
            min={0.01}
            step="0.01"
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
            className="h-8 w-full min-w-[88px] rounded-md border border-slate-200 px-2 text-[13px] font-semibold text-black outline-none focus:border-[#2563EB]"
          />
        </td>
        <td className="w-[88px] px-3 py-2 align-middle sm:px-4">
          <input
            type="number"
            min={0}
            step={1}
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            className="h-8 w-full min-w-[72px] rounded-md border border-slate-200 px-2 text-[13px] font-semibold text-black outline-none focus:border-[#2563EB]"
          />
        </td>
        <td className="w-px whitespace-nowrap px-3 py-2 align-middle text-end sm:px-4">
          <button
            type="button"
            disabled={isPending}
            onClick={save}
            className="rounded-md bg-[#2563EB] px-3 py-1.5 text-[12px] font-extrabold text-white transition hover:bg-[#1D4ED8] disabled:opacity-50"
          >
            {isPending ? "…" : "Save"}
          </button>
        </td>
      </tr>
      {message ? (
        <tr className="border-b border-slate-50 last:border-0">
          <td
            colSpan={4}
            className="px-3 pb-2 pt-0 text-[11px] font-semibold text-red-600 sm:px-4"
          >
            {message}
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

export function VendorProductsPanel({
  rows,
  total,
  page,
}: {
  rows: VendorProductWithVariant[];
  total: number;
  page: number;
}) {
  const groups = useMemo(() => groupRowsByProduct(rows), [rows]);

  return (
    <div className="space-y-4">
      <TableShell>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Package size={48} strokeWidth={1.25} />}
            message='No lines on your supply list yet. Open "Add Products" to opt in from the catalog.'
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {groups.map((group) => (
              <section key={group.productId} className="text-start">
                <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-2.5">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    Product
                  </p>
                  <h3 className="text-[15px] font-extrabold leading-snug tracking-tight text-slate-900">
                    {group.productName}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] table-fixed border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-white text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                        <th className="w-[38%] px-3 py-2 text-start font-extrabold sm:px-4">
                          Variant
                        </th>
                        <th className="w-[22%] px-3 py-2 text-start font-extrabold sm:px-4">
                          Base price
                        </th>
                        <th className="w-[18%] px-3 py-2 text-start font-extrabold sm:px-4">
                          Stock
                        </th>
                        <th className="w-[22%] px-3 py-2 text-end font-extrabold sm:px-4">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((row) => (
                        <VariantTableRow key={row.id} row={row} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
        <Pagination total={total} page={page} basePath="/vendor/products" />
      </TableShell>
      <p className="text-[12px] text-slate-400">
        Prices in INR. Supply stock updates apply only to your vendor catalog, not
        central inventory.
      </p>
    </div>
  );
}
