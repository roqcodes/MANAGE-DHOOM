import type { LandedCostFormRow, PurchaseLineFormRow } from "../src/common/erp/purchasing-types";
import {
  applyManualLineLandedAllocation,
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
const auto = resolveDocumentLandedAllocations(autoLines, landed);
const autoA = auto.get("A");
const autoB = auto.get("B");
const autoC = auto.get("C");

if (autoA !== 50 || autoB !== 30 || autoC !== 20) {
  throw new Error(`Auto split wrong: ${autoA}, ${autoB}, ${autoC}`);
}
if (!isLandedAllocationBalanced(autoLines, landed)) {
  throw new Error("Auto split should be balanced");
}

const edited = applyManualLineLandedAllocation(autoLines, landed, "A", 40);
if (edited[0].landedCostAllocated !== 40) {
  throw new Error(`Edited A not preserved: ${edited[0].landedCostAllocated}`);
}
if (edited[1].landedCostAllocated !== 30 || edited[2].landedCostAllocated !== 20) {
  throw new Error(
    `Siblings were recalculated: B=${edited[1].landedCostAllocated} C=${edited[2].landedCostAllocated}`,
  );
}
if (isLandedAllocationBalanced(edited, landed)) {
  throw new Error("Partial edit should leave remainder (not silently rebalance)");
}

const second = applyManualLineLandedAllocation(edited, landed, "B", 35);
if (
  second[0].landedCostAllocated !== 40 ||
  second[1].landedCostAllocated !== 35 ||
  second[2].landedCostAllocated !== 20
) {
  throw new Error(
    `Second edit mutated others: ${second.map((l) => l.landedCostAllocated).join(",")}`,
  );
}

const balanced = applyManualLineLandedAllocation(second, landed, "C", 25);
if (!isLandedAllocationBalanced(balanced, landed)) {
  throw new Error(
    `Expected 40+35+25=100, remainder left. total=${sumDocumentLandedCostTotal(landed)}`,
  );
}

console.log("landed allocation checks passed");
