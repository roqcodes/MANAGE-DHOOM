import type {
  LandedAllocationMethod,
  LandedCostFormRow,
  PurchaseLineFormRow,
} from "@/common/erp/purchasing-types";
import { calcPurchaseLine, roundMoney } from "@/common/erp/purchasing-types";
import { CALC_BALANCE_TOLERANCE } from "@/lib/decimal-precision";

export const LANDED_BALANCE_TOLERANCE = CALC_BALANCE_TOLERANCE;

export type { LandedAllocationMethod };

export type StoredPurchaseLineCost = {
  quantity: number;
  purchasePrice: number;
  landedCostAllocated?: number | null;
  unitLoadedCost?: number | null;
};

/** Landed share stored on a bill/PO line (or resolved amount). */
export function landedAllocFromStoredLine(line: {
  landedCostAllocated?: number | null;
  landed_cost_allocated?: number | null;
}): number {
  const raw = line.landedCostAllocated ?? line.landed_cost_allocated ?? 0;
  return roundMoney(Math.max(0, Number(raw)));
}

/** Loaded unit cost for display — prefers persisted `unit_loaded_cost`. */
export function loadedUnitCostFromStoredLine(
  line: StoredPurchaseLineCost & { landed_cost_allocated?: number | null; unit_loaded_cost?: number | null },
): number {
  const storedUnit = line.unitLoadedCost ?? line.unit_loaded_cost;
  if (storedUnit != null && Number.isFinite(Number(storedUnit))) {
    return roundMoney(Number(storedUnit));
  }
  const qty = Number(line.quantity ?? 0);
  const price = Number(
    line.purchasePrice ?? (line as { purchase_price?: number }).purchase_price ?? 0,
  );
  const alloc = landedAllocFromStoredLine(line);
  return calcUnitLoadedCostFromAlloc(price, qty, alloc);
}

export function calcUnitLoadedCostFromAlloc(
  purchasePrice: number,
  quantity: number,
  landedCostAllocated: number,
): number {
  const price = Number.isFinite(purchasePrice) ? purchasePrice : 0;
  const qty = quantity > 0 ? quantity : 0;
  const alloc = roundMoney(Math.max(0, landedCostAllocated));
  return qty > 0 ? roundMoney(price + alloc / qty) : roundMoney(price);
}

export type PurchaseLineAllocationRow = {
  key: string;
  quantity: number;
  unitPrice: number;
};

export type PurchaseLineCostBreakdown = {
  quantity: number;
  unitPrice: number;
  extended: number;
  taxAmount: number;
  lineTotal: number;
  landedAllocated: number;
  unitLoadedCost: number;
  totalWithLanded: number;
};

/** Landed charge total for this document (incl. tax on landed lines), matching DB line_total sum. */
export function sumDocumentLandedCostTotal(rows: LandedCostFormRow[]): number {
  let sum = 0;
  for (const row of rows) {
    const { lineTotal } = calcPurchaseLine(
      row.quantity,
      row.rate,
      row.taxRatePercent,
    );
    sum += lineTotal;
  }
  return roundMoney(sum);
}

/**
 * Pro-rata landed allocation by extended line value (qty × unit price), matching
 * refresh_purchase_order_landed_allocations / refresh_purchase_bill_landed_allocations.
 */
