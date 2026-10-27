import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSimpleCatalogProductCreateInput,
  hasSimpleProductPricingSignal,
  isCatalogSimpleProductPricingValid,
  isPurchaseQuickCreatePricingValid,
  normalizeCatalogProductErpFields,
  shouldEnsureDefaultVariantForSimpleProduct,
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

describe("shouldEnsureDefaultVariantForSimpleProduct", () => {
  it("is true when list or purchase price is set", () => {
    assert.equal(shouldEnsureDefaultVariantForSimpleProduct(0, 0), false);
    assert.equal(shouldEnsureDefaultVariantForSimpleProduct(10, 0), true);
    assert.equal(shouldEnsureDefaultVariantForSimpleProduct(0, 8), true);
  });
});

describe("pricing validation policy", () => {
  it("catalog simple item accepts cost-only or list-only", () => {
    assert.equal(hasSimpleProductPricingSignal(0, 0), false);
    assert.equal(isCatalogSimpleProductPricingValid(0, 25), true);
    assert.equal(isCatalogSimpleProductPricingValid(99, 0), true);
  });

  it("purchase quick-create requires cost", () => {
    assert.equal(isPurchaseQuickCreatePricingValid(0), false);
    assert.equal(isPurchaseQuickCreatePricingValid(0.01), true);
  });
});

describe("buildSimpleCatalogProductCreateInput", () => {
  it("matches products-page simple create shape", () => {
    const input = buildSimpleCatalogProductCreateInput({
      operationId: "00000000-0000-4000-8000-000000000001",
      name: "Tomatoes",
      purchasePrice: 40,
      taxRatePercent: 15,
      hsnSac: "0702",
    });

    assert.deepEqual(input.setup, {
      mode: "simple",
      ensureDefaultVariant: true,
    });
    assert.equal(input.purchasePrice, 40);
    assert.equal(input.taxRatePercent, 15);
    assert.equal(input.price, null);
    assert.equal(input.hsnSac, "0702");
  });
});
