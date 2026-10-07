"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { OnlineStockTransferRow } from "@/modules/inventory/services/online-stock-transfers.service";
import { isDefaultSkuName } from "@/modules/products/lib/product-sku-catalog";
import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet, adminPatch } from "@/modules/admin/lib/admin-api-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AllocationRow = {
  variantId: string;
  variantName: string;
  quantity: number;
  isDefaultSku?: boolean;
};

export function AllocateOnlineTransferDialog({
  transfer,
  open,
  onOpenChange,
  onSuccess,
}: {
  transfer: OnlineStockTransferRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);

  const allocationTotal = useMemo(
    () =>
      allocations.reduce((sum, row) => sum + Math.floor(row.quantity), 0),
    [allocations],
  );

  useEffect(() => {
    if (!open || !transfer) {
      if (!open) {
        setAllocations([]);
        setError(null);
      }
      return;
    }

    let cancelled = false;
    setLoadingVariants(true);
    setError(null);
    setAllocations([]);

    adminGet<{ data: { id: string; name: string | null }[] }>(
      `products/${transfer.product_id}/variants?ensureDefault=true`,
    )
      .then((res) => {
        if (cancelled) return;
        const rows = (res.data ?? []).map((v) => ({
          variantId: v.id,
          variantName: v.name ?? "Default",
          quantity: 0,
          isDefaultSku:
            (res.data ?? []).length === 1 &&
            isDefaultSkuName(v.name, transfer.product_name),
        }));
        if (rows.length === 1) {
          rows[0] = {
            ...rows[0],
            quantity: transfer.quantity,
          };
        }
        setAllocations(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        setAllocations([]);
        setError(e instanceof Error ? e.message : "Failed to load online SKU");
      })
      .finally(() => {
        if (!cancelled) setLoadingVariants(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, transfer?.id, transfer?.product_id, transfer?.quantity]);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
  }

  function refresh() {
    queryClient.invalidateQueries({
      queryKey: ["admin", "online-stock-transfers"],
    });
    queryClient.invalidateQueries({ queryKey: ["admin", "inventory"] });
  }

  function submit() {
    if (!transfer) return;
    setError(null);
    startTransition(async () => {
      try {
        await adminPatch("inventory/online-transfers", {
          action: "allocate",
          transferId: transfer.id,
          allocations: allocations
            .filter((a) => a.quantity > 0)
            .map((a) => ({
              variantId: a.variantId,
              quantity: Math.floor(a.quantity),
            })),
        });
        refresh();
        onSuccess?.();
        onOpenChange(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Allocation failed");
      }
    });
  }

  if (!transfer) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {allocations.length <= 1 ? "Allocate stock" : "Allocate variants"}
          </DialogTitle>
          <DialogDescription>
            {allocations.length <= 1
              ? `Assign ${transfer.quantity} units of ${transfer.product_name} to its online SKU. Simple products use one default SKU (same as Shopify/WooCommerce simple products).`
              : `Distribute ${transfer.quantity} units of ${transfer.product_name} across variants. Total must equal ${transfer.quantity}.`}
          </DialogDescription>
        </DialogHeader>

        {loadingVariants ? (
          <div className="py-4">
            <AdminTableBodySkeleton rows={5} />
          </div>
        ) : allocations.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No online SKU available for this product.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{allocations.length === 1 ? "SKU" : "Variant"}</TableHead>
                <TableHead className="w-28">Quantity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.map((row, idx) => (
                <TableRow key={row.variantId}>
                  <TableCell>
                    {row.isDefaultSku ? (
                      <span>
                        {transfer.product_name}
                        <span className="ml-1 text-xs text-muted-foreground">
                          (default SKU)
                        </span>
                      </span>
                    ) : (
                      row.variantName
                    )}
                  </TableCell>
                  <TableCell>
                    <NumericInput
                      min={0}
                      value={row.quantity}
                      onValueChange={(quantity) => {
                        const next = [...allocations];
                        next[idx] = {
                          ...row,
                          quantity: Number.isNaN(quantity)
                            ? quantity
                            : Math.max(0, Math.floor(quantity)),
                        };
                        setAllocations(next);
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Allocated: {allocationTotal} / {transfer.quantity}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={
                pending ||
                loadingVariants ||
                allocations.length === 0 ||
                allocationTotal !== transfer.quantity
              }
            >
              {pending ? "Saving…" : "Confirm allocation"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
