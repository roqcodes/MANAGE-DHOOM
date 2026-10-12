"use client";

import { useMemo } from "react";

import type { LandedCostFormRow, PurchaseLineFormRow } from "@/common/erp/purchasing-types";
import { roundMoney } from "@/common/erp/purchasing-types";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { NumericInput } from "@/components/ui/numeric-input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  commitResolvedLandedAllocationsToLines,
  getLandedAllocationRemainder,
  isLandedAllocationBalanced,
  resolveDocumentLandedAllocations,
  sumDocumentLandedCostTotal,
} from "@/modules/purchasing/lib/purchase-landed-allocation";

export function PurchaseDocumentLandedBreakdown({
  lines,
  landedCosts,
  onLinesChange,
}: {
  lines: PurchaseLineFormRow[];
  landedCosts: LandedCostFormRow[];
  onLinesChange: (lines: PurchaseLineFormRow[]) => void;
}) {
  const landedTotal = useMemo(
    () => sumDocumentLandedCostTotal(landedCosts),
    [landedCosts],
  );
  const allocationRows = useMemo(() => {
    const amounts = resolveDocumentLandedAllocations(lines, landedCosts);
    return lines
      .filter((l) => l.quantity > 0 && l.productName.trim())
      .map((l) => ({
        key: l.key,
        name: l.productName.trim(),
        allocated: amounts.get(l.key) ?? 0,
      }));
  }, [lines, landedCosts]);

  const remainder = getLandedAllocationRemainder(lines, landedCosts);
  const allocatedSum = roundMoney(landedTotal - remainder);
  const isBalanced = isLandedAllocationBalanced(lines, landedCosts);

  function updateAllocation(lineKey: string, amount: number) {
    if (!Number.isFinite(amount)) return;
    const clamped = roundMoney(Math.max(0, amount));
    const withEdit = lines.map((l) =>
      l.key === lineKey ? { ...l, landedCostAllocated: clamped } : l,
    );
    onLinesChange(commitResolvedLandedAllocationsToLines(withEdit, landedCosts));
  }

  function resetToAuto() {
    onLinesChange(lines.map((l) => ({ ...l, landedCostAllocated: undefined })));
  }

  if (allocationRows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Add line items to allocate landed costs across products.
      </p>
    );
  }

  if (landedTotal <= 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Add freight, duty, or other landed cost lines above to split across items.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">Landed cost per item</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            Total{" "}
            <span className="font-medium tabular-nums text-foreground">
              {formatCurrencyAmount(landedTotal)}
            </span>
          </span>
          {!isBalanced ? (
            <span className="text-amber-700 dark:text-amber-400">
              {remainder > 0 ? "Remaining" : "Over by"}{" "}
              {formatCurrencyAmount(Math.abs(remainder))}
            </span>
          ) : null}
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={resetToAuto}>
            Auto split
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">#</TableHead>
            <TableHead>Item</TableHead>
            <TableHead className="w-[140px] text-right">Landed allocated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allocationRows.map((row, index) => (
            <TableRow key={row.key}>
              <TableCell className="text-muted-foreground tabular-nums">{index + 1}</TableCell>
              <TableCell className="max-w-[200px] truncate text-sm">{row.name}</TableCell>
              <TableCell className="text-right">
                <NumericInput
                  className="ml-auto w-[120px] text-right"
                  min={0}
                  step="0.01"
                  fractionDigits={4}
                  value={row.allocated}
                  onValueChange={(v) => {
                    if (!Number.isFinite(v)) return;
                    updateAllocation(row.key, v);
                  }}
                />
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-muted/30 font-medium">
            <TableCell colSpan={2} className="text-right text-xs">Allocated</TableCell>
            <TableCell className="text-right tabular-nums text-sm">
              {formatCurrencyAmount(allocatedSum)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p className="text-[11px] text-muted-foreground">
        Default split is by line value (qty × rate). Change one line only — others stay as-is until
        you edit them. Use Auto split to redistribute the full{" "}
        {formatCurrencyAmount(landedTotal)}.
      </p>
    </div>
  );
}
