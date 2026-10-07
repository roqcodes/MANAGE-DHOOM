"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { AlertTriangle, Package } from "lucide-react";

import type { FulfillmentQueueRow } from "@/common/admin/types";
import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { AdminBreadcrumb } from "@/modules/admin/components/admin-breadcrumb";
import { StatusBadge } from "@/modules/admin/components/status-badge";
import {
  InventoryFulfillmentStatusPill,
  formatInr,
  shortOrderRef,
} from "@/modules/orders/components/orders-ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type QueueFilter = "needs_assignment" | "ready_to_ship" | "all_open";

const FILTERS: { id: QueueFilter; label: string }[] = [
  { id: "needs_assignment", label: "Needs assignment" },
  { id: "ready_to_ship", label: "Ready to ship" },
  { id: "all_open", label: "All open" },
];

export function FulfillmentQueueView() {
  const searchParams = useSearchParams();
  const rawFilter = searchParams.get("filter") ?? "needs_assignment";
  const filter = FILTERS.some((f) => f.id === rawFilter)
    ? (rawFilter as QueueFilter)
    : "needs_assignment";
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

  const [rows, setRows] = useState<FulfillmentQueueRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams();
    q.set("filter", filter);
    q.set("page", String(page));
    adminGet<{
      data: FulfillmentQueueRow[];
      total: number;
    }>(`orders/fulfillment-queue?${q.toString()}`)
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load queue"),
      )
      .finally(() => setLoading(false));
  }, [filter, page]);

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <AdminBreadcrumb
        items={[
          { label: "Sales", href: "/admin/orders" },
          { label: "Fulfillment queue" },
        ]}
        backHref="/admin/orders"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Fulfillment queue</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Online orders needing store assignment or shipment.
          </p>
        </div>
        <Link href="/admin/erp/change-store" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Change active store
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={`/admin/erp/fulfillment-queue?filter=${f.id}`}
            className={cn(
              buttonVariants({
                variant: filter === f.id ? "default" : "outline",
                size: "sm",
              }),
            )}
          >
            {f.label}
          </Link>
        ))}
        <span className="self-center text-sm text-muted-foreground">{total} orders</span>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/50 p-4">
          <AlertTriangle className="size-5 shrink-0 text-rose-600" />
          <p className="text-sm text-rose-800">{error}</p>
        </div>
      ) : null}

      {loading ? (
        <AdminTableBodySkeleton rows={8} />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <Package className="size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No orders in this queue.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">Order</th>
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Order status</th>
                <th className="px-3 py-2.5">Inventory</th>
                <th className="px-3 py-2.5 text-right">Total</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border/60 hover:bg-muted/20">
                  <td className="px-3 py-2.5 font-mono font-medium">
                    #{shortOrderRef(row.id)}
                  </td>
                  <td className="px-3 py-2.5">{row.customer_name ?? "Guest"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {row.created_at
                      ? format(new Date(row.created_at), "MMM d, yyyy")
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <InventoryFulfillmentStatusPill status={row.fulfillment_status} />
                      {row.fulfillment_count > 1 ? (
                        <span className="text-[10px] text-muted-foreground">
                          {row.fulfillment_count} shipments
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatInr(Number(row.total_amount ?? 0))}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Link
                      href={`/admin/orders/${row.id}`}
                      className={buttonVariants({ size: "sm", variant: "outline" })}
                    >
                      {row.fulfillment_status === "pending_assignment"
                        ? "Assign store"
                        : "Fulfill"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
