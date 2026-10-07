"use client";

import { useState } from "react";
import { Info } from "lucide-react";

import type { StoreProductPurchaseGlance } from "@/common/erp/store-inventory-types";
import { AdminPanelSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function StoreInventoryPurchaseGlancePopover({
  productId,
  storeId,
  displayPrice,
  className,
}: {
  productId: string;
  storeId: string | null;
  displayPrice: string;
  className?: string;
}) {
  const [data, setData] = useState<StoreProductPurchaseGlance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(open: boolean) {
    if (!open || data || !storeId) return;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ productId });
      q.set("storeId", storeId);
      const res = await adminGet<{ data: StoreProductPurchaseGlance }>(
        `erp/store-inventory/purchase-glance?${q.toString()}`,
      );
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
    <Popover onOpenChange={(open) => load(open)}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 rounded px-1 py-0.5 tabular-nums hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              className,
            )}
          />
        }
      >
        <span>{displayPrice}</span>
        <Info className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <p className="mb-2 text-xs font-semibold text-foreground">Purchase cost glance</p>
        {loading ? (
          <AdminPanelSkeleton rows={4} />
        ) : error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : data ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <StatPill
                label="Min"
                value={
                  data.minUnitCost != null
                    ? formatCurrencyAmount(data.minUnitCost)
                    : "—"
                }
              />
              <StatPill
                label="Max"
                value={
                  data.maxUnitCost != null
                    ? formatCurrencyAmount(data.maxUnitCost)
                    : "—"
                }
              />
              <StatPill
                label="Avg (weighted)"
                value={
                  data.avgUnitCost != null
                    ? formatCurrencyAmount(data.avgUnitCost)
                    : "—"
                }
              />
              <StatPill
                label="WAC at store"
                value={
                  data.wacAtStore != null
                    ? formatCurrencyAmount(data.wacAtStore)
                    : "—"
                }
              />
            </div>
            {data.recent.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[10px] font-medium uppercase text-muted-foreground">
                  Recent purchases
                </p>
                <ul className="max-h-40 space-y-1.5 overflow-y-auto text-xs">
                  {data.recent.map((row) => (
                    <li
                      key={`${row.billId}-${row.billDate}`}
                      className="flex flex-col gap-0.5 rounded border border-border/50 px-2 py-1"
                    >
                      <span className="font-medium">
                        {row.billNumber} · {row.billDate}
                      </span>
                      <span className="text-muted-foreground">
                        {row.vendorName ?? "Vendor"} · {row.quantity} @{" "}
                        {formatCurrencyAmount(
                          row.loadedUnitCost ?? row.unitPrice,
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No purchase bills yet.</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Open to load purchase history.</p>
        )}
      </PopoverContent>
    </Popover>
    </span>
  );
}
