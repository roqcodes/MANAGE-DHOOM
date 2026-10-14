import type { LandedCostFormRow, PurchaseLineFormRow } from "../src/common/erp/purchasing-types";
import {
  applyManualLineLandedAllocation,
  calcUnitLoadedCostFromAlloc,
  isLandedAllocationBalanced,
  resolveDocumentLandedAllocations,
  sumDocumentLandedCostTotal,
} from "../src/modules/purchasing/lib/purchase-landed-allocation";

function line(
  key: string,
  qty: number,
  price: number,
  alloc?: number,
): PurchaseLineFormRow {
  return {
    key,
    productId: null,
    variantId: null,
    productName: key,
    barcode: "",
    expiryDate: "",
    quantity: qty,
    purchasePrice: price,
    taxRatePercent: 0,
    landedCostAllocated: alloc,
  };
}

const landed: LandedCostFormRow[] = [
  {
    key: "lc1",
    landedCostItemId: null,
    name: "Freight",
    quantity: 1,
    rate: 100,
    taxRatePercent: 0,
  },
];

const autoLines = [line("A", 1, 50), line("B", 1, 30), line("C", 1, 20)];
const auto = resolveDocumentLandedAllocations(autoLines, landed, "value");
const autoA = auto.get("A");
const autoB = auto.get("B");
const autoC = auto.get("C");

if (autoA !== 50 || autoB !== 30 || autoC !== 20) {
  throw new Error(`Auto split wrong: ${autoA}, ${autoB}, ${autoC}`);
}
if (!isLandedAllocationBalanced(autoLines, landed, "value")) {
  throw new Error("Auto split should be balanced");
}

const landed200: LandedCostFormRow[] = [
  {
    key: "lc1",
    landedCostItemId: null,
    name: "Cargo",
    quantity: 1,
    rate: 100,
    taxRatePercent: 0,
  },
  {
    key: "lc2",
    landedCostItemId: null,
    name: "Labour",
    quantity: 1,
    rate: 100,
    taxRatePercent: 0,
  },
];
const qtyLines = [line("A", 10, 2.04), line("B", 10, 4)];
const byQty = resolveDocumentLandedAllocations(qtyLines, landed200, "quantity");
if (byQty.get("A") !== 100 || byQty.get("B") !== 100) {
  throw new Error(`Quantity split wrong: ${byQty.get("A")}, ${byQty.get("B")}`);
}
const unitA = calcUnitLoadedCostFromAlloc(2.04, 10, 100);
if (unitA !== 12.04) {
  throw new Error(`Expected new rate 12.04, got ${unitA}`);
}

const byValue = resolveDocumentLandedAllocations(qtyLines, landed200, "value");
const valA = byValue.get("A") ?? 0;
const valB = byValue.get("B") ?? 0;
if (Math.abs(valA - 67.55) > 0.01 || Math.abs(valB - 132.45) > 0.01) {
  throw new Error(`Value split wrong: ${valA}, ${valB}`);
}

const edited = applyManualLineLandedAllocation(autoLines, landed, "A", 40, "custom");
if (edited[0].landedCostAllocated !== 40) {
  throw new Error(`Edited A not preserved: ${edited[0].landedCostAllocated}`);
}
if (edited[1].landedCostAllocated !== 30 || edited[2].landedCostAllocated !== 20) {
  throw new Error(
    `Siblings were recalculated: B=${edited[1].landedCostAllocated} C=${edited[2].landedCostAllocated}`,
  );
}
if (isLandedAllocationBalanced(edited, landed, "custom")) {
  throw new Error("Partial edit should leave remainder (not silently rebalance)");
}

const second = applyManualLineLandedAllocation(edited, landed, "B", 35, "custom");
if (
  second[0].landedCostAllocated !== 40 ||
  second[1].landedCostAllocated !== 35 ||
  second[2].landedCostAllocated !== 20
) {
  throw new Error(
    `Second edit mutated others: ${second.map((l) => l.landedCostAllocated).join(",")}`,
  );
}

const balanced = applyManualLineLandedAllocation(second, landed, "C", 25, "custom");
if (!isLandedAllocationBalanced(balanced, landed, "custom")) {
  throw new Error(
    `Expected 40+35+25=100, remainder left. total=${sumDocumentLandedCostTotal(landed)}`,
  );
}

console.log("landed allocation checks passed");
