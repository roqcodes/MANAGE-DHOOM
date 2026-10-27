import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSimpleCatalogProductCreateInput,
  normalizeCatalogProductErpFields,
  shouldEnsureDefaultVariantForSimpleProduct,
  validateNewItemCreatePricing,
} from "./build-simple-catalog-product-create-input";

describe("normalizeCatalogProductErpFields", () => {
  it("stores purchase and tax only when strictly positive", () => {
    assert.deepEqual(
      normalizeCatalogProductErpFields({
        purchasePrice: 0,
        taxRatePercent: 0,
      }),
      {
        barcode: null,
        productCode: null,
        purchasePrice: null,
        taxRatePercent: null,
        unitId: null,
        markupPercent: null,
      },
    );

    assert.equal(
      normalizeCatalogProductErpFields({
        purchasePrice: 12.5,
        taxRatePercent: 15,
      }).purchasePrice,
      12.5,
    );
  });
});

describe("validateNewItemCreatePricing", () => {
  it("requires both prices and sales greater than purchase", () => {
    assert.equal(validateNewItemCreatePricing(0, 10).ok, false);
    assert.equal(validateNewItemCreatePricing(10, 0).ok, false);
    assert.equal(validateNewItemCreatePricing(10, 10).ok, false);
    assert.equal(validateNewItemCreatePricing(10, 11).ok, false);
    assert.equal(validateNewItemCreatePricing(11, 10).ok, true);
  });
});

describe("shouldEnsureDefaultVariantForSimpleProduct", () => {
  it("follows new-item pricing rules", () => {
    assert.equal(shouldEnsureDefaultVariantForSimpleProduct(0, 0), false);
    assert.equal(shouldEnsureDefaultVariantForSimpleProduct(20, 10), true);
  });
});

describe("buildSimpleCatalogProductCreateInput", () => {
  it("matches products-page simple create shape", () => {
    const input = buildSimpleCatalogProductCreateInput({
      operationId: "00000000-0000-4000-8000-000000000001",
      name: "Tomatoes",
      defaultPrice: 50,
      purchasePrice: 40,
      taxRatePercent: 15,
      hsnSac: "0702",
    });

    assert.deepEqual(input.setup, {
      mode: "simple",
      ensureDefaultVariant: true,
    });
    assert.equal(input.purchasePrice, 40);
    assert.equal(input.price, 50);
    assert.equal(input.taxRatePercent, 15);
    assert.equal(input.hsnSac, "0702");
  });
});
