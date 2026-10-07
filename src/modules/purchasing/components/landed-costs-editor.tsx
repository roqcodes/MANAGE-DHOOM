"use client";

import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";

import type { ErpLandedCostItem, LandedCostFormRow } from "@/common/erp/purchasing-types";
import { calcPurchaseLine, roundMoney } from "@/common/erp/purchasing-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { coalesceNumber } from "@/lib/numeric-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrencyAmount } from "@/lib/format-currency";

function newLcKey() {
  return `lc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyLandedCostRow(): LandedCostFormRow {
  return {
    key: newLcKey(),
    landedCostItemId: null,
    name: "",
    quantity: 1,
    rate: 0,
    taxRatePercent: 0,
  };
}

export function LandedCostsEditor({
  rows,
  onChange,
  masterItems,
}: {
  rows: LandedCostFormRow[];
  onChange: (rows: LandedCostFormRow[]) => void;
  masterItems: ErpLandedCostItem[];
}) {
  const total = useMemo(() => {
    let sum = 0;
    for (const row of rows) {
      const { lineTotal } = calcPurchaseLine(row.quantity, row.rate, row.taxRatePercent);
      sum += lineTotal;
    }
    return roundMoney(sum);
  }, [rows]);

  function addFromMaster(item: ErpLandedCostItem) {
    onChange([
      ...rows,
      {
        key: newLcKey(),
        landedCostItemId: item.id,
        name: item.name,
        quantity: 1,
        rate: item.rate,
        taxRatePercent: item.tax_rate_percent,
      },
    ]);
  }

  function updateRow(index: number, patch: Partial<LandedCostFormRow>) {
    const next = [...rows];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {masterItems.filter((m) => m.is_active).map((item) => (
          <Button key={item.id} type="button" variant="outline" size="sm" onClick={() => addFromMaster(item)}>
            <Plus className="size-3" />
            {item.name}
          </Button>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, emptyLandedCostRow()])}>
          <Plus className="size-3" />
          Custom landed cost
        </Button>
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Tax %</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => {
                const { lineTotal } = calcPurchaseLine(
                  coalesceNumber(row.quantity),
                  coalesceNumber(row.rate),
                  coalesceNumber(row.taxRatePercent),
                );
                return (
                  <TableRow key={row.key}>
                    <TableCell>
                      <Input
                        value={row.name}
                        onChange={(e) => updateRow(index, { name: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <NumericInput
                        className="w-20"
                        value={row.quantity}
                        onValueChange={(quantity) => updateRow(index, { quantity })}
                      />
                    </TableCell>
                    <TableCell>
                      <NumericInput
                        className="w-24"
                        value={row.rate}
                        onValueChange={(rate) => updateRow(index, { rate })}
                      />
                    </TableCell>
                    <TableCell>
                      <NumericInput
                        className="w-20"
                        value={row.taxRatePercent}
                        onValueChange={(taxRatePercent) =>
                          updateRow(index, { taxRatePercent })
                        }
                      />
                    </TableCell>
                    <TableCell className="tabular-nums">{formatCurrencyAmount(lineTotal)}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onChange(rows.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-sm text-slate-600">Landed costs total: {formatCurrencyAmount(total)}</p>
    </div>
  );
}

export function landedCostsToApiInput(rows: LandedCostFormRow[]) {
  return rows
    .filter((r) => r.name.trim() && r.quantity > 0)
    .map((r) => ({
      landedCostItemId: r.landedCostItemId,
      name: r.name.trim(),
      quantity: r.quantity,
      rate: r.rate,
      taxRatePercent: r.taxRatePercent,
    }));
}
