import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatBankingType,
  isInterAccountTransferCashBookRow,
  isNonPnlBankingRow,
} from "./banking-display";

describe("inter-account transfer cash-book display", () => {
  it("labels both transfer legs as Account transfer when typed account_transfer", () => {
    assert.equal(
      formatBankingType("account_transfer", {
        debit_amount: 200,
        credit_amount: 0,
        details: "Transfer in",
      }),
      "Account transfer",
    );
    assert.equal(
      formatBankingType("account_transfer", {
        debit_amount: 0,
        credit_amount: 200,
        details: "Transfer out",
      }),
      "Account transfer",
    );
  });

  it("labels legacy generic mirror rows (Counter / Credit) as Account transfer", () => {
    assert.equal(
      formatBankingType("generic", {
        debit_amount: 200,
        credit_amount: 0,
        details: "Counter",
      }),
      "Account transfer",
    );
    assert.equal(
      formatBankingType("generic", {
        debit_amount: 0,
        credit_amount: 200,
        details: "Credit",
      }),
      "Account transfer",
    );
  });

  it("still labels real other income as Other income", () => {
    assert.equal(
      formatBankingType("generic", {
        debit_amount: 300,
        credit_amount: 0,
        details: "Other income",
      }),
      "Other income",
    );
    assert.equal(
      isInterAccountTransferCashBookRow("generic", {
        debit_amount: 300,
        credit_amount: 0,
        details: "Other income",
      }),
      false,
    );
  });

  it("excludes transfers from non-P&L misclassification", () => {
    const transferIn = {
      debit_amount: 200,
      credit_amount: 0,
      details: "Counter",
    };
    assert.equal(isNonPnlBankingRow("generic", transferIn), true);

    const income = {
      debit_amount: 300,
      credit_amount: 0,
      details: "Other income",
    };
    assert.equal(isNonPnlBankingRow("generic", income), false);
  });
});
