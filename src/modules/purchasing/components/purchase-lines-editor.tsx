"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { PackagePlus, Plus, Trash2 } from "lucide-react";

import type { ErpProductSearchRow, PurchaseLineFormRow } from "@/common/erp/purchasing-types";
import { calcPurchaseLine, roundMoney } from "@/common/erp/purchasing-types";
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
  purchaseLineDefaultsFromSearchRow,
  resolvePurchaseLineDefaultsFromSelection,
} from "@/modules/erp/lib/resolve-product-line-defaults.client";
import { QuickProductCreateModal } from "@/modules/products/components/quick-product-create-modal";

function newLineKey() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyPurchaseLine(): PurchaseLineFormRow {
  return {
    key: newLineKey(),
    productId: null,
    variantId: null,
    productName: "",
    barcode: "",
    expiryDate: "",
    quantity: 1,
    purchasePrice: 0,
    taxRatePercent: 0,
  };
}

export function PurchaseLinesEditor({
  lines,
  onChange,
  storeId,
  vendorId,
  showExpiry = false,
  showSerial = false,
}: {
  lines: PurchaseLineFormRow[];
  onChange: (lines: PurchaseLineFormRow[]) => void;
  storeId?: string;
  vendorId?: string;
  showExpiry?: boolean;
  showSerial?: boolean;
}) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [createProductOpen, setCreateProductOpen] = useState(false);
  const [createProductName, setCreateProductName] = useState("");
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const colSpan =
    (showSerial ? 1 : 0) + 5 + (showExpiry ? 1 : 0) + 2;

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const line of lines) {
      const { taxable, taxAmount } = calcPurchaseLine(
        line.quantity,
        line.purchasePrice,
        line.taxRatePercent,
      );
      subtotal += taxable;
      tax += taxAmount;
    }
    return { subtotal: roundMoney(subtotal), tax: roundMoney(tax), total: roundMoney(subtotal + tax) };
  }, [lines]);

  function toggleDetails(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function addProduct(row: ErpProductSearchRow) {
    const key = newLineKey();
    const { purchasePrice, taxRatePercent } = purchaseLineDefaultsFromSearchRow(row);
    const newLine: PurchaseLineFormRow = {
      key,
      productId: row.id,
      variantId: null,
      productName: row.product_name,
      barcode: row.barcode ?? "",
      expiryDate: "",
      quantity: 1,
      purchasePrice,
      taxRatePercent,
    };
    const next = [...lines, newLine];
    linesRef.current = next;
    onChange(next);

    if (!storeId) return;

    void resolvePurchaseLineDefaultsFromSelection(row, { storeId, vendorId }).then(
      (resolved) => {
        const current = linesRef.current;
        if (!current.some((l) => l.key === key)) return;
        const updated = current.map((l) =>
          l.key === key
            ? {
                ...l,
                purchasePrice: resolved.purchasePrice,
                taxRatePercent: resolved.taxRatePercent,
              }
            : l,
        );
        linesRef.current = updated;
        onChange(updated);
      },
    );
  }

  function openCreateProduct(prefill = "") {
    setCreateProductName(prefill);
    setCreateProductOpen(true);
  }

  function updateLine(index: number, patch: Partial<PurchaseLineFormRow>) {
    const next = [...lines];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function removeLine(index: number) {
    const key = lines[index]?.key;
    onChange(lines.filter((_, i) => i !== index));
    if (key) {
      setExpandedKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-[240px] flex-1 flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Search product</label>
          <ProductLiveSearch
            catalog="purchase"
            placeholder="Name or barcode…"
            allowCreate
            onCreateRequest={(q) => openCreateProduct(q)}
            onSelect={(row) => addProduct(row as ErpProductSearchRow)}
          />
        </div>
        <Button type="button" variant="outline" onClick={() => openCreateProduct()}>
          <PackagePlus className="size-4" />
          New product
        </Button>
        <Button type="button" variant="outline" onClick={() => onChange([...lines, emptyPurchaseLine()])}>
          <Plus className="size-4" />
          Add line
        </Button>
      </div>

      {createProductOpen ? (
        <QuickProductCreateModal
          nested
          initialName={createProductName}
          onClose={() => setCreateProductOpen(false)}
          onCreated={(product) => addProduct(product)}
        />
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <TableHeader>
            <TableRow>
              {showSerial ? <TableHead className="w-10">Sl#</TableHead> : null}
              <TableHead>Item name</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Tax %</TableHead>
              {showExpiry ? <TableHead>Expiry</TableHead> : null}
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-[88px]">Details</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => {
              const { lineTotal } = calcPurchaseLine(
                coalesceNumber(line.quantity),
                coalesceNumber(line.purchasePrice),
                coalesceNumber(line.taxRatePercent),
              );
              const detailsOpen = expandedKeys.has(line.key);
              const canShowDetails = Boolean(line.productId && storeId && vendorId);

              return (
                <Fragment key={line.key}>
                  <TableRow>
                    {showSerial ? (
                      <TableCell className="text-muted-foreground tabular-nums">{index + 1}</TableCell>
                    ) : null}
                    <TableCell className="min-w-[200px]">
                      <Input
                        value={line.productName}
                        onChange={(e) => updateLine(index, { productName: e.target.value })}
                        placeholder="Product name"
                      />
                    </TableCell>
                    <TableCell>
                      <NumericInput
                        min={0}
                        step="any"
                        className="w-20"
                        value={line.quantity}
                        onValueChange={(quantity) => updateLine(index, { quantity })}
                      />
                    </TableCell>
                    <TableCell>
                      <NumericInput
                        min={0}
                        step="any"
                        className="w-24"
                        value={line.purchasePrice}
                        onValueChange={(purchasePrice) =>
                          updateLine(index, { purchasePrice })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <NumericInput
                        min={0}
                        step="any"
                        className="w-20"
                        value={line.taxRatePercent}
                        onValueChange={(taxRatePercent) =>
                          updateLine(index, { taxRatePercent })
                        }
                      />
                    </TableCell>
                    {showExpiry ? (
                      <TableCell>
                        <Input
                          type="date"
                          value={line.expiryDate}
                          onChange={(e) => updateLine(index, { expiryDate: e.target.value })}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell className="text-right tabular-nums">
                      {formatCurrencyAmount(lineTotal)}
                    </TableCell>
                    <TableCell>
                      <LineProductDetailsToggle
                        open={detailsOpen}
                        disabled={!canShowDetails}
                        disabledReason="Select vendor and add a product from search"
                        onToggle={() => toggleDetails(line.key)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(index)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {detailsOpen ? (
                    <TableRow className="bg-muted/10 hover:bg-muted/10">
                      <TableCell colSpan={colSpan} className="py-3">
                        <LineProductDetailsPanel
                          productId={line.productId!}
                          storeId={storeId}
                          vendorId={vendorId}
                          counterpartyKind="vendor"
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

      <div className="flex flex-col items-end gap-1 border-t pt-3 text-sm">
        <div className="flex w-full max-w-xs justify-between gap-8 text-muted-foreground">
          <span>Sub total</span>
          <span className="tabular-nums">{formatCurrencyAmount(totals.subtotal)}</span>
        </div>
        <div className="flex w-full max-w-xs justify-between gap-8 text-muted-foreground">
          <span>Tax</span>
          <span className="tabular-nums">{formatCurrencyAmount(totals.tax)}</span>
        </div>
        <div className="flex w-full max-w-xs justify-between gap-8 font-semibold text-foreground">
          <span>Total</span>
          <span className="tabular-nums">{formatCurrencyAmount(totals.total)}</span>
        </div>
      </div>
    </div>
  );
}

export function linesToApiInput(lines: PurchaseLineFormRow[]) {
  return lines
    .filter((l) => l.productName.trim() && l.quantity > 0)
    .map((l) => ({
      productId: l.productId,
      variantId: l.variantId,
      productName: l.productName.trim(),
      barcode: l.barcode || null,
      expiryDate: l.expiryDate || null,
      quantity: l.quantity,
      purchasePrice: l.purchasePrice,
      taxRatePercent: l.taxRatePercent,
    }));
}
