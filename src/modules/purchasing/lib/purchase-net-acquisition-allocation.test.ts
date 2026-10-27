import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calcNetUnitAcquisitionCost,
  computePurchaseLineLandedAllocations,
  proratePurchaseBillHeaderDiscount,
} from "./purchase-landed-allocation";

/** PB-DEDA5-style bill: equal line extensions, ₹60 discount, ₹90 landed. */
const PB_DEDA5_LINES = [
  { key: "B", quantity: 4, unitPrice: 50 },
  { key: "A", quantity: 5, unitPrice: 40 },
  { key: "QA", quantity: 10, unitPrice: 20 },
];

describe("purchase discount + landed allocation (PB-DEDA5 policy)", () => {
  it("allocates discount and landed on the same qty×rate basis", () => {
    const landedMap = computePurchaseLineLandedAllocations(
      PB_DEDA5_LINES,
      90,
      { B: 0, A: 0, QA: 0 },
    );
    const discountMap = proratePurchaseBillHeaderDiscount(PB_DEDA5_LINES, 60);

    for (const key of ["B", "A", "QA"]) {
      assert.equal(landedMap.get(key)?.landedAllocated, 30);
      assert.equal(discountMap.get(key), 20);
    }

    const netB = calcNetUnitAcquisitionCost(4, 50, 30, 20);
    const netA = calcNetUnitAcquisitionCost(5, 40, 30, 20);
    const netQa = calcNetUnitAcquisitionCost(10, 20, 30, 20);

    assert.equal(netB, 52.5);
    assert.equal(netA, 42);
    assert.equal(netQa, 21);

    const billNet = netB * 4 + netA * 5 + netQa * 10;
    assert.equal(billNet, 630);
  });

  it("loaded unit is higher than net when header discount applies", () => {
    const netQa = calcNetUnitAcquisitionCost(10, 20, 30, 20);
    assert.equal(netQa, 21);
    assert.equal(20 + 30 / 10, 23);
    assert.notEqual(netQa, 23);
  });
});