export function computePurchaseLineLandedAllocations(
  lines: PurchaseLineAllocationRow[],
  landedTotal: number,
  taxRatePercentByKey: Record<string, number>,
): Map<string, PurchaseLineCostBreakdown> {
  const result = new Map<string, PurchaseLineCostBreakdown>();
  const eligible = lines.filter((l) => coalesceQty(l.quantity) > 0);

  let basisTotal = 0;
  const extendedByKey = new Map<string, number>();
  for (const line of eligible) {
    const qty = coalesceQty(line.quantity);
    const ext = roundMoney(qty * coalesceNumber(line.unitPrice));
    extendedByKey.set(line.key, ext);
    basisTotal = roundMoney(basisTotal + ext);
  }

  const landed = roundMoney(landedTotal);
  let allocatedSoFar = 0;
  const n = eligible.length;

  eligible.forEach((line, index) => {
    const qty = coalesceQty(line.quantity);
    const unitPrice = coalesceNumber(line.unitPrice);
    const extended = extendedByKey.get(line.key) ?? 0;
    const taxRate = coalesceNumber(taxRatePercentByKey[line.key]);
    const { taxAmount, lineTotal } = calcPurchaseLine(qty, unitPrice, taxRate);

    let landedAllocated = 0;
    if (landed > 0 && basisTotal > 0 && n > 0) {
      if (index < n - 1) {
        landedAllocated = roundMoney(landed * (extended / basisTotal));
        allocatedSoFar = roundMoney(allocatedSoFar + landedAllocated);
      } else {
        landedAllocated = roundMoney(landed - allocatedSoFar);
      }
    }

    const unitLoadedCost = calcUnitLoadedCostFromAlloc(
      unitPrice,
      qty,
      landedAllocated,
    );

    result.set(line.key, {
      quantity: qty,
      unitPrice,
      extended,
      taxAmount,
      lineTotal,
      landedAllocated: Math.max(0, landedAllocated),
      unitLoadedCost,
      totalWithLanded: roundMoney(lineTotal + Math.max(0, landedAllocated)),
    });
  });

  for (const line of lines) {
    if (!result.has(line.key)) {
      const qty = coalesceQty(line.quantity);
      const unitPrice = coalesceNumber(line.unitPrice);
      const taxRate = coalesceNumber(taxRatePercentByKey[line.key]);
      const { taxable, taxAmount, lineTotal } = calcPurchaseLine(
        qty,
        unitPrice,
        taxRate,
      );
      result.set(line.key, {
        quantity: qty,
        unitPrice,
        extended: taxable,
        taxAmount,
        lineTotal,
        landedAllocated: 0,
        unitLoadedCost: unitPrice,
        totalWithLanded: lineTotal,
      });
    }
  }

  return result;
}

/** Pro-rata landed allocation by line quantity (equal landed charge per unit). */
export function computePurchaseLineLandedAllocationsByQuantity(
  lines: PurchaseLineAllocationRow[],
  landedTotal: number,
): Map<string, number> {
  const out = new Map<string, number>();
  const eligible = lines.filter((l) => coalesceQty(l.quantity) > 0);
  const landed = roundMoney(landedTotal);
  let qtyTotal = 0;
  for (const line of eligible) {
    qtyTotal = roundMoney(qtyTotal + coalesceQty(line.quantity));
  }
  let allocatedSoFar = 0;
  const n = eligible.length;
  eligible.forEach((line, index) => {
    const qty = coalesceQty(line.quantity);
    let landedAllocated = 0;
    if (landed > 0 && qtyTotal > 0 && n > 0) {
      if (index < n - 1) {
        landedAllocated = roundMoney(landed * (qty / qtyTotal));
        allocatedSoFar = roundMoney(allocatedSoFar + landedAllocated);
      } else {
        landedAllocated = roundMoney(landed - allocatedSoFar);
      }
    }
    out.set(line.key, Math.max(0, landedAllocated));
  });
  for (const line of lines) {
    if (!out.has(line.key)) {
      out.set(line.key, 0);
    }
  }
  return out;
}

function autoLandedAllocationsByMethod(
  allocRows: PurchaseLineAllocationRow[],
  landedTotal: number,
  taxRatePercentByKey: Record<string, number>,
  method: Exclude<LandedAllocationMethod, "custom">,
): Map<string, number> {
  if (method === "quantity") {
    return computePurchaseLineLandedAllocationsByQuantity(allocRows, landedTotal);
  }
  const auto = computePurchaseLineLandedAllocations(
    allocRows,
    landedTotal,
    taxRatePercentByKey,
  );
  const out = new Map<string, number>();
  for (const [key, b] of auto) {
    out.set(key, b.landedAllocated);
  }
  return out;
}

