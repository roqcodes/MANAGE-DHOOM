"use client";

import { Layers, List, Package, Plus } from "lucide-react";

import type { ProductVariant, ProductWithCategory, VariantGroup } from "@/common/admin/types";
import {
  downgradeProductToFlatLayoutAction,
  upgradeProductToGroupedLayoutAction,
} from "@/modules/products/actions/products.actions";
import { useAdminAction } from "@/modules/admin/hooks/use-admin-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  catalogModeDescription,
  catalogModeLabel,
  getProductCatalogMode,
} from "@/modules/products/lib/product-sku-catalog";

export function ProductSkuCatalogCard({
  product,
  variants,
  variantGroups = [],
  onAddVariant,
  onEditVariants,
  onUpgraded,
}: {
  product: ProductWithCategory;
  variants: ProductVariant[];
  variantGroups?: VariantGroup[];
  onAddVariant: () => void;
  onEditVariants: () => void;
  onUpgraded?: () => void;
}) {
  const { runAction, isPending } = useAdminAction();
  const mode = getProductCatalogMode(product, variants, variantGroups);
  const isGrouped = mode === "grouped";

  function upgradeToGroups() {
    runAction(async () => {
      await upgradeProductToGroupedLayoutAction(product.id);
      onUpgraded?.();
      onEditVariants();
    }, { errorTitle: "Could not switch to variant groups" });
  }

  function downgradeToFlat() {
    const ok = confirm(
      "Switch to flat variants? All SKUs and stock are kept. Group names are removed and each SKU gets its own storefront row (with images).",
    );
    if (!ok) return;
    runAction(async () => {
      await downgradeProductToFlatLayoutAction(product.id);
      onUpgraded?.();
      onEditVariants();
    }, { errorTitle: "Could not switch to flat variants" });
  }

  return (
    <Card className="border border-border ring-0">
      <CardHeader className="border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Catalog structure</CardTitle>
          <Badge variant="outline">{catalogModeLabel(mode)}</Badge>
        </div>
        <CardDescription>{catalogModeDescription(mode)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 pt-4">
        {!isGrouped ? (
          <Button type="button" variant="outline" size="sm" onClick={onAddVariant}>
            <Plus data-icon="inline-start" />
            Add SKU
          </Button>
        ) : null}

        {mode === "simple" || mode === "flat" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending || variants.length === 0}
            onClick={upgradeToGroups}
          >
            <Layers data-icon="inline-start" />
            Use variant groups
          </Button>
        ) : null}

        {mode === "grouped" ? (
          <>
            <Button type="button" variant="outline" size="sm" onClick={onEditVariants}>
              <Package data-icon="inline-start" />
              Manage groups
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={downgradeToFlat}
            >
              <List data-icon="inline-start" />
              Use flat variants
            </Button>
          </>
        ) : null}

        {mode === "erp-only" ? (
          <Button type="button" size="sm" onClick={onEditVariants}>
            Set up selling
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
