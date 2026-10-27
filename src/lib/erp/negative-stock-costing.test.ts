import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyReceiptAvco,
  invoiceLineMargin,
  receiptQtyAllocatedToPending,
  selectMarginUnitCostLegacy,
  selectMarginUnitCostPinned,
} from "./negative-stock-costing";

const INV_9C026 = {
  qty: 5,
  sell: 10,
  discount: 5,
  taxable: 50,
  saleTimeCost: 10,
  liveWacAfterBuys: 16.25,
};

describe("INV-9C026 / QA-NEG-STOCK-001 negative-stock costing", () => {
  it("receipt smaller than the short position still applies and leaves stock negative", () => {
    const state = applyReceiptAvco(-10, 10, 3, 20);
    assert.equal(state.stock, -7);
    assert.equal(state.wac, 20);
  });

  it("WAC ignores negative on-hand and blends only remaining positive stock", () => {
    let state = { stock: 0, wac: 10 as number | null };
    state = { stock: -5, wac: state.wac };

    state = applyReceiptAvco(state.stock, state.wac, 8, 10);
    assert.equal(state.stock, 3);
    assert.equal(state.wac, 10);

    state = applyReceiptAvco(state.stock, state.wac, 5, 20);
    assert.equal(state.stock, 8);
    assert.equal(state.wac, 16.25);
    assert.equal(round2((state.stock ?? 0) * (state.wac ?? 0)), 130);
  });

  it("catalog cost at sale is not pending, so receipts do not reallocate sold units", () => {
    const pendingAtSale = INV_9C026.saleTimeCost > 0 ? 0 : INV_9C026.qty;
    assert.equal(pendingAtSale, 0);
    assert.equal(receiptQtyAllocatedToPending(8, pendingAtSale), 0);
    assert.equal(receiptQtyAllocatedToPending(5, pendingAtSale), 0);
  });

  it("zero-cost negative-stock sale is pending; first receipt FIFO-costs those units only", () => {
    const pending = 5;
    const first = receiptQtyAllocatedToPending(8, pending);
    assert.equal(first, 5);
    const deferredCogs = round2(first * 10);
    assert.equal(deferredCogs, 50);
    assert.equal(receiptQtyAllocatedToPending(5, pending - first), 0);
  });

  it("reproduces Sales by Item ₹81.25 when cost equals selling price (live WAC fallthrough)", () => {
    const unit = selectMarginUnitCostLegacy({
      quantity: INV_9C026.qty,
      pendingCostQty: 0,
      basePrice: INV_9C026.saleTimeCost,
      unitPrice: INV_9C026.sell,
      liveResolvedCost: INV_9C026.liveWacAfterBuys,
    });
    assert.equal(unit, 16.25);

    const margin = invoiceLineMargin({
      quantity: INV_9C026.qty,
      pendingCostQty: 0,
      unitCost: unit,
      taxableAmount: INV_9C026.taxable,
      discountAllocated: INV_9C026.discount,
    });
    assert.equal(margin.netRevenueExTax, 45);
    assert.equal(margin.lineCogs, 81.25);
    assert.equal(margin.recognizedProfit, -36.25);
  });

  it("pins report COGS to sale-time cost ₹50; matches invoice journal / P&L", () => {
    const unit = selectMarginUnitCostPinned({
      quantity: INV_9C026.qty,
      pendingCostQty: 0,
      basePrice: INV_9C026.saleTimeCost,
      unitPrice: INV_9C026.sell,
      liveResolvedCost: INV_9C026.liveWacAfterBuys,
    });
    assert.equal(unit, 10);

    const margin = invoiceLineMargin({
      quantity: INV_9C026.qty,
      pendingCostQty: 0,
      unitCost: unit,
      taxableAmount: INV_9C026.taxable,
      discountAllocated: INV_9C026.discount,
    });
    assert.equal(margin.netRevenueExTax, 45);
    assert.equal(margin.lineCogs, 50);
    assert.equal(margin.recognizedProfit, -5);
  });

  it("does not propose a silent GL true-up onto later purchase lots", () => {
    const postedInvoiceCogs = 50;
    const reportLiveWacCogs = 81.25;
    const extra = round2(reportLiveWacCogs - postedInvoiceCogs);
    const remainingQty = 8;
    const remainingWacValue = 130;
    const glStockAfterSaleAndBuys = remainingWacValue;
    const glIfTrueUpLaterLots = round2(glStockAfterSaleAndBuys - extra);
    assert.equal(extra, 31.25);
    assert.notEqual(glIfTrueUpLaterLots, remainingQty * 16.25);
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
