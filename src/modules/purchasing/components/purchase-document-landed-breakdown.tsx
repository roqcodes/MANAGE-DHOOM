"use client";

import { useMemo } from "react";

import type {
  LandedAllocationMethod,
  LandedCostFormRow,
  PurchaseLineFormRow,
} from "@/common/erp/purchasing-types";
import { calcPurchaseLine, roundMoney } from "@/common/erp/purchasing-types";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { coalesceNumber } from "@/lib/numeric-input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  applyLandedAllocationMethodChange,
  applyManualLineLandedAllocation,
  calcUnitLoadedCostFromAlloc,
  getLandedAllocationRemainder,
  isLandedAllocationBalanced,
  resolveDocumentLandedAllocations,
  sumDocumentLandedCostTotal,
} from "@/modules/purchasing/lib/purchase-landed-allocation";

function formatPerItemCharge(allocated: number, quantity: number): string {
  const qty = quantity > 0 ? quantity : 0;
  if (qty <= 0) return "0";
  const per = allocated / qty;
  const rounded = roundMoney(per);
  if (Math.abs(rounded - per) < 1e-9) {
    return String(rounded);
  }
  return per.toFixed(4).replace(/\.?0+$/, "");
}

const METHOD_OPTIONS: { value: LandedAllocationMethod; label: string }[] = [
  { value: "quantity", label: "Quantity" },
  { value: "value", label: "Value" },
  { value: "custom", label: "Custom" },
];

export function PurchaseDocumentLandedBreakdown({
  lines,
  landedCosts,
  allocationMethod,
  onAllocationMethodChange,
  onLinesChange,
}: {
  lines: PurchaseLineFormRow[];
  landedCosts: LandedCostFormRow[];
  allocationMethod: LandedAllocationMethod;
  onAllocationMethodChange: (method: LandedAllocationMethod) => void;
  onLinesChange: (lines: PurchaseLineFormRow[]) => void;
}) {
  const landedTotal = useMemo(
    () => sumDocumentLandedCostTotal(landedCosts),
    [landedCosts],
  );

  const allocationRows = useMemo(() => {
    const amounts = resolveDocumentLandedAllocations(
      lines,
      landedCosts,
      allocationMethod,
    );
    return lines
      .filter((l) => l.quantity > 0 && l.productName.trim())
      .map((l) => {
        const qty = coalesceNumber(l.quantity);
        const rate = coalesceNumber(l.purchasePrice);
        const { taxable } = calcPurchaseLine(qty, rate, coalesceNumber(l.taxRatePercent));
        const allocated = amounts.get(l.key) ?? 0;
        const perItem = qty > 0 ? allocated / qty : 0;
        return {
          key: l.key,
          name: l.productName.trim(),
          quantity: qty,
          rate,
          amount: taxable,
          amountHint: `${qty} × ${rate}`,
          allocated,
          perItem,
          newRate: calcUnitLoadedCostFromAlloc(rate, qty, allocated),
        };
      });
  }, [lines, landedCosts, allocationMethod]);

  const remainder = getLandedAllocationRemainder(lines, landedCosts, allocationMethod);
  const isBalanced = isLandedAllocationBalanced(lines, landedCosts, allocationMethod);
  const chargeEditable = allocationMethod === "custom";

  function updateAllocation(lineKey: string, amount: number) {
    if (!Number.isFinite(amount)) return;
    let baseLines = lines;
    if (allocationMethod !== "custom") {
      baseLines = applyLandedAllocationMethodChange(
        lines,
        landedCosts,
        "custom",
        allocationMethod,
      );
      onAllocationMethodChange("custom");
    }
    onLinesChange(
      applyManualLineLandedAllocation(
        baseLines,
        landedCosts,
        lineKey,
        amount,
        "custom",
      ),
    );
  }

  function handleMethodChange(next: LandedAllocationMethod) {
    if (next === allocationMethod) return;
    onLinesChange(
      applyLandedAllocationMethodChange(lines, landedCosts, next, allocationMethod),
    );
    onAllocationMethodChange(next);
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
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/10 px-3 py-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Total landed amount</p>
          <p className="text-lg font-semibold tabular-nums text-destructive">
            {formatCurrencyAmount(landedTotal)}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Balance:{" "}
          <span
            className={
              isBalanced
                ? "font-medium tabular-nums text-foreground"
                : "font-medium tabular-nums text-amber-700 dark:text-amber-400"
            }
          >
            {formatCurrencyAmount(remainder)}
          </span>
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Allocation method</Label>
        <div className="flex flex-wrap gap-4">
          {METHOD_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <input
                type="radio"
                name="landed-allocation-method"
                className="size-4 accent-primary"
                checked={allocationMethod === opt.value}
                onChange={() => handleMethodChange(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">Sl#</TableHead>
              <TableHead>Item details</TableHead>
              <TableHead className="w-16 text-right">Qty</TableHead>
              <TableHead className="w-24 text-right">Rate</TableHead>
              <TableHead className="w-28 text-right">Amount</TableHead>
              <TableHead className="w-[140px] text-right">Charge</TableHead>
              <TableHead className="w-28 text-right">New rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allocationRows.map((row, index) => (
              <TableRow key={row.key}>
                <TableCell className="text-muted-foreground tabular-nums">{index + 1}</TableCell>
                <TableCell className="max-w-[180px] truncate text-sm font-medium">
                  {row.name}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">{row.quantity}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {formatCurrencyAmount(row.rate)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="tabular-nums text-sm">{formatCurrencyAmount(row.amount)}</div>
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-500">
                    {row.amountHint}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {chargeEditable ? (
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
                  ) : (
                    <div className="ml-auto w-[120px] rounded-md border border-border/60 bg-muted/40 px-2 py-1.5 text-right tabular-nums text-sm">
                      {formatCurrencyAmount(row.allocated)}
                    </div>
                  )}
                  <div className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-500">
                    Per item: {formatPerItemCharge(row.allocated, row.quantity)}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm font-medium">
                  {formatCurrencyAmount(row.newRate)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        <strong>Quantity</strong> — split landed cost evenly per unit (
        {formatCurrencyAmount(landedTotal)} ÷ total qty).{" "}
        <strong>Value</strong> — split by line amount (qty × rate).{" "}
        <strong>Custom</strong> — enter charge per line; balance must be zero before save.
      </p>
    </div>
  );
}
