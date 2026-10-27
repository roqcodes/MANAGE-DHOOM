import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSalesInvoiceDraft } from "./document-status";
import {
  assertErpInvoiceEditable,
  computeErpInvoiceEditable,
  ErpInvoiceNotEditableError,
  ERP_INVOICE_NOT_EDITABLE_CODE,
  isInvoiceNotEditableError,
} from "./invoice-edit-policy";

/** Mirrors `invoices-list-view` row `editDisabled` logic. */
function invoiceListEditDisabled(row: {
  status: string;
  amount_paid: number;
  credits_applied: number;
}): boolean {
  return (
    !isSalesInvoiceDraft(row.status) ||
    row.amount_paid > 0 ||
    row.credits_applied > 0 ||
    row.status === "cancelled"
  );
}

describe("invoice edit policy", () => {
  it("allows draft/pending invoices without payments", () => {
    assert.equal(
      computeErpInvoiceEditable({ status: "pending", amount_paid: 0, credits_applied: 0 }),
      true,
    );
    assert.equal(
      computeErpInvoiceEditable({ status: "draft", amount_paid: 0, credits_applied: 0 }),
      true,
    );
  });

  it("blocks finalized issued invoices even without payments", () => {
    assert.equal(
      computeErpInvoiceEditable({ status: "issued", amount_paid: 0, credits_applied: 0 }),
      false,
    );
    assert.equal(
      computeErpInvoiceEditable({ status: "paid", amount_paid: 0, credits_applied: 0 }),
      false,
    );
    assert.throws(() => assertErpInvoiceEditable({ status: "issued", amount_paid: 0 }), ErpInvoiceNotEditableError);
  });

  it("blocks draft with payments or credits", () => {
    assert.equal(
      computeErpInvoiceEditable({ status: "pending", amount_paid: 1, credits_applied: 0 }),
      false,
    );
    assert.equal(
      computeErpInvoiceEditable({ status: "pending", amount_paid: 0, credits_applied: 5 }),
      false,
    );
  });

  it("blocks cancelled invoices", () => {
    assert.equal(
      computeErpInvoiceEditable({ status: "cancelled", amount_paid: 0, credits_applied: 0 }),
      false,
    );
  });

  it("recognizes RPC error text", () => {
    assert.equal(
      isInvoiceNotEditableError(new Error(`${ERP_INVOICE_NOT_EDITABLE_CODE}: blocked`)),
      true,
    );
  });

  it("invoice list editDisabled aligns with computeErpInvoiceEditable", () => {
    const rows = [
      { status: "pending", amount_paid: 0, credits_applied: 0 },
      { status: "draft", amount_paid: 0, credits_applied: 0 },
      { status: "issued", amount_paid: 0, credits_applied: 0 },
      { status: "paid", amount_paid: 100, credits_applied: 0 },
      { status: "pending", amount_paid: 1, credits_applied: 0 },
      { status: "cancelled", amount_paid: 0, credits_applied: 0 },
    ];
    for (const row of rows) {
      assert.equal(
        invoiceListEditDisabled(row),
        !computeErpInvoiceEditable(row),
        `status=${row.status}`,
      );
    }
  });
});
