"use client";

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

import type { OnlineStockTransferRow } from "@/modules/inventory/services/online-stock-transfers.service";
import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet, adminPatch } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { AllocateOnlineTransferDialog } from "@/modules/inventory/components/allocate-online-transfer-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function statusBadge(status: OnlineStockTransferRow["status"]) {
  if (status === "allocated") return <Badge>Allocated</Badge>;
  if (status === "cancelled") return <Badge variant="secondary">Cancelled</Badge>;
  return <Badge variant="outline">Pending allocation</Badge>;
}

export function OnlineTransfersList({
  storeId,
  mode,
}: {
  storeId: string | null;
  mode: "pending" | "recent";
}) {
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [allocateTransfer, setAllocateTransfer] =
    useState<OnlineStockTransferRow | null>(null);

  const statusParam = mode === "pending" ? "pending_allocation" : "recent";

  const { data, isPending } = useQuery({
    queryKey: adminQueryKeys.onlineStockTransfers(storeId, statusParam),
    queryFn: () =>
      adminGet<{ data: OnlineStockTransferRow[]; total: number }>(
        `inventory/online-transfers?storeId=${storeId ?? ""}&status=${statusParam}`,
      ),
    enabled: Boolean(storeId),
  });

  const transfers = data?.data ?? [];

  function refresh() {
    queryClient.invalidateQueries({
      queryKey: ["admin", "online-stock-transfers"],
    });
    queryClient.invalidateQueries({ queryKey: ["admin", "online-to-physical"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "inventory"] });
  }

  function cancelTransfer(transferId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await adminPatch("inventory/online-transfers", {
          action: "cancel",
          transferId,
        });
        refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Cancel failed");
      }
    });
  }

  if (!storeId) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        Select a store using the header switcher to view transfers.
      </p>
    );
  }

  if (isPending) {
    return (
      <div className="px-4 py-6">
        <AdminTableBodySkeleton rows={8} />
      </div>
    );
  }

  if (transfers.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        {mode === "pending"
          ? "No pending transfers. Use Store → Online transfer to move physical stock."
          : "No completed transfers yet."}
      </p>
    );
  }

  return (
    <>
      {error ? (
        <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transfer #</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              {mode === "recent" ? <TableHead>Allocations</TableHead> : null}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transfers.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">{t.transfer_number}</TableCell>
                <TableCell>{t.product_name}</TableCell>
                <TableCell className="tabular-nums">{t.quantity}</TableCell>
                <TableCell>{statusBadge(t.status)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(t.created_at), "MMM d, yyyy HH:mm")}
                </TableCell>
                {mode === "recent" ? (
                  <TableCell className="max-w-[200px] text-xs text-muted-foreground">
                    {t.status === "allocated" && t.allocations.length > 0
                      ? t.allocations
                          .map((a) => `${a.variant_name ?? "SKU"}: ${a.quantity}`)
                          .join(", ")
                      : "—"}
                  </TableCell>
                ) : null}
                <TableCell className="text-right">
                  {mode === "pending" ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAllocateTransfer(t)}
                      >
                        Allocate
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => cancelTransfer(t.id)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AllocateOnlineTransferDialog
        transfer={allocateTransfer}
        open={Boolean(allocateTransfer)}
        onOpenChange={(open) => {
          if (!open) setAllocateTransfer(null);
        }}
        onSuccess={refresh}
      />
    </>
  );
}
