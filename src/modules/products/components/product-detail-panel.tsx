"use client";

import { useEffect, useState, useMemo, Fragment, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { Package, Pencil, Plus, Trash2 } from "lucide-react";

import type {
  Brand,
  Category,
  ProductAtGlanceMetrics,
  ProductVariant,
  ProductWithCategory,
  VariantGroup,
} from "@/common/admin/types";
import type { PricingRuleRow } from "@/modules/pricing/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProductPricingSection } from "@/modules/products/components/product-pricing-section";
import { ProductSpecsSection } from "@/modules/products/components/product-specs-section";
import { toggleProductAction } from "@/modules/products/actions/products.actions";
import {
  deleteVariantAction,
  updateVariantAction,
} from "@/modules/products/actions/variants.actions";
import { ProductManageModal } from "@/modules/products/components/product-manage-modal";
import { ProductSkuCatalogCard } from "@/modules/products/components/product-sku-catalog-card";
import { getProductCatalogMode } from "@/modules/products/lib/product-sku-catalog";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { useAdminAction } from "@/modules/admin/hooks/use-admin-action";
import { currencyLabel, formatInr } from "@/lib/format-currency";
import { useCurrencySettings } from "@/modules/settings/providers/currency-settings-provider";

function formatSku(variantId: string) {
  return variantId.slice(0, 8).toUpperCase();
}

function previewImageUrl(variant: ProductVariant): string | null {
  const images = variant.images ?? [];
  const preview = images.find((img) => img.is_preview) ?? images[0];
  return preview?.url?.trim() ?? null;
}

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

function moneyInputValue(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "";
  return roundMoney2(Number(n)).toFixed(2);
}

function ProductHeroImage({ url }: { url: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  const trimmed = url?.trim() ?? "";
  useEffect(() => {
    setFailed(false);
  }, [trimmed]);
  if (!trimmed || failed) {
    return (
      <div className="flex size-full items-center justify-center bg-muted text-muted-foreground">
        <Package aria-hidden />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={trimmed}
      alt=""
      className="size-full object-cover object-center"
      onError={() => setFailed(true)}
    />
  );
}

function VariantThumbnail({
  variant,
  onClick,
}: {
  variant: ProductVariant;
  onClick: () => void;
}) {
  const url = previewImageUrl(variant);
  const label = variant.name ?? "variant";

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Edit ${label}`}
      className="size-9 shrink-0 overflow-hidden rounded-md border border-border transition-colors hover:border-primary/40 hover:ring-2 hover:ring-primary/15"
    >
      <VariantThumb url={url} />
    </button>
  );
}

function VariantThumb({ url }: { url: string | null }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) {
    return (
      <div className="flex size-full items-center justify-center bg-muted text-muted-foreground">
        <Package aria-hidden />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="size-full object-cover"
      onError={() => setBroken(true)}
    />
  );
}

function GlanceMetricCard({
  title,
  value,
  description,
}: {
  title: string;
  value: ReactNode;
  description?: ReactNode;
}) {
  return (
    <Card size="sm" className="border border-border ring-0">
      <CardHeader className="border-b border-border pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 pt-3">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {description ? (
          <CardDescription className="text-xs">{description}</CardDescription>
        ) : null}
      </CardContent>
    </Card>
  );
}

function VariantTableRow({
  variant,
  productId,
  disabled,
  showMrp,
  hideThumbnail,
  onEdit,
  onDelete,
}: {
  variant: ProductVariant;
  productId: string;
  disabled: boolean;
  showMrp: boolean;
  hideThumbnail?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const queryClient = useQueryClient();
  const { runAction: runSaveAction, isPending: savePending } = useAdminAction();
  const [priceStr, setPriceStr] = useState(moneyInputValue(variant.price));
  const [mrpStr, setMrpStr] = useState(moneyInputValue(variant.mrp));

  useEffect(() => {
    setPriceStr(moneyInputValue(variant.price));
    setMrpStr(moneyInputValue(variant.mrp));
  }, [variant.id, variant.price, variant.mrp]);

  const stock = variant.central_stock ?? 0;
  const variantLabel = variant.name ?? "Unnamed variant";

  function savePrices() {
    const price = roundMoney2(parseFloat(priceStr));
    const mrp = showMrp ? roundMoney2(parseFloat(mrpStr)) : 0;
    if (!Number.isFinite(price)) return;
    if (showMrp && !Number.isFinite(mrp)) return;
    if (
      price === roundMoney2(Number(variant.price ?? 0)) &&
      mrp === roundMoney2(Number(variant.mrp ?? 0))
    ) {
      return;
    }
    runSaveAction(async () => {
      await updateVariantAction(variant.id, productId, {
        name: variant.name ?? "Unnamed variant",
        price,
        mrp,
      });
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.productDetail(productId),
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    });
  }

  return (
    <TableRow>
      {!hideThumbnail ? (
        <TableCell>
          <VariantThumbnail variant={variant} onClick={onEdit} />
        </TableCell>
      ) : null}
      <TableCell className="font-medium">{variantLabel}</TableCell>
      <TableCell>
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {formatSku(variant.id)}
        </code>
      </TableCell>
      <TableCell className="tabular-nums">{stock.toLocaleString("en-IN")}</TableCell>
      <TableCell>
        <Input
          className="h-7 w-24 tabular-nums"
          type="number"
          min={0}
          step="0.01"
          value={priceStr}
          onChange={(e) => setPriceStr(e.target.value)}
          onBlur={savePrices}
          disabled={disabled || savePending}
          aria-label={`Selling price for ${variantLabel}`}
        />
      </TableCell>
      {showMrp ? (
        <TableCell>
          <Input
            className="h-7 w-24 tabular-nums"
            type="number"
            min={0}
            step="0.01"
            value={mrpStr}
            onChange={(e) => setMrpStr(e.target.value)}
            onBlur={savePrices}
            disabled={disabled || savePending}
            aria-label={`MRP for ${variantLabel}`}
          />
        </TableCell>
      ) : null}
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={onEdit}
            aria-label={`Edit ${variantLabel}`}
          >
            <Pencil />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={disabled}
            onClick={onDelete}
            aria-label={`Delete ${variantLabel}`}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function buildVariantTableSections(
  groups: VariantGroup[],
  variants: ProductVariant[],
): Array<{ key: string; title: string | null; variants: ProductVariant[] }> {
  if (groups.length === 0) {
    return [{ key: "__all", title: null, variants }];
  }

  const sorted = [...groups].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const groupIds = new Set(sorted.map((g) => g.id));
  const sections = sorted
    .map((g) => ({
      key: g.id,
      title: (g.name ?? "").trim() || "Unnamed",
      variants: variants.filter((v) => v.variant_group_id === g.id),
    }))
    .filter((s) => s.variants.length > 0);

  const ungrouped = variants.filter(
    (v) => !v.variant_group_id || !groupIds.has(v.variant_group_id),
  );
  if (ungrouped.length > 0) {
    if (sections.length > 0) {
      sections[0] = {
        ...sections[0]!,
        variants: [...sections[0]!.variants, ...ungrouped],
      };
    } else {
      sections.push({
        key: "__ungrouped",
        title: "Models",
        variants: ungrouped,
      });
    }
  }

  return sections.length > 0 ? sections : [{ key: "__all", title: null, variants }];
}

export function ProductDetailPanel({
  product,
  variants,
  variantGroups = [],
  categories,
  brands,
  pricingRule,
  glance,
}: {
  product: ProductWithCategory;
  variants: ProductVariant[];
  variantGroups?: VariantGroup[];
  categories: Category[];
  brands: Brand[];
  pricingRule: PricingRuleRow | null;
  glance: ProductAtGlanceMetrics;
}) {
  const queryClient = useQueryClient();
  const { settings } = useCurrencySettings();
  const showMrp = settings.show_mrp;
  const { runAction, isPending } = useAdminAction();
  const [manageOpen, setManageOpen] = useState(false);
  const [manageInitialStep, setManageInitialStep] = useState<"details" | "variants">("details");
  const [manageInitialVariantId, setManageInitialVariantId] = useState<string | null | undefined>(
    undefined,
  );

  const isGroupedProduct =
    product.variant_layout === "grouped" || variantGroups.length > 0;

  function openManageModal(
    step: "details" | "variants" = "details",
    variantId?: string | null,
  ) {
    setManageInitialStep(step);
    if (step === "variants") {
      setManageInitialVariantId(variantId ?? null);
    } else {
      setManageInitialVariantId(undefined);
    }
    setManageOpen(true);
  }

  function handleAddVariant() {
    openManageModal("variants");
  }

  const variantTableSections = useMemo(
    () =>
      isGroupedProduct
        ? buildVariantTableSections(variantGroups, variants)
        : [{ key: "__all", title: null, variants }],
    [isGroupedProduct, variantGroups, variants],
  );

  const variantTableColCount =
    (isGroupedProduct ? 0 : 1) + 4 + (showMrp ? 1 : 0) + 1;

  function handleDelete(variantId: string) {
    if (!confirm("Delete this variant? This cannot be undone.")) return;
    runAction(async () => {
      await deleteVariantAction(variantId, product.id);
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.productDetail(product.id),
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    }, { errorTitle: "Couldn't delete variant" });
  }

  function handleToggle() {
    runAction(async () => {
      await toggleProductAction(product.id, !product.is_active);
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.productDetail(product.id),
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    });
  }

  const isActive = product.is_active ?? false;
  const shortId = product.id.slice(0, 8).toUpperCase();
  const smartPricingOn = product.use_smart_pricing === true;

  const listPriceValue =
    glance.listPriceMin == null ? (
      "—"
    ) : glance.listPriceMax != null &&
      Math.abs(glance.listPriceMax - glance.listPriceMin) > 0.005 ? (
      <span className="block leading-tight">
        <span>{formatInr(glance.listPriceMin)}</span>
        <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
          to {formatInr(glance.listPriceMax)}
        </span>
      </span>
    ) : (
      formatInr(glance.listPriceMin)
    );

  const catalogMode = getProductCatalogMode(product, variants, variantGroups);
  const isSimpleProduct = catalogMode === "simple";

  const listPriceDescription =
    glance.listPriceMin != null
      ? variants.length > 0
        ? `${glance.variantsInStock}/${variants.length} SKUs in stock`
        : glance.centralStockTotal > 0
          ? "Simple product — online stock available"
          : "Simple product — allocate store → online stock to sell"
      : variants.length === 0
        ? "Set a selling price on the product"
        : "No central stock — not sellable";

  const suggestedDescription =
    smartPricingOn && glance.suggestedPriceMin != null
      ? `Suggested ${formatInr(glance.suggestedPriceMin)}${
          glance.suggestedPriceMax != null &&
          Math.abs(glance.suggestedPriceMax - glance.suggestedPriceMin) > 0.005
            ? ` – ${formatInr(glance.suggestedPriceMax)}`
            : ""
        }`
      : undefined;

  return (
    <>
      <AnimatePresence>
        {manageOpen ? (
          <ProductManageModal
            key={`edit-${product.id}-${manageInitialStep}-${manageInitialVariantId ?? "none"}`}
            mode="edit"
            product={product}
            categories={categories}
            brands={brands}
            initialStepId={manageInitialStep}
            initialVariantId={manageInitialVariantId}
            onClose={() => {
              setManageOpen(false);
              void queryClient.invalidateQueries({
                queryKey: adminQueryKeys.productDetail(product.id),
              });
            }}
          />
        ) : null}
      </AnimatePresence>

      <div className="flex flex-col gap-3">
        <Card className="border border-border ring-0">
          <CardContent className="flex flex-col gap-3 py-3 lg:flex-row lg:items-start">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-border">
              <ProductHeroImage url={product.image_url} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {isActive ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-200 bg-emerald-50 text-emerald-700"
                  >
                    Active
                  </Badge>
                ) : (
                  <Badge variant="secondary">Inactive</Badge>
                )}
                {product.categories?.name ? (
                  <Badge variant="outline">{product.categories.name}</Badge>
                ) : null}
                {product.brands?.name ? (
                  <Badge variant="outline">{product.brands.name}</Badge>
                ) : null}
              </div>
              <h1 className="mt-2 text-2xl font-semibold">
                {product.name ?? "Untitled product"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {product.description?.trim() || "No description yet."}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">ID · {shortId}…</p>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button variant="outline" disabled={isPending} onClick={handleToggle}>
                {isActive ? "Deactivate" : "Activate"}
              </Button>
              <Button variant="outline" onClick={() => openManageModal("details")}>
                <Pencil data-icon="inline-start" />
                Edit product
              </Button>
              <Button onClick={handleAddVariant}>
                <Plus data-icon="inline-start" />
                Add variant
              </Button>
            </div>
          </CardContent>
        </Card>

        <section aria-label="Product summary">
          <p className="mb-3 text-sm font-medium">At a glance</p>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <GlanceMetricCard
              title="Variants"
              value={variants.length.toLocaleString("en-IN")}
              description={
                variants.length > 0
                  ? `${variants.length} SKU${variants.length !== 1 ? "s" : ""} configured`
                  : catalogMode === "erp-only"
                    ? "Optional — skip for ERP-only items"
                    : "Simple product — price on item"
              }
            />
            <GlanceMetricCard
              title={currencyLabel("List price")}
              value={listPriceValue}
              description={
                suggestedDescription ? (
                  <>
                    {listPriceDescription}
                    <span className="block">{suggestedDescription}</span>
                  </>
                ) : (
                  listPriceDescription
                )
              }
            />
            <GlanceMetricCard
              title="Central inventory"
              value={glance.centralStockTotal.toLocaleString("en-IN")}
              description={
                glance.centralStockTotal > 0
                  ? "Units in central warehouse"
                  : "No central stock on hand"
              }
            />
            <GlanceMetricCard
              title="Vendor supply"
              value={glance.vendorCount.toLocaleString("en-IN")}
              description={
                glance.vendorCount > 0
                  ? `${glance.vendorStockTotal.toLocaleString("en-IN")} units across vendor listings`
                  : "No vendors listing this product"
              }
            />
          </div>
        </section>

        <ProductSpecsSection productId={product.id} initialSpecs={product.specs} />

        <ProductSkuCatalogCard
          product={product}
          variants={variants}
          variantGroups={variantGroups}
          onAddVariant={handleAddVariant}
          onEditVariants={() => openManageModal("variants")}
          onUpgraded={() => {
            void queryClient.invalidateQueries({
              queryKey: adminQueryKeys.productDetail(product.id),
            });
          }}
        />

        <Card className="border border-border ring-0">
          <CardHeader className="border-b border-border">
            <CardTitle>Variants</CardTitle>
            <CardDescription>
              {variants.length} SKU{variants.length !== 1 ? "s" : ""}.
              {isGroupedProduct
                ? " Media is managed at product level — edit models inline or open Edit product for groups."
                : " Edit prices inline or open a variant to change details and images."}
            </CardDescription>
            <CardAction>
              <Button variant="outline" size="sm" onClick={handleAddVariant}>
                <Plus data-icon="inline-start" />
                Add variant
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {variants.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 py-8 text-center">
                <Package className="text-muted-foreground" aria-hidden />
                <p className="max-w-sm text-sm text-muted-foreground">
                  {catalogMode === "erp-only"
                    ? "No SKUs yet. Set a selling price for a simple product, or add SKUs for multiple options."
                    : "No SKUs yet. Online allocation will create a default SKU automatically, or add one here."}
                </p>
                <Button onClick={handleAddVariant}>
                  <Plus data-icon="inline-start" />
                  Add variant
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {!isGroupedProduct ? (
                      <TableHead className="w-14">Thumbnail</TableHead>
                    ) : null}
                    <TableHead>Variant</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>{currencyLabel("Selling")}</TableHead>
                    {showMrp ? <TableHead>{currencyLabel("MRP")}</TableHead> : null}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {variantTableSections.map((section) => (
                    <Fragment key={section.key}>
                      {isGroupedProduct && section.title ? (
                        <TableRow
                          key={`heading-${section.key}`}
                          className="bg-muted/50 hover:bg-muted/50"
                        >
                          <TableCell
                            colSpan={variantTableColCount}
                            className="py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"
                          >
                            {section.title}
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {section.variants.map((v) => (
                        <VariantTableRow
                          key={v.id}
                          variant={v}
                          productId={product.id}
                          disabled={isPending}
                          showMrp={showMrp}
                          hideThumbnail={isGroupedProduct}
                          onEdit={() => openManageModal("variants", v.id)}
                          onDelete={() => handleDelete(v.id)}
                        />
                      ))}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <ProductPricingSection
          productId={product.id}
          initialRule={pricingRule}
          useSmartPricing={smartPricingOn}
        />
      </div>
    </>
  );
}
