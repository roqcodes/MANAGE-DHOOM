"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

import type { OnlineStockTransferRow } from "@/modules/inventory/services/online-stock-transfers.service";
import type { OnlineToPhysicalTransferRow } from "@/modules/inventory/services/online-to-physical-transfers.service";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type UnifiedTransfer = {
  id: string;
  transferNumber: string;
  direction: "to_online" | "to_physical";
  summary: string;
  quantity: number;
  status: string;
  createdAt: string;
  details: string;
};

function statusBadge(direction: UnifiedTransfer["direction"], status: string) {
  if (direction === "to_physical") {
    return <Badge>Completed</Badge>;
  }
  if (status === "allocated") return <Badge>Allocated</Badge>;
  if (status === "cancelled") return <Badge variant="secondary">Cancelled</Badge>;
  return <Badge variant="outline">Pending allocation</Badge>;
}

function directionBadge(direction: UnifiedTransfer["direction"]) {
  if (direction === "to_physical") {
    return <Badge variant="outline">Online → Store</Badge>;
  }
  return <Badge variant="outline">Store → Online</Badge>;
}

export function InventoryRecentTransfersList({
  storeId,
}: {
  storeId: string | null;
}) {
  const { data: toOnline, isPending: loadingOnline } = useQuery({
    queryKey: adminQueryKeys.onlineStockTransfers(storeId, "recent"),
    queryFn: () =>
      adminGet<{ data: OnlineStockTransferRow[]; total: number }>(
        `inventory/online-transfers?storeId=${storeId ?? ""}&status=recent`,
      ),
    enabled: Boolean(storeId),
  });

  const { data: toPhysical, isPending: loadingPhysical } = useQuery({
    queryKey: adminQueryKeys.onlineToPhysicalTransfers(storeId),
    queryFn: () =>
      adminGet<{ data: OnlineToPhysicalTransferRow[]; total: number }>(
        `inventory/online-to-physical?storeId=${storeId ?? ""}`,
      ),
    enabled: Boolean(storeId),
  });

  const transfers = useMemo(() => {
    const rows: UnifiedTransfer[] = [];

    for (const t of toOnline?.data ?? []) {
      rows.push({
        id: t.id,
        transferNumber: t.transfer_number,
        direction: "to_online",
        summary: t.product_name,
        quantity: t.quantity,
        status: t.status,
        createdAt: t.created_at,
        details:
          t.status === "allocated" && t.allocations.length > 0
            ? t.allocations
                .map((a) => `${a.variant_name ?? "SKU"}: ${a.quantity}`)
                .join(", ")
            : "—",
      });
    }

    for (const t of toPhysical?.data ?? []) {
      const summary =
        t.lines.length === 1
          ? `${t.lines[0].variant_name ?? "Variant"} (${t.lines[0].product_name})`
          : `${t.lines.length} variants`;
      rows.push({
        id: t.id,
        transferNumber: t.transfer_number,
        direction: "to_physical",
        summary,
        quantity: t.total_quantity,
        status: "completed",
        createdAt: t.created_at,
        details:
          t.lines.length > 0
            ? t.lines
                .map((line) => `${line.variant_name ?? "SKU"}: ${line.quantity}`)
                .join(", ")
            : "—",
      });
    }

    return rows.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [toOnline?.data, toPhysical?.data]);

  if (!storeId) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        Select a store using the header switcher to view transfers.
      </p>
    );
  }

  if (loadingOnline || loadingPhysical) {
    return (
      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
        Loading transfers…
      </p>
    );
  }

  if (transfers.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        No transfers yet. Use Store → Online or Online → Store to move stock between
        pools.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Transfer #</TableHead>
            <TableHead>Direction</TableHead>
            <TableHead>Summary</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transfers.map((t) => (
            <TableRow key={`${t.direction}-${t.id}`}>
              <TableCell className="font-mono text-xs">{t.transferNumber}</TableCell>
              <TableCell>{directionBadge(t.direction)}</TableCell>
              <TableCell>{t.summary}</TableCell>
              <TableCell className="tabular-nums">{t.quantity}</TableCell>
              <TableCell>{statusBadge(t.direction, t.status)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {format(new Date(t.createdAt), "MMM d, yyyy HH:mm")}
              </TableCell>
              <TableCell className="max-w-[240px] text-xs text-muted-foreground">
                {t.details}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
