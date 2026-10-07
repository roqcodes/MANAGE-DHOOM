"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import type { ErpSalesProductSearchRow, SalesLineFormRow } from "@/common/erp/sales-types";
import { calcSalesLine, roundSalesMoney } from "@/common/erp/sales-types";
import { ProductLiveSearch } from "@/modules/admin/ui/product-live-search";
import {
  LineProductDetailsPanel,
  LineProductDetailsToggle,
} from "@/modules/erp/components/line-product-details-panel";
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
import {
  resolveSalesLineDefaultsFromSelection,
  salesLineDefaultsFromSearchRow,
} from "@/modules/erp/lib/resolve-product-line-defaults.client";

function newLineKey() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function emptySalesLine(): SalesLineFormRow {
  return {
    key: newLineKey(),
    productId: null,
    variantId: null,
    productName: "",
    description: "",
    barcode: "",
    quantity: 1,
    unitPrice: 0,
    taxRatePercent: 0,
    unitId: null,
  };
}

export function salesLinesToApiInput(lines: SalesLineFormRow[]) {
  return lines
    .filter((l) => l.productName.trim() && l.quantity > 0)
    .map((l) => ({
      productId: l.productId,
      variantId: null,
      productName: l.productName,
      description: l.description || null,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxRatePercent: l.taxRatePercent,
      unitId: l.unitId,
    }));
}

export function SalesLinesEditor({
  lines,
  onChange,
  storeId,
  customerId,
  taxInclusive = false,
  showSerial = false,
}: {
  lines: SalesLineFormRow[];
  onChange: (lines: SalesLineFormRow[]) => void;
  storeId?: string;
  customerId?: string;
  taxInclusive?: boolean;
  showSerial?: boolean;
}) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const colSpan = (showSerial ? 1 : 0) + 6;

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const line of lines) {
      const { taxable, taxAmount } = calcSalesLine(
        line.quantity,
        line.unitPrice,
        line.taxRatePercent,
        taxInclusive,
      );
      subtotal += taxable;
      tax += taxAmount;
    }
    return {
      subtotal: roundSalesMoney(subtotal),
      tax: roundSalesMoney(tax),
      total: roundSalesMoney(subtotal + tax),
    };
  }, [lines, taxInclusive]);

  function toggleDetails(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function addFromSearch(row: ErpSalesProductSearchRow) {
    const key = newLineKey();
    const { unitPrice, taxRatePercent } = salesLineDefaultsFromSearchRow(row);
    const newLine: SalesLineFormRow = {
      key,
      productId: row.id,
      variantId: null,
      productName: row.product_name,
      description: "",
      barcode: row.barcode ?? "",
      quantity: 1,
      unitPrice,
      taxRatePercent,
      unitId: null,
    };
    const next = [...lines.filter((l) => l.productName.trim()), newLine];
    linesRef.current = next;
    onChange(next);

    if (!storeId) return;

    void resolveSalesLineDefaultsFromSelection(row, { storeId, customerId }).then(
      (resolved) => {
        const current = linesRef.current;
        if (!current.some((l) => l.key === key)) return;
        const updated = current.map((l) =>
          l.key === key
            ? { ...l, unitPrice: resolved.unitPrice, taxRatePercent: resolved.taxRatePercent }
            : l,
        );
        linesRef.current = updated;
        onChange(updated);
      },
    );
  }

  function updateLine(key: string, patch: Partial<SalesLineFormRow>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    onChange(lines.filter((l) => l.key !== key));
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <ProductLiveSearch
        catalog="sales"
        storeId={storeId}
        placeholder="Search product by name or barcode…"
        className="max-w-md"
        onSelect={(row) => addFromSearch(row as ErpSalesProductSearchRow)}
      />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {showSerial ? <TableHead className="w-10">#</TableHead> : null}
              <TableHead>Item</TableHead>
              <TableHead className="w-20">Qty</TableHead>
              <TableHead className="w-28">Rate</TableHead>
              <TableHead className="w-20">Tax %</TableHead>
              <TableHead className="w-28 text-right">Tax amount</TableHead>
              <TableHead className="w-28 text-right">Total</TableHead>
              <TableHead className="w-[88px]">Details</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => {
              const { taxAmount, total } = calcSalesLine(
                coalesceNumber(line.quantity),
                coalesceNumber(line.unitPrice),
                coalesceNumber(line.taxRatePercent),
                taxInclusive,
              );
              const detailsOpen = expandedKeys.has(line.key);
              const canShowDetails = Boolean(line.productId && storeId && customerId);

              return (
                <Fragment key={line.key}>
                  <TableRow>
                    {showSerial ? (
                      <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                    ) : null}
                    <TableCell>
                      <Input
                        value={line.productName}
                        onChange={(e) => updateLine(line.key, { productName: e.target.value })}
                        placeholder="Product name"
                      />
                    </TableCell>
                    <TableCell>
                      <NumericInput
                        min={0}
                        step="any"
                        value={line.quantity}
                        onValueChange={(quantity) => updateLine(line.key, { quantity })}
                      />
                    </TableCell>
                    <TableCell>
                      <NumericInput
                        min={0}
                        step="0.01"
                        value={line.unitPrice}
                        onValueChange={(unitPrice) => updateLine(line.key, { unitPrice })}
                      />
                    </TableCell>
                    <TableCell>
                      <NumericInput
                        min={0}
                        step="0.01"
                        value={line.taxRatePercent}
                        onValueChange={(taxRatePercent) =>
                          updateLine(line.key, { taxRatePercent })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatCurrencyAmount(taxAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCurrencyAmount(total)}
                    </TableCell>
                    <TableCell>
                      <LineProductDetailsToggle
                        open={detailsOpen}
                        disabled={!canShowDetails}
                        disabledReason="Select customer and add a product from search"
                        onToggle={() => toggleDetails(line.key)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeLine(line.key)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {detailsOpen ? (
                    <TableRow className="bg-muted/10 hover:bg-muted/10">
                      <TableCell colSpan={colSpan} className="py-3">
                        <LineProductDetailsPanel
                          productId={line.productId!}
                          storeId={storeId}
                          customerId={customerId}
                          counterpartyKind="customer"
                          enabled={canShowDetails}
                        />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...lines, emptySalesLine()])}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add line
        </Button>
      </div>

      <div className="flex justify-end gap-6 text-sm">
        <span>
          Subtotal: <strong>{formatCurrencyAmount(totals.subtotal)}</strong>
        </span>
        <span>
          Tax: <strong>{formatCurrencyAmount(totals.tax)}</strong>
        </span>
        <span>
          Total: <strong>{formatCurrencyAmount(totals.total)}</strong>
        </span>
      </div>
    </div>
  );
}