function coalesceNumber(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function isExplicitLandedAlloc(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

function coalesceQty(n: number): number {
  const q = coalesceNumber(n);
  return q > 0 ? q : 0;
}

export function getEffectiveLandedAllocations(
  lines: PurchaseLineAllocationRow[],
  landedTotal: number,
  taxRatePercentByKey: Record<string, number>,
  manualByKey: Record<string, number | null | undefined>,
): Map<string, number> {
  const auto = computePurchaseLineLandedAllocations(
    lines,
    landedTotal,
    taxRatePercentByKey,
  );
  const out = new Map<string, number>();
  const hasManual = lines.some((l) => isExplicitLandedAlloc(manualByKey[l.key]));
  if (!hasManual) {
    for (const [key, b] of auto) {
      out.set(key, b.landedAllocated);
    }
    return out;
  }
  const manualSum = roundMoney(
    lines.reduce((s, line) => {
      const m = manualByKey[line.key];
      return isExplicitLandedAlloc(m) ? s + m : s;
    }, 0),
  );
  const remaining = roundMoney(Math.max(0, landedTotal - manualSum));
  const unsetLines = lines.filter(
    (line) => !isExplicitLandedAlloc(manualByKey[line.key]),
  );
  const autoRemainder =
    unsetLines.length > 0 && remaining > 0
      ? computePurchaseLineLandedAllocations(
          unsetLines,
          remaining,
          taxRatePercentByKey,
        )
      : new Map<string, PurchaseLineCostBreakdown>();

  for (const line of lines) {
    const m = manualByKey[line.key];
    if (isExplicitLandedAlloc(m)) {
      out.set(line.key, roundMoney(Math.max(0, m)));
    } else {
      // Unset lines keep leftover only — never re-split the full total (that
      // would overwrite other items when one amount is edited).
      out.set(line.key, autoRemainder.get(line.key)?.landedAllocated ?? 0);
    }
  }
  return out;
}

function allocationRowsFromFormLines(lines: PurchaseLineFormRow[]): PurchaseLineAllocationRow[] {
  return lines
    .filter((l) => l.quantity > 0 && l.productName.trim())
    .map((l) => ({
      key: l.key,
      quantity: l.quantity,
      unitPrice: l.purchasePrice,
    }));
}

function taxRateByKeyFromLines(lines: PurchaseLineFormRow[]): Record<string, number> {
  const taxByKey: Record<string, number> = {};
  for (const l of lines) {
    taxByKey[l.key] = l.taxRatePercent;
  }
  return taxByKey;
}

function manualByKeyFromLines(
  lines: PurchaseLineFormRow[],
): Record<string, number | null | undefined> {
  const manualByKey: Record<string, number | null | undefined> = {};
  for (const l of lines) {
    manualByKey[l.key] = l.landedCostAllocated;
  }
  return manualByKey;
}

/**
 * Single source of truth for per-line landed amounts (UI + API).
 * When every eligible line has an explicit manual amount, those values are used as-is.
 */
export function resolveDocumentLandedAllocations(
  lines: PurchaseLineFormRow[],
  landedCosts: LandedCostFormRow[],
  method: LandedAllocationMethod = "value",
): Map<string, number> {
  const landedTotal = sumDocumentLandedCostTotal(landedCosts);
  if (landedTotal <= 0) {
    return new Map();
  }
  const allocRows = allocationRowsFromFormLines(lines);
  const taxByKey = taxRateByKeyFromLines(lines);

  if (method === "quantity" || method === "value") {
    return autoLandedAllocationsByMethod(allocRows, landedTotal, taxByKey, method);
  }

  const manualByKey = manualByKeyFromLines(lines);
  const allExplicit = allocRows.every((row) =>
    isExplicitLandedAlloc(manualByKey[row.key]),
  );
  if (allExplicit) {
    const manualSum = roundMoney(
      allocRows.reduce(
        (s, row) => s + Math.max(0, manualByKey[row.key] as number),
        0,
      ),
    );
    if (manualSum > 0) {
      const out = new Map<string, number>();
      for (const row of allocRows) {
        out.set(row.key, roundMoney(Math.max(0, manualByKey[row.key] as number)));
      }
      return out;
    }
  }
  return getEffectiveLandedAllocations(
    allocRows,
    landedTotal,
    taxByKey,
    manualByKey,
  );
}

/** Pick allocation method when reloading a document with stored per-line landed amounts. */
export function inferLandedAllocationMethod(
  lines: PurchaseLineFormRow[],
  landedCosts: LandedCostFormRow[],
): LandedAllocationMethod {
  const landedTotal = sumDocumentLandedCostTotal(landedCosts);
  if (landedTotal <= 0) return "value";
  const allocRows = allocationRowsFromFormLines(lines);
  if (!allocRows.length) return "value";

  const stored = new Map<string, number>();
  for (const row of allocRows) {
    const line = lines.find((l) => l.key === row.key);
    if (!line) continue;
    stored.set(row.key, landedAllocFromStoredLine(line));
  }
  const sumStored = roundMoney([...stored.values()].reduce((s, v) => s + v, 0));
  if (sumStored <= 0) return "value";

  const taxByKey = taxRateByKeyFromLines(lines);
  const byQty = computePurchaseLineLandedAllocationsByQuantity(allocRows, landedTotal);
  const byValue = autoLandedAllocationsByMethod(allocRows, landedTotal, taxByKey, "value");

  const matches = (m: Map<string, number>) =>
    allocRows.every((row) => {
      const a = m.get(row.key) ?? 0;
      const b = stored.get(row.key) ?? 0;
      return Math.abs(a - b) < LANDED_BALANCE_TOLERANCE;
    });

  if (matches(byQty)) return "quantity";
  if (matches(byValue)) return "value";
  return "custom";
}

export function applyLandedAllocationMethodChange(
  lines: PurchaseLineFormRow[],
  landedCosts: LandedCostFormRow[],
  nextMethod: LandedAllocationMethod,
  currentMethod: LandedAllocationMethod,
): PurchaseLineFormRow[] {
  if (nextMethod === currentMethod) return lines;
  if (nextMethod === "custom") {
    const amounts = resolveDocumentLandedAllocations(lines, landedCosts, currentMethod);
    return lines.map((l) => ({
      ...l,
      landedCostAllocated: amounts.get(l.key) ?? 0,
    }));
  }
  return lines.map((l) => ({ ...l, landedCostAllocated: undefined }));
}

/** @deprecated Use resolveDocumentLandedAllocations */
export function resolveLineLandedAllocationsForSave(
  lines: PurchaseLineFormRow[],
  landedCosts: LandedCostFormRow[],
  method: LandedAllocationMethod = "value",
): Map<string, number> {
  return resolveDocumentLandedAllocations(lines, landedCosts, method);
}

/** Write resolved landed amounts onto line rows so the outbox payload always includes them. */
export function commitResolvedLandedAllocationsToLines(
  lines: PurchaseLineFormRow[],
  landedCosts: LandedCostFormRow[],
  method: LandedAllocationMethod = "value",
): PurchaseLineFormRow[] {
  const landedTotal = sumDocumentLandedCostTotal(landedCosts);
  if (landedTotal <= 0) {
    return lines.map((l) => ({ ...l, landedCostAllocated: undefined }));
  }
  const amounts = resolveDocumentLandedAllocations(lines, landedCosts, method);
  return lines.map((l) => {
    const alloc = amounts.get(l.key);
    if (alloc == null) {
      return { ...l, landedCostAllocated: undefined };
    }
    return { ...l, landedCostAllocated: alloc };
  });
}

/**
 * User edited one item's landed share: freeze every other line at the amount
 * currently shown so sibling rows are not recalculated.
 */
export function applyManualLineLandedAllocation(
  lines: PurchaseLineFormRow[],
  landedCosts: LandedCostFormRow[],
  lineKey: string,
  amount: number,
  method: LandedAllocationMethod = "custom",
): PurchaseLineFormRow[] {
  const clamped = roundMoney(Math.max(0, amount));
  const snapshot = resolveDocumentLandedAllocations(lines, landedCosts, method);
  return lines.map((l) => {
    if (l.key === lineKey) {
      return { ...l, landedCostAllocated: clamped };
    }
    if (isExplicitLandedAlloc(l.landedCostAllocated)) {
      return l;
    }
    const frozen = snapshot.get(l.key);
    if (frozen == null) {
      return l;
    }
    return { ...l, landedCostAllocated: frozen };
  });
}

export function getLandedAllocationRemainder(
  lines: PurchaseLineFormRow[],
  landedCosts: LandedCostFormRow[],
  method: LandedAllocationMethod = "value",
): number {
  const landedTotal = sumDocumentLandedCostTotal(landedCosts);
  if (landedTotal <= 0) return 0;
  const amounts = resolveLineLandedAllocationsForSave(lines, landedCosts, method);
  const allocatedSum = roundMoney(
    [...amounts.values()].reduce((s, v) => s + v, 0),
  );
  return roundMoney(landedTotal - allocatedSum);
}

export function isLandedAllocationBalanced(
  lines: PurchaseLineFormRow[],
  landedCosts: LandedCostFormRow[],
  method: LandedAllocationMethod = "value",
): boolean {
  const landedTotal = sumDocumentLandedCostTotal(landedCosts);
  if (landedTotal <= 0) return true;
  const allocRows = allocationRowsFromFormLines(lines);
  if (!allocRows.length) return false;
  return (
    Math.abs(getLandedAllocationRemainder(lines, landedCosts, method)) <
    LANDED_BALANCE_TOLERANCE
  );
}

export function canApplyManualLandedAllocations(
  lines: Array<{ quantity: number; landedCostAllocated?: number | null }>,
  landedTotal: number,
): boolean {
  if (landedTotal <= 0) return false;
  const eligible = lines.filter((l) => l.quantity > 0);
  if (!eligible.length) return false;
  if (
    !eligible.every((l) => isExplicitLandedAlloc(l.landedCostAllocated))
  ) {
    return false;
  }
  const sum = roundMoney(
    eligible.reduce((s, l) => s + (l.landedCostAllocated ?? 0), 0),
  );
  return Math.abs(sum - roundMoney(landedTotal)) < LANDED_BALANCE_TOLERANCE;
}

/** Full line cost breakdown for forms (respects manual per-line landed overrides). */
export function getPurchaseLineCostBreakdown(
  line: PurchaseLineFormRow,
  allLines: PurchaseLineFormRow[],
  landedCosts: LandedCostFormRow[],
  method: LandedAllocationMethod = "value",
): PurchaseLineCostBreakdown | null {
  const landedTotal = sumDocumentLandedCostTotal(landedCosts);
  const allocRows = allocationRowsFromFormLines(allLines);
  if (!allocRows.some((r) => r.key === line.key)) return null;
  const amounts = resolveDocumentLandedAllocations(allLines, landedCosts, method);
  const landedAllocated = amounts.get(line.key) ?? 0;
  const qty = coalesceQty(line.quantity);
  const unitPrice = coalesceNumber(line.purchasePrice);
  const taxRate = coalesceNumber(line.taxRatePercent);
  const { taxable, taxAmount, lineTotal } = calcPurchaseLine(qty, unitPrice, taxRate);
  const unitLoadedCost = calcUnitLoadedCostFromAlloc(unitPrice, qty, landedAllocated);
  return {
    quantity: qty,
    unitPrice,
    extended: taxable,
    taxAmount,
    lineTotal,
    landedAllocated: Math.max(0, landedAllocated),
    unitLoadedCost,
    totalWithLanded: roundMoney(lineTotal + Math.max(0, landedAllocated)),
  };
}

