"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ComponentType, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Layers,
  Loader2,
  Package,
  Plus,
  Trash2,
} from "lucide-react";

import type { Brand, Category, ProductImage, ProductVariant, ProductVideo, ProductWithCategory, VariantGroup } from "@/common/admin/types";
import type { ItemUnit } from "@/common/erp/types";
import { formatCategoryOptionLabel } from "@/modules/products/lib/categories.utils";
import { AdminFormSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { formatActionError } from "@/modules/admin/lib/format-action-error";
import {
  formatNumberInputValue,
  parseNumberInputValue,
  coalesceNumber,
} from "@/lib/numeric-input";
import { useAdminAction } from "@/modules/admin/hooks/use-admin-action";
import {
  createProductAction,
  ensureDefaultProductVariantAction,
  updateProductAction,
} from "@/modules/products/actions/products.actions";
import {
  createVariantAction,
  createVariantGroupAction,
  saveGroupedVariantsAction,
  updateVariantAction,
  deleteVariantAction,
} from "@/modules/products/actions/variants.actions";
import { Button } from "@/components/ui/button";
import {
  Modal,
  FormError,
  PrimaryBtn,
  SecondaryBtn,
} from "@/modules/admin/components/modal";
import { VariantImagesField } from "@/modules/products/components/variant-images-field";
import { VariantImagesManager } from "@/modules/products/components/variant-images-manager";
import { ProductMediaField } from "@/modules/products/components/product-media-field";
import {
  GroupVariantsStep,
  emptyGroupDraft,
  emptyGroupSkuRow,
  isGroupDraftsValid,
  type GroupDraft,
} from "@/modules/products/components/group-variants-step";
import { adminGet, adminGetNullable } from "@/modules/admin/lib/admin-api-client";
import { invalidateAdminProductCatalogQueries } from "@/modules/erp/lib/erp-product-live-search.client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { cn } from "@/lib/utils";
import { RequiredFieldMark, showRequiredMark } from "@/lib/required-field-label";
import { currencyLabel, formatInr } from "@/lib/format-currency";
import { useCurrencySettings } from "@/modules/settings/providers/currency-settings-provider";
import { isDefaultSkuName } from "@/modules/products/lib/product-sku-catalog";

const BRAND = "#2563EB";

// Removed StepId

type ProductDetailPayload = {
  product: ProductWithCategory;
  variants: ProductVariant[];
  variant_groups?: VariantGroup[];
  product_images?: ProductImage[];
  product_videos?: ProductVideo[];
};

type ProductDraft = {
  name: string;
  description: string;
  categoryId: string | null;
  brandId: string | null;
  itemType: "goods" | "service";
  hsnSac: string;
  barcode: string;
  productCode: string;
  unitId: string | null;
  purchasePrice: number;
  taxRatePercent: number;
  markupPercent: number;
  defaultPrice: number;
  defaultMrp: number;
  imageUrls: string[];
  imagePreviewIndex: number;
  videoUrls: string[];
};

type SkuTab = "groups" | "variants";

type VariantDraft = {
  localId: string;
  name: string;
  price: number;
  mrp: number;
  stock: number;
  imageUrls: string[];
  previewIndex: number;
};

const DEFAULT_SKU_NAME = "Default";
const EDIT_VARIANT_FORM_ID = "edit-variant-form";
const NEW_VARIANT_FORM_ID = "new-variant-form";

/** Shared height for the two detail-step panels. */
const compactInputCls =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-900 outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 disabled:opacity-50";

const compactSelectCls = `${compactInputCls} cursor-pointer`;

const compactTextareaCls =
  "min-h-[52px] w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] text-slate-900 outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 disabled:opacity-50";

function CompactField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  const showRequired = showRequiredMark(required, children);

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
        {label}
        {showRequired ? <RequiredFieldMark /> : null}
      </span>
      {children}
    </label>
  );
}

function DetailsSection({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm",
        className,
      )}
    >
      <div className="mb-2.5">
        <h2 className="text-[13px] font-bold text-slate-900">{title}</h2>
        {hint ? <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function emptyProductDraft(product?: ProductWithCategory): ProductDraft {
  return {
    name: product?.name ?? "",
    description: product?.description ?? "",
    categoryId: product?.category_id ?? null,
    brandId: product?.brand_id ?? null,
    itemType: product?.item_type ?? "goods",
    hsnSac: product?.hsn_sac ?? "",
    barcode: "",
    productCode: "",
    unitId: null,
    purchasePrice: 0,
    taxRatePercent: 0,
    markupPercent: 0,
    defaultPrice: 0,
    defaultMrp: 0,
    imageUrls: product?.image_url ? [product.image_url] : [],
    imagePreviewIndex: 0,
    videoUrls: [],
  };
}

function productDraftFromProduct(product: ProductWithCategory): ProductDraft {
  return {
    name: product.name ?? "",
    description: product.description ?? "",
    categoryId: product.category_id ?? null,
    brandId: product.brand_id ?? null,
    itemType: product.item_type ?? "goods",
    hsnSac: product.hsn_sac ?? "",
    barcode: "",
    productCode: "",
    unitId: null,
    purchasePrice: 0,
    taxRatePercent: 0,
    markupPercent: 0,
    defaultPrice: 0,
    defaultMrp: 0,
    imageUrls: product.image_url ? [product.image_url] : [],
    imagePreviewIndex: 0,
    videoUrls: [],
  };
}

function defaultPricingFromVariants(variants: ProductVariant[]): {
  price: number;
  mrp: number;
} {
  const prices = variants
    .map((v) => Number(v.price))
    .filter((p) => Number.isFinite(p) && p > 0);
  const mrps = variants
    .map((v) => Number(v.mrp))
    .filter((m) => Number.isFinite(m) && m >= 0);

  return {
    price: prices.length > 0 ? roundMoney2(Math.min(...prices)) : 0,
    mrp: mrps.length > 0 ? roundMoney2(Math.min(...mrps)) : 0,
  };
}

function productDraftFromDetail(
  product: ProductWithCategory,
  images: ProductImage[],
  videos: ProductVideo[],
  variants: ProductVariant[],
): ProductDraft {
  const sortedImages = [...images].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const imageUrls = sortedImages.map((i) => i.url).filter(Boolean);
  const previewIdx = sortedImages.findIndex((i) => i.is_preview);
  const sortedVideos = [...videos].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const { price: defaultPrice, mrp: defaultMrp } =
    variants.length > 0
      ? defaultPricingFromVariants(variants)
      : {
          price: Number(product.price) || 0,
          mrp: Number(product.mrp) || 0,
        };
  const primaryVariant = variants[0];

  return {
    name: product.name ?? "",
    description: product.description ?? "",
    categoryId: product.category_id ?? null,
    brandId: product.brand_id ?? null,
    itemType: product.item_type ?? "goods",
    hsnSac: product.hsn_sac ?? "",
    barcode: primaryVariant?.barcode ?? product.barcode ?? "",
    productCode: primaryVariant?.product_code ?? "",
    unitId: primaryVariant?.unit_id ?? null,
    purchasePrice:
      Number(primaryVariant?.purchase_price) ||
      Number(product.purchase_price) ||
      0,
    taxRatePercent:
      Number(primaryVariant?.tax_rate_percent) ||
      Number(product.tax_rate_percent) ||
      0,
    markupPercent: Number(primaryVariant?.markup_percent) || 0,
    defaultPrice,
    defaultMrp,
    imageUrls:
      imageUrls.length > 0
        ? imageUrls
        : product.image_url
          ? [product.image_url]
          : [],
    imagePreviewIndex: previewIdx >= 0 ? previewIdx : 0,
    videoUrls: sortedVideos.map((v) => v.url).filter(Boolean),
  };
}

function variantRowFromApi(v: ProductVariant): GroupDraft["rows"][number] {
  return {
    localId: v.id,
    variantId: v.id,
    name: v.name ?? "",
    price: Number(v.price) || 0,
    mrp: Number(v.mrp) || 0,
    stock: v.central_stock ?? 0,
  };
}

function groupDraftsFromApi(
  groups: VariantGroup[],
  variants: ProductVariant[],
): GroupDraft[] {
  const sorted = [...groups].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  if (sorted.length === 0 && variants.length > 0) {
    return [
      {
        localId: newLocalId(),
        name: "Models",
        rows: variants.map((v) => variantRowFromApi(v)),
      },
    ];
  }

  const groupIds = new Set(sorted.map((g) => g.id));
  const sections: GroupDraft[] = sorted.map((g) => {
    const rows = variants
      .filter((v) => v.variant_group_id === g.id)
      .map((v) => variantRowFromApi(v));
    return {
      localId: g.id,
      name: g.name ?? "",
      rows: rows.length > 0 ? rows : [emptyGroupSkuRow()],
    };
  });

  const ungrouped = variants.filter(
    (v) => !v.variant_group_id || !groupIds.has(v.variant_group_id),
  );
  if (ungrouped.length > 0) {
    if (sections.length > 0) {
      sections[0] = {
        ...sections[0]!,
        rows: [...sections[0]!.rows, ...ungrouped.map((v) => variantRowFromApi(v))],
      };
    } else {
      sections.push({
        localId: newLocalId(),
        name: "Models",
        rows: ungrouped.map((v) => variantRowFromApi(v)),
      });
    }
  }

  return sections;
}

function variantDraftsFromApi(variants: ProductVariant[]): VariantDraft[] {
  return variants.map((v) => {
    const images = v.images ?? [];
    const previewIdx = images.findIndex((img) => img.is_preview);
    return {
      localId: v.id,
      name: v.name ?? "",
      price: Number(v.price) || 0,
      mrp: Number(v.mrp) || 0,
      stock: v.central_stock ?? 0,
      imageUrls: images.map((img) => img.url).filter(Boolean),
      previewIndex: previewIdx >= 0 ? previewIdx : 0,
    };
  });
}

function catalogImageFromProductDraft(draft: ProductDraft): string | null {
  const url = orderedImages(draft.imageUrls, draft.imagePreviewIndex)[0];
  return url ?? null;
}

function emptyVariantDraft(name = DEFAULT_SKU_NAME): VariantDraft {
  return {
    localId: newLocalId(),
    name,
    price: 0,
    mrp: 0,
    stock: 0,
    imageUrls: [],
    previewIndex: 0,
  };
}


function applyGroupDefaults(groups: GroupDraft[], draft: ProductDraft): GroupDraft[] {
  return groups.map((g) => ({
    ...g,
    rows: g.rows.map((r) => ({
      ...r,
      price: r.price > 0 ? r.price : draft.defaultPrice,
      mrp: r.mrp > 0 ? r.mrp : draft.defaultMrp,
    })),
  }));
}

function applyVariantDefaults(drafts: VariantDraft[], draft: ProductDraft): VariantDraft[] {
  return drafts.map((v) => ({
    ...v,
    price: v.price > 0 ? v.price : draft.defaultPrice,
    mrp: v.mrp > 0 ? v.mrp : draft.defaultMrp,
  }));
}

function catalogImageFromVariants(drafts: VariantDraft[]): string | null {
  for (const draft of drafts) {
    const url = orderedImages(draft.imageUrls, draft.previewIndex)[0];
    if (url) return url;
  }
  return null;
}

function catalogImageFromVariantRows(variants: ProductVariant[]): string | null {
  for (const variant of variants) {
    const url = variant.images?.[0]?.url;
    if (url) return url;
  }
  return null;
}


function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

function moneyInputValue(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "";
  return roundMoney2(Number(n)).toFixed(2);
}

function newLocalId() {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function orderedImages(images: string[], previewIndex: number) {
  if (previewIndex > 0 && previewIndex < images.length) {
    return [images[previewIndex], ...images.filter((_, i) => i !== previewIndex)];
  }
  return images;
}

function cloneProductDraft(draft: ProductDraft): ProductDraft {
  return {
    ...draft,
    imageUrls: [...draft.imageUrls],
    videoUrls: [...draft.videoUrls],
  };
}

function productDraftsEqual(a: ProductDraft, b: ProductDraft): boolean {
  return (
    a.name.trim() === b.name.trim() &&
    a.description.trim() === b.description.trim() &&
    a.categoryId === b.categoryId &&
    a.brandId === b.brandId &&
    a.itemType === b.itemType &&
    a.hsnSac.trim() === b.hsnSac.trim() &&
    a.barcode.trim() === b.barcode.trim() &&
    a.productCode.trim() === b.productCode.trim() &&
    a.unitId === b.unitId &&
    roundMoney2(a.purchasePrice) === roundMoney2(b.purchasePrice) &&
    roundMoney2(a.taxRatePercent) === roundMoney2(b.taxRatePercent) &&
    roundMoney2(a.markupPercent) === roundMoney2(b.markupPercent) &&
    roundMoney2(a.defaultPrice) === roundMoney2(b.defaultPrice) &&
    roundMoney2(a.defaultMrp) === roundMoney2(b.defaultMrp) &&
    a.imagePreviewIndex === b.imagePreviewIndex &&
    a.imageUrls.length === b.imageUrls.length &&
    a.imageUrls.every((url, i) => url === b.imageUrls[i]) &&
    a.videoUrls.length === b.videoUrls.length &&
    a.videoUrls.every((url, i) => url === b.videoUrls[i])
  );
}

function cloneGroupDrafts(groups: GroupDraft[]): GroupDraft[] {
  return groups.map((g) => ({
    ...g,
    rows: g.rows.map((r) => ({ ...r })),
  }));
}

function normalizeGroupDrafts(groups: GroupDraft[]) {
  return groups.map((g) => ({
    localId: g.localId,
    name: g.name.trim(),
    rows: g.rows.map((r) => ({
      variantId: r.variantId ?? null,
      name: r.name.trim(),
      price: roundMoney2(r.price),
      mrp: roundMoney2(r.mrp),
      stock: Math.max(0, Math.floor(r.stock)),
    })),
  }));
}

function groupDraftsEqual(a: GroupDraft[], b: GroupDraft[]): boolean {
  return (
    JSON.stringify(normalizeGroupDrafts(a)) === JSON.stringify(normalizeGroupDrafts(b))
  );
}

async function syncProductCatalogImage(
  queryClient: ReturnType<typeof useQueryClient>,
  productId: string,
) {
  const detail = await adminGetNullable<ProductDetailPayload>(`products/${productId}`);
  if (!detail?.product) return;
  await updateProductAction(productId, {
    name: detail.product.name ?? "",
    description: detail.product.description ?? "",
    categoryId: detail.product.category_id,
    brandId: detail.product.brand_id,
    imageUrl: catalogImageFromVariantRows(detail.variants ?? []),
    itemType: detail.product.item_type ?? "goods",
    hsnSac: detail.product.hsn_sac ?? null,
  });
  await invalidateAdminProductCatalogQueries(queryClient);
}

// Removed old wizard components

function VariantThumb({ url }: { url: string | null }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) {
    return (
      <div className="flex size-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-50 text-slate-300">
        <Package strokeWidth={1.5} className="size-5" aria-hidden />
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

/* ── Variant split layout (list left, editor right) ── */

function VariantSplitLayout({
  list,
  panel,
}: {
  list: ReactNode;
  panel: ReactNode;
}) {
  return (
    <div
      className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-2 p-2 sm:gap-3 sm:p-3 min-[1100px]:grid-cols-[minmax(160px,200px)_1fr] min-[1100px]:grid-rows-1 min-[1100px]:gap-4 min-[1100px]:p-4"
    >
      <aside
        className="flex min-h-0 max-h-[min(28vh,160px)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white min-[1100px]:max-h-none"
      >
        {list}
      </aside>
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
        {panel}
      </div>
    </div>
  );
}

function VariantListItem({
  name,
  price,
  mrp,
  thumbUrl,
  selected,
  onClick,
}: {
  name: string;
  price: number;
  mrp: number;
  thumbUrl: string | null;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 border-b border-slate-100 px-3 py-2.5 text-left transition last:border-b-0 ${
        selected
          ? "border-l-2 border-l-[#2563EB] bg-[#2563EB]/[0.05]"
          : "border-l-2 border-l-transparent hover:bg-slate-50"
      }`}
    >
      <div className="relative size-10 shrink-0 overflow-hidden rounded-md border border-slate-200/70 bg-slate-50">
        <VariantThumb url={thumbUrl} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-slate-900">{name || "Unnamed SKU"}</p>
      </div>
    </button>
  );
}

function DraftVariantEditor({
  draft,
  onChange,
  onRemove,
  canRemove,
}: {
  draft: VariantDraft;
  onChange: (next: VariantDraft) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { settings } = useCurrencySettings();
  const showMrp = settings.show_mrp;
  const preview = draft.imageUrls[draft.previewIndex] ?? draft.imageUrls[0] ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-900">Edit SKU</p>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          title={canRemove ? "Remove SKU" : "Cannot remove"}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-100 bg-rose-50/80 px-2.5 text-[11px] font-bold text-rose-500 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="size-3" />
          Remove
        </button>
      </div>

      <div className="flex gap-3">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-slate-200/70 bg-slate-50">
          <VariantThumb url={preview} />
        </div>
          <div className="min-w-0 flex-1 space-y-2">
            <CompactField label="Variant name">
              <input
                className={compactInputCls}
                value={draft.name}
                onChange={(e) => onChange({ ...draft, name: e.target.value })}
                placeholder="e.g. 128 GB, Red / Large"
              />
            </CompactField>
          </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-lg border border-slate-100 bg-slate-50/40 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
          SKU images
        </p>
        <VariantImagesField
          images={draft.imageUrls}
          previewIndex={draft.previewIndex}
          onChange={(images, previewIndex) =>
            onChange({ ...draft, imageUrls: images, previewIndex })
          }
          compact
        />
      </div>
    </div>
  );
}

function DraftVariantCreatePanel({
  onAdd,
}: {
  onAdd: (draft: VariantDraft) => void;
}) {
  const { settings } = useCurrencySettings();
  const showMrp = settings.show_mrp;
  const [draft, setDraft] = useState<VariantDraft>(() => emptyVariantDraft(""));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4">
      <p className="mb-3 text-xs font-bold text-slate-900">New SKU</p>
      <div className="space-y-2">
        <CompactField label="Variant name">
          <input
            className={compactInputCls}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="e.g. 128 GB, Red / Large"
          />
        </CompactField>
      </div>

      <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50/40 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
          SKU images
        </p>
        <VariantImagesField
          images={draft.imageUrls}
          previewIndex={draft.previewIndex}
          onChange={(images, previewIndex) =>
            setDraft({ ...draft, imageUrls: images, previewIndex })
          }
          compact
        />
      </div>

      <div className="mt-4 flex justify-end">
        <PrimaryBtn
          onClick={() => {
            if (!draft.name.trim()) return;
            onAdd({ ...draft, localId: newLocalId() });
            setDraft(emptyVariantDraft(""));
          }}
          disabled={!draft.name.trim()}
        >
          Add SKU
        </PrimaryBtn>
      </div>
    </div>
  );
}

function CreateVariantsStep({
  drafts,
  onChange,
}: {
  drafts: VariantDraft[];
  onChange: (next: VariantDraft[]) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(() => drafts[0]?.localId ?? null);

  useEffect(() => {
    if (selectedId && !drafts.some((d) => d.localId === selectedId)) {
      setSelectedId(drafts[0]?.localId ?? null);
    }
  }, [drafts, selectedId]);

  const selected = drafts.find((d) => d.localId === selectedId);

  function handleAdd(draft: VariantDraft) {
    onChange([...drafts, draft]);
    setSelectedId(draft.localId);
  }

  function handleRemove(localId: string) {
    const next = drafts.filter((d) => d.localId !== localId);
    onChange(next);
    setSelectedId(next[0]?.localId ?? null);
  }

  return (
    <VariantSplitLayout
      list={
        <>
          <div className="shrink-0 border-b border-slate-100 p-2">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                selectedId === null
                  ? "border-[#2563EB] bg-[#2563EB]/10 text-[#2563EB]"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <Plus className="size-3.5" />
              New SKU
            </button>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {drafts.map((d) => (
              <li key={d.localId}>
                <VariantListItem
                  name={d.name}
                  price={d.price}
                  mrp={d.mrp}
                  thumbUrl={d.imageUrls[d.previewIndex] ?? d.imageUrls[0] ?? null}
                  selected={selectedId === d.localId}
                  onClick={() => setSelectedId(d.localId)}
                />
              </li>
            ))}
          </ul>
        </>
      }
      panel={
        selected ? (
          <DraftVariantEditor
            draft={selected}
            onChange={(next) =>
              onChange(drafts.map((d) => (d.localId === selected.localId ? next : d)))
            }
            onRemove={() => handleRemove(selected.localId)}
            canRemove={drafts.length > 0}
          />
        ) : (
          <DraftVariantCreatePanel onAdd={handleAdd} />
        )
      }
    />
  );
}

// Removed ReviewStep

function VariantSetupSelection({ onSelect }: { onSelect: (layout: "none" | "flat" | "grouped") => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto overscroll-contain p-3 sm:p-5 bg-slate-50/30">
      <div className="mx-auto w-full max-w-2xl space-y-4 text-center sm:space-y-5">
        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-slate-900 sm:text-xl">Organize SKUs & Inventory</h3>
          <p className="mx-auto max-w-md text-xs text-slate-500 sm:text-sm">
            Does this product have options like size, color, or different models? Choose how you want to manage them.
          </p>
        </div>
        <div className="grid gap-2.5 pt-2 text-left sm:grid-cols-3 sm:gap-3 sm:pt-3">
          <button
            type="button"
            onClick={() => onSelect("none")}
            className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-400 hover:ring-1 hover:ring-slate-400 sm:gap-3 sm:rounded-2xl sm:p-4"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-slate-100">
              <Package className="size-5 text-slate-600" />
            </div>
            <div>
              <span className="block font-bold text-slate-900 mb-1">No Variants</span>
              <span className="block text-xs leading-relaxed text-slate-500">
                Just a simple product. We'll track inventory on the main item.
              </span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => onSelect("flat")}
            className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-[#2563EB] hover:ring-1 hover:ring-[#2563EB] sm:gap-3 sm:rounded-2xl sm:p-4"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-blue-50">
              <Layers className="size-5 text-[#2563EB]" />
            </div>
            <div>
              <span className="block font-bold text-slate-900 mb-1">Standard Variants</span>
              <span className="block text-xs leading-relaxed text-slate-500">
                A simple list of SKUs for this product. Best for fewer options and fast entry.
              </span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => onSelect("grouped")}
            className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-[#2563EB] hover:ring-1 hover:ring-[#2563EB] sm:gap-3 sm:rounded-2xl sm:p-4"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-indigo-50">
              <Layers className="size-5 text-indigo-600" />
            </div>
            <div>
              <span className="block font-bold text-slate-900 mb-1">Variant Groups</span>
              <span className="block text-xs leading-relaxed text-slate-500">
                Organize SKUs into categorized groups. Best for complex catalogs and storefront bulk selection.
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveVariantEditor({
  productId,
  variant,
  canDelete,
  hideImages = false,
  onCatalogSync,
  onDeleted,
}: {
  productId: string;
  variant: ProductVariant;
  canDelete: boolean;
  hideImages?: boolean;
  onCatalogSync?: () => Promise<void>;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const { settings } = useCurrencySettings();
  const showMrp = settings.show_mrp;
  const { runAction: runDeleteAction, isPending: deletePending } = useAdminAction();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const images = variant.images ?? [];
  const preview = hideImages ? null : images[0]?.url ?? null;

  function handleDelete() {
    if (!canDelete) return;
    if (!confirm(`Delete variant "${variant.name ?? "variant"}"?`)) return;
    runDeleteAction(async () => {
      await deleteVariantAction(variant.id, productId);
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.productDetail(productId),
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      await onCatalogSync?.();
      onDeleted?.();
    }, { errorTitle: "Couldn't delete variant" });
  }

  function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    if (!name) {
      return setError("Name is required.");
    }
    setError(null);
    startTransition(async () => {
      try {
        await updateVariantAction(variant.id, productId, { 
          name, 
          price: Number(variant.price) || 0, 
          mrp: Number(variant.mrp) || 0 
        });
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.productDetail(productId),
        });
        await queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
        await onCatalogSync?.();
      } catch (err) {
        setError(formatActionError(err));
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4">
      <form id={EDIT_VARIANT_FORM_ID} onSubmit={handleUpdate} className="flex flex-col">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-slate-900">Edit SKU</p>
          <button
            type="button"
            disabled={isPending || deletePending || !canDelete}
            onClick={handleDelete}
            title={canDelete ? "Remove SKU" : "At least one SKU required"}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-100 bg-rose-50/80 px-2.5 text-[11px] font-bold text-rose-500 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="size-3" />
            Remove
          </button>
        </div>

        <div className="flex gap-3">
          {!hideImages ? (
            <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-slate-200/70 bg-slate-50">
              <VariantThumb url={preview} />
            </div>
          ) : null}
          <div className="min-w-0 flex-1 space-y-2">
            <CompactField label="Variant name">
              <input
                className={compactInputCls}
                name="name"
                defaultValue={variant.name ?? ""}
                required
              />
            </CompactField>
          </div>
        </div>

        <FormError message={error} />
      </form>

      {!hideImages ? (
      <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-lg border border-slate-100 bg-slate-50/40 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
          SKU images
        </p>
        <VariantImagesManager
          productId={productId}
          variant={variant}
          onClose={() => {}}
          embedded
          compact
        />
      </div>
      ) : null}
    </div>
  );
}

function NewVariantPanel({
  productId,
  hideImages = false,
  defaultPrice = 0,
  defaultMrp = 0,
  onCreated,
  onCatalogSync,
}: {
  productId: string;
  hideImages?: boolean;
  defaultPrice?: number;
  defaultMrp?: number;
  onCreated?: () => void;
  onCatalogSync?: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const { settings } = useCurrencySettings();
  const showMrp = settings.show_mrp;
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [imageUploading, setImageUploading] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    if (!name) {
      return setError("Name is required.");
    }
    setError(null);
    startTransition(async () => {
      try {
        await createVariantAction(productId, {
          name,
          price: defaultPrice || 0,
          mrp: defaultMrp || 0,
          imageUrls: hideImages ? [] : orderedImages(images, previewIndex),
        });
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.productDetail(productId),
        });
        await queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
        await onCatalogSync?.();
        formRef.current?.reset();
        setImages([]);
        setPreviewIndex(0);
        onCreated?.();
      } catch (err) {
        setError(formatActionError(err));
      }
    });
  }

  return (
    <form
      ref={formRef}
      id={NEW_VARIANT_FORM_ID}
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-900">New SKU</p>
        <button
          type="submit"
          disabled={isPending || imageUploading}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg bg-[#2563EB] px-3 text-xs font-bold text-white transition hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {imageUploading ? "Uploading…" : isPending ? "Adding…" : "Add SKU"}
        </button>
      </div>
      <div className="space-y-2">
        <CompactField label="Variant name">
          <input className={compactInputCls} name="name" placeholder="e.g. 128 GB / Black" required />
        </CompactField>
      </div>

      {!hideImages ? (
      <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50/40 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
          SKU images
        </p>
        <VariantImagesField
          images={images}
          previewIndex={previewIndex}
          onChange={(next, preview) => {
            setImages(next);
            setPreviewIndex(preview);
          }}
          onUploadingChange={setImageUploading}
          compact
        />
      </div>
      ) : null}

      <FormError message={error} />
    </form>
  );
}

function resolveInitialVariantSelection(
  variants: ProductVariant[],
  initialSelectedVariantId?: string | null,
): string | null {
  if (initialSelectedVariantId === null) return null;
  if (
    initialSelectedVariantId &&
    variants.some((v) => v.id === initialSelectedVariantId)
  ) {
    return initialSelectedVariantId;
  }
  return variants[0]?.id ?? null;
}

function EditVariantsStep({
  productId,
  productName,
  variants,
  isLoading,
  isGroupedLayout = false,
  defaultPrice = 0,
  defaultMrp = 0,
  initialSelectedVariantId,
  onCatalogSync,
  onFormIdChange,
}: {
  productId: string;
  productName?: string;
  variants: ProductVariant[];
  isLoading: boolean;
  isGroupedLayout?: boolean;
  defaultPrice?: number;
  defaultMrp?: number;
  initialSelectedVariantId?: string | null;
  onCatalogSync?: () => Promise<void>;
  onFormIdChange?: (formId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    resolveInitialVariantSelection(variants, initialSelectedVariantId),
  );

  useEffect(() => {
    if (initialSelectedVariantId === undefined) return;
    setSelectedId(resolveInitialVariantSelection(variants, initialSelectedVariantId));
  }, [initialSelectedVariantId, variants]);

  useEffect(() => {
    if (selectedId && !variants.some((v) => v.id === selectedId)) {
      setSelectedId(variants[0]?.id ?? null);
    }
  }, [variants, selectedId]);

  const selected = variants.find((v) => v.id === selectedId);

  useEffect(() => {
    onFormIdChange?.(selected ? EDIT_VARIANT_FORM_ID : NEW_VARIANT_FORM_ID);
  }, [selected, onFormIdChange]);

  const showSimpleHint =
    !isGroupedLayout &&
    variants.length === 1 &&
    isDefaultSkuName(variants[0]?.name, productName);

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col p-6">
        <AdminFormSkeleton />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {showSimpleHint ? (
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-2.5 text-xs leading-relaxed text-slate-600">
          <strong>Simple product.</strong> This default SKU holds your online stock. Click{" "}
          <strong>New SKU</strong> to add sizes or models, or use <strong>Use variant groups</strong>{" "}
          on the product page to organize SKUs for bulk storefront selection.
        </div>
      ) : null}
      <VariantSplitLayout
      list={
        <>
          <div className="shrink-0 border-b border-slate-100 p-2">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                selectedId === null
                  ? "border-[#2563EB] bg-[#2563EB]/10 text-[#2563EB]"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <Plus className="size-3.5" />
              New SKU
            </button>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {variants.map((v) => {
              const imgs = v.images ?? [];
              return (
                <li key={v.id}>
                  <VariantListItem
                    name={v.name ?? ""}
                    price={v.price ?? 0}
                    mrp={v.mrp ?? 0}
                    thumbUrl={isGroupedLayout ? null : imgs[0]?.url ?? null}
                    selected={selectedId === v.id}
                    onClick={() => setSelectedId(v.id)}
                  />
                </li>
              );
            })}
          </ul>
        </>
      }
      panel={
        selected ? (
          <LiveVariantEditor
            key={selected.id}
            productId={productId}
            variant={selected}
            canDelete={variants.length > 1}
            hideImages={isGroupedLayout}
            onCatalogSync={onCatalogSync}
            onDeleted={() => setSelectedId(null)}
          />
        ) : (
          <NewVariantPanel
            productId={productId}
            hideImages={isGroupedLayout}
            defaultPrice={defaultPrice}
            defaultMrp={defaultMrp}
            onCatalogSync={onCatalogSync}
          />
        )
      }
    />
    </div>
  );
}

// Removed SkuConfigurationStep

function variantErpFieldsFromDraft(draft: ProductDraft) {
  return {
    barcode: draft.barcode.trim() || null,
    productCode: draft.productCode.trim() || null,
    purchasePrice:
      coalesceNumber(draft.purchasePrice) > 0
        ? roundMoney2(coalesceNumber(draft.purchasePrice))
        : null,
    taxRatePercent:
      coalesceNumber(draft.taxRatePercent) > 0
        ? roundMoney2(coalesceNumber(draft.taxRatePercent))
        : null,
    unitId: draft.unitId,
    markupPercent: draft.markupPercent > 0 ? roundMoney2(draft.markupPercent) : null,
  };
}

function DetailsStepForm({
  draft,
  categories,
  brands,
  itemUnits,
  onDraftChange,
  error,
  showMrp,
  isGroupedLayout = false,
}: {
  draft: ProductDraft;
  categories: Category[];
  brands: Brand[];
  itemUnits: ItemUnit[];
  onDraftChange: (next: ProductDraft) => void;
  error: string | null;
  showMrp: boolean;
  isGroupedLayout?: boolean;
}) {
  const pricingHint = isGroupedLayout
    ? "Pre-fills new SKUs you add later."
    : "Applies to the primary item; variants inherit unless overridden.";

  const pricingCols = showMrp
    ? "grid-cols-2 sm:grid-cols-3 min-[1200px]:grid-cols-5"
    : "grid-cols-2 min-[1200px]:grid-cols-4";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50/30 min-[1100px]:flex-row">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5 sm:p-3 min-[1100px]:p-4">
        <div className="flex flex-col gap-2.5 min-[1100px]:gap-3">
          <DetailsSection title="Basic information">
            <div className="grid gap-2.5 sm:grid-cols-2 min-[1200px]:grid-cols-4">
              <div className="sm:col-span-2 min-[1200px]:col-span-2">
                <CompactField label="Name">
                  <input
                    className={compactInputCls}
                    value={draft.name}
                    onChange={(e) => onDraftChange({ ...draft, name: e.target.value })}
                    placeholder="Product name"
                    required
                  />
                </CompactField>
              </div>

              <CompactField label="Category">
                <select
                  className={compactSelectCls}
                  value={draft.categoryId ?? ""}
                  onChange={(e) =>
                    onDraftChange({ ...draft, categoryId: e.target.value || null })
                  }
                >
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatCategoryOptionLabel(c, categories)}
                    </option>
                  ))}
                </select>
              </CompactField>

              <CompactField label="Manufacturer / Brand">
                <select
                  className={compactSelectCls}
                  value={draft.brandId ?? ""}
                  onChange={(e) =>
                    onDraftChange({ ...draft, brandId: e.target.value || null })
                  }
                >
                  <option value="">Select brand</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name ?? "Unnamed"}
                    </option>
                  ))}
                </select>
              </CompactField>

              <div className="sm:col-span-2 min-[1200px]:col-span-4">
                <CompactField label="Description">
                  <textarea
                    className={compactTextareaCls}
                    value={draft.description}
                    onChange={(e) => onDraftChange({ ...draft, description: e.target.value })}
                    rows={2}
                    placeholder="Short product description"
                  />
                </CompactField>
              </div>
            </div>
          </DetailsSection>

          <div className="grid gap-2.5 min-[1100px]:grid-cols-2 min-[1100px]:gap-3">
            <DetailsSection title="Pricing & defaults" hint={pricingHint}>
              <div className={`grid gap-2.5 ${pricingCols}`}>
                <CompactField label={currencyLabel("Sales price")}>
                  <input
                    className={compactInputCls}
                    type="number"
                    step="0.001"
                    min="0.01"
                    value={formatNumberInputValue(draft.defaultPrice)}
                    onChange={(e) =>
                      onDraftChange({
                        ...draft,
                        defaultPrice: parseNumberInputValue(e.target.value),
                      })
                    }
                    placeholder="0.000"
                    required
                  />
                </CompactField>
                {showMrp ? (
                  <CompactField label={currencyLabel("MRP")}>
                    <input
                      className={compactInputCls}
                      type="number"
                      step="0.001"
                      min="0"
                      value={formatNumberInputValue(draft.defaultMrp)}
                      onChange={(e) =>
                        onDraftChange({
                          ...draft,
                          defaultMrp: parseNumberInputValue(e.target.value),
                        })
                      }
                      placeholder="Optional"
                    />
                  </CompactField>
                ) : null}
                <CompactField label="Purchase price">
                  <input
                    className={compactInputCls}
                    type="number"
                    step="0.001"
                    min="0"
                    value={formatNumberInputValue(draft.purchasePrice)}
                    onChange={(e) =>
                      onDraftChange({
                        ...draft,
                        purchasePrice: parseNumberInputValue(e.target.value),
                      })
                    }
                    placeholder="0.000"
                  />
                </CompactField>
                <CompactField label="Tax %">
                  <input
                    className={compactInputCls}
                    type="number"
                    step="0.01"
                    min="0"
                    value={formatNumberInputValue(draft.taxRatePercent)}
                    onChange={(e) =>
                      onDraftChange({
                        ...draft,
                        taxRatePercent: parseNumberInputValue(e.target.value),
                      })
                    }
                    placeholder="e.g. 18"
                  />
                </CompactField>
                <CompactField label="Markup %">
                  <input
                    className={compactInputCls}
                    type="number"
                    step="0.01"
                    min="0"
                    value={formatNumberInputValue(draft.markupPercent)}
                    onChange={(e) =>
                      onDraftChange({
                        ...draft,
                        markupPercent: parseNumberInputValue(e.target.value),
                      })
                    }
                    placeholder="Optional"
                  />
                </CompactField>
              </div>
            </DetailsSection>

            <DetailsSection title="Identification & type">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <CompactField label="Barcode">
                  <input
                    className={compactInputCls}
                    value={draft.barcode}
                    onChange={(e) => onDraftChange({ ...draft, barcode: e.target.value })}
                    placeholder="Scanner barcode"
                  />
                </CompactField>
                <CompactField label="Product code">
                  <input
                    className={compactInputCls}
                    value={draft.productCode}
                    onChange={(e) => onDraftChange({ ...draft, productCode: e.target.value })}
                    placeholder="Internal code / SKU"
                  />
                </CompactField>
                <CompactField label="HSN/SAC">
                  <input
                    className={compactInputCls}
                    value={draft.hsnSac}
                    onChange={(e) => onDraftChange({ ...draft, hsnSac: e.target.value })}
                    placeholder="Tax classification"
                  />
                </CompactField>
                <CompactField label="Unit of measure">
                  <select
                    className={compactSelectCls}
                    value={draft.unitId ?? ""}
                    onChange={(e) =>
                      onDraftChange({ ...draft, unitId: e.target.value || null })
                    }
                  >
                    <option value="">Select unit</option>
                    {itemUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name} ({unit.abbreviation})
                      </option>
                    ))}
                  </select>
                </CompactField>
              </div>

              <div className="mt-2.5 border-t border-slate-100 pt-2.5">
                <CompactField label="Item type">
                  <div className="flex h-9 items-center gap-5">
                    {(["goods", "service"] as const).map((type) => (
                      <label
                        key={type}
                        className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-700"
                      >
                        <input
                          type="radio"
                          name="item-type"
                          checked={draft.itemType === type}
                          onChange={() => onDraftChange({ ...draft, itemType: type })}
                          className="accent-[#2563EB]"
                        />
                        {type === "goods" ? "Physical goods" : "Service"}
                      </label>
                    ))}
                  </div>
                </CompactField>
              </div>
            </DetailsSection>
          </div>

          {error ? (
            <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      <aside
        className="flex min-h-0 w-full shrink-0 flex-col border-t border-slate-200 bg-white max-h-[min(36vh,280px)] min-[1100px]:max-h-none min-[1100px]:w-[min(100%,300px)] min-[1100px]:border-l min-[1100px]:border-t-0"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-2.5 sm:p-3 min-[1100px]:p-4">
          <div className="mb-2.5">
            <h2 className="text-[13px] font-bold text-slate-900">Media</h2>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
              Images and video for this product.
            </p>
          </div>
          <ProductMediaField
            images={draft.imageUrls}
            previewIndex={draft.imagePreviewIndex}
            onImagesChange={(images, previewIndex) =>
              onDraftChange({ ...draft, imageUrls: images, imagePreviewIndex: previewIndex })
            }
            videos={draft.videoUrls}
            onVideosChange={(videoUrls) => onDraftChange({ ...draft, videoUrls })}
          />
        </div>
      </aside>
    </div>
  );
}

export function ProductManageModal({
  mode,
  product,
  categories,
  brands,
  onClose,
  initialStepId = "details",
  initialVariantId,
}: {
  mode: "create" | "edit";
  product?: ProductWithCategory;
  categories: Category[];
  brands: Brand[];
  onClose: () => void;
  initialStepId?: "details" | "variants";
  /** Flat: null opens new SKU panel; string selects that variant. Grouped: string focuses group row. */
  initialVariantId?: string | null;
}) {
  const queryClient = useQueryClient();
  const { settings } = useCurrencySettings();
  const showMrp = settings.show_mrp;
  const [isPending, startTransition] = useTransition();
  const isCreate = mode === "create";

  const [activeTab, setActiveTab] = useState<"details" | "variants">(
    initialStepId === "variants" ? "variants" : "details"
  );
  
  // Track layout intent during creation before variants are actually added.
  const [createVariantLayout, setCreateVariantLayout] = useState<"none" | "flat" | "grouped">("none");

  const [error, setError] = useState<string | null>(null);

  const [productDraft, setProductDraft] = useState<ProductDraft>(() =>
    emptyProductDraft(product),
  );
  const [variantDrafts, setVariantDrafts] = useState<VariantDraft[]>([]);
  const [groupDrafts, setGroupDrafts] = useState<GroupDraft[]>([]);
  
  // Replace skuTab with the active layout concept in edit mode, or intent in create mode.
  const [flatDirty, setFlatDirty] = useState(false);
  const [groupedDirty, setGroupedDirty] = useState(false);
  const [editFormId, setEditFormId] = useState(EDIT_VARIANT_FORM_ID);
  const [originalVariantIds, setOriginalVariantIds] = useState<string[]>([]);
  const [originalGroupIds, setOriginalGroupIds] = useState<string[]>([]);
  const [detailHydrated, setDetailHydrated] = useState(false);
  const [initialProductDraft, setInitialProductDraft] = useState<ProductDraft | null>(null);
  const [initialGroupDrafts, setInitialGroupDrafts] = useState<GroupDraft[]>([]);

  const productId = product?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: adminQueryKeys.productDetail(productId ?? ""),
    queryFn: () => adminGetNullable<ProductDetailPayload>(`products/${productId}`),
    enabled: !isCreate && Boolean(productId),
  });

  const { data: itemUnitsData } = useQuery({
    queryKey: adminQueryKeys.itemUnits(),
    queryFn: () => adminGet<{ data: ItemUnit[] }>("item-units"),
  });
  const itemUnits = Array.isArray(itemUnitsData)
    ? itemUnitsData
    : (itemUnitsData?.data ?? []);

  const variants = data?.variants ?? [];
  const isGroupedProduct =
    !isCreate &&
    (data?.product?.variant_layout === "grouped" ||
      product?.variant_layout === "grouped" ||
      (data?.variant_groups?.length ?? 0) > 0);

  useEffect(() => {
    setDetailHydrated(false);
    setActiveTab(initialStepId === "variants" ? "variants" : "details");
    setCreateVariantLayout("none");
    setGroupDrafts([]);
    setVariantDrafts([]);
    setOriginalVariantIds([]);
    setOriginalGroupIds([]);
    setInitialProductDraft(null);
    setInitialGroupDrafts([]);
  }, [productId, isCreate, initialStepId]);

  useEffect(() => {
    if (isCreate || !data || detailHydrated) return;

    const layoutGrouped =
      data.product.variant_layout === "grouped" ||
      (data.variant_groups?.length ?? 0) > 0;

    const draft = productDraftFromDetail(
      data.product,
      data.product_images ?? [],
      data.product_videos ?? [],
      data.variants,
    );
    setProductDraft(draft);
    setInitialProductDraft(cloneProductDraft(draft));
    setOriginalVariantIds(data.variants.map((v) => v.id));

    if (layoutGrouped) {
      const groups = groupDraftsFromApi(data.variant_groups ?? [], data.variants);
      const nextGroups = groups.length > 0 ? groups : [emptyGroupDraft()];
      setGroupDrafts(nextGroups);
      setInitialGroupDrafts(cloneGroupDrafts(nextGroups));
      setOriginalGroupIds((data.variant_groups ?? []).map((g) => g.id));
    } else if (data.variants.length > 0) {
      setVariantDrafts(variantDraftsFromApi(data.variants));
    }

    setDetailHydrated(true);
  }, [isCreate, data, detailHydrated]);

  const detailsValid =
    productDraft.name.trim().length > 0 &&
    (productDraft.defaultPrice > 0 || (!isCreate && variants.length > 0) || (isCreate && createVariantLayout !== "none"));

  const variantsValid = useMemo(() => {
    if (variantDrafts.length === 0) return true;
    return variantDrafts.every(
      (v) => v.name.trim().length > 0,
    );
  }, [variantDrafts]);

  const groupsValid = useMemo(
    () => isGroupDraftsValid(groupDrafts, showMrp),
    [groupDrafts, showMrp],
  );

  const layoutGrouped = isCreate ? createVariantLayout === "grouped" : isGroupedProduct;

  function handleCreateVariantLayoutSelect(layout: "none" | "flat" | "grouped") {
    if (layout === "none") {
      setGroupDrafts([]);
      setVariantDrafts([]);
      setCreateVariantLayout("none");
      setActiveTab("details");
      return;
    }
    
    if (layout === "grouped") {
      const hasNamedRows = groupDrafts.some((g) =>
        g.rows.some((r) => r.name.trim().length > 0),
      );
      if (!hasNamedRows) {
        if (variantDrafts.length > 0 && variantDrafts.some(v => v.name.trim().length > 0)) {
          // Migrate flat -> grouped
          setGroupDrafts([
            {
              localId: newLocalId(),
              name: "Models",
              rows: variantDrafts.filter(v => v.name.trim().length > 0).map((v) => ({
                localId: v.localId,
                variantId: undefined,
                name: v.name,
                price: v.price,
                mrp: v.mrp,
                stock: v.stock,
              })),
            },
          ]);
        } else {
          setGroupDrafts([
            {
              localId: newLocalId(),
              name: "Models",
              rows: [emptyGroupSkuRow()],
            },
          ]);
        }
      }
    } else if (layout === "flat") {
      const rows = groupDrafts.flatMap((g) => g.rows).filter((r) => r.name.trim());
      if (rows.length > 0) {
        // Migrate grouped -> flat
        setVariantDrafts(
          rows.map((r) => ({
            localId: r.localId,
            name: r.name,
            price: r.price,
            mrp: r.mrp,
            stock: r.stock,
            imageUrls: [],
            previewIndex: 0,
          })),
        );
      } else if (variantDrafts.length === 0) {
        setVariantDrafts([
          emptyVariantDraft(),
        ]);
      }
    }
    setCreateVariantLayout(layout);
  }

  const skuValid = layoutGrouped
    ? groupDrafts.length === 0 || groupsValid
    : variantsValid;

  const isDetailsDirty = useMemo(() => {
    if (isCreate || !initialProductDraft) return true;
    return !productDraftsEqual(productDraft, initialProductDraft);
  }, [isCreate, initialProductDraft, productDraft]);

  const isGroupedVariantsDirty = useMemo(() => {
    if (!isGroupedProduct) return false;
    return !groupDraftsEqual(groupDrafts, initialGroupDrafts);
  }, [isGroupedProduct, groupDrafts, initialGroupDrafts]);

  function handleContinueDetails() {
    setError(null);
    if (!detailsValid) {
      setError(
        isCreate
          ? "Product name and default price are required."
          : "Product name is required.",
      );
      return;
    }
    setActiveTab("variants");
  }

  function handleSaveDetails() {
    setError(null);
    if (!detailsValid) {
      setError(
        isCreate
          ? "Product name and default price are required."
          : "Product name is required.",
      );
      return;
    }
    if (!isDetailsDirty) {
      onClose();
      return;
    }
    startTransition(async () => {
      try {
        const orderedProductImages = orderedImages(
          productDraft.imageUrls,
          productDraft.imagePreviewIndex,
        );
        const erpFields = variantErpFieldsFromDraft(productDraft);
        const primaryVariant = variants[0];
        const catalogImage =
          catalogImageFromProductDraft(productDraft) ??
          catalogImageFromVariantRows(variants);

        await updateProductAction(productId!, {
          name: productDraft.name.trim(),
          description: productDraft.description.trim(),
          categoryId: productDraft.categoryId,
          brandId: productDraft.brandId,
          imageUrl: catalogImage,
          imageUrls: orderedProductImages,
          videoUrls: productDraft.videoUrls,
          imagePreviewIndex: productDraft.imagePreviewIndex,
          itemType: productDraft.itemType,
          hsnSac: productDraft.hsnSac.trim() || null,
          ...(primaryVariant
            ? {}
            : {
                price:
                  productDraft.defaultPrice > 0
                    ? roundMoney2(productDraft.defaultPrice)
                    : null,
                mrp:
                  productDraft.defaultMrp > 0
                    ? roundMoney2(productDraft.defaultMrp)
                    : null,
                barcode: erpFields.barcode,
                purchasePrice: erpFields.purchasePrice,
                taxRatePercent: erpFields.taxRatePercent,
              }),
        });

        if (primaryVariant) {
          await updateVariantAction(primaryVariant.id, productId!, {
            name: primaryVariant.name ?? productDraft.name.trim(),
            price: productDraft.defaultPrice > 0 ? productDraft.defaultPrice : Number(primaryVariant.price) || 0,
            mrp: productDraft.defaultMrp > 0 ? productDraft.defaultMrp : Number(primaryVariant.mrp) || 0,
            ...erpFields,
          });
        } else if (productDraft.defaultPrice > 0 && variants.length === 0) {
          await ensureDefaultProductVariantAction(productId!);
        }
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.productDetail(productId!),
        });
        await queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
        onClose();
      } catch (err) {
        setError(formatActionError(err));
      }
    });
  }

  function handleSaveGroupedVariants() {
    if (!productId) return;
    if (!groupsValid) {
      setError("Each group needs a name and models.");
      return;
    }
    if (!isGroupedVariantsDirty) {
      onClose();
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const groupsPayload = groupDrafts.map((g) => ({
          localId: g.localId,
          name: g.name,
          rows: g.rows.map((r) => ({
            localId: r.localId,
            variantId: r.variantId,
            name: r.name,
            price: r.price,
            mrp: r.mrp,
            stock: r.stock,
          })),
        }));
        await saveGroupedVariantsAction(
          productId,
          groupsPayload,
          originalVariantIds,
          originalGroupIds,
        );
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.productDetail(productId),
        });
        await queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
        onClose();
      } catch (err) {
        setError(formatActionError(err));
      }
    });
  }

  function handleCreateAll() {
    if (!detailsValid) {
      setError("Product name is required.");
      setActiveTab("details");
      return;
    }
    if (createVariantLayout !== "none" && !skuValid) {
      setError(
        layoutGrouped
          ? "Each group needs a name and models."
          : "Each added SKU needs a name.",
      );
      setActiveTab("variants");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const orderedProductImages = orderedImages(
          productDraft.imageUrls,
          productDraft.imagePreviewIndex,
        );
        const catalogImage = catalogImageFromProductDraft(productDraft);
        const erpFields = variantErpFieldsFromDraft(productDraft);
        const hasVariants =
          layoutGrouped
            ? groupDrafts.some((g) => g.rows.length > 0)
            : variantDrafts.length > 0;

        const id = await createProductAction({
          name: productDraft.name.trim(),
          description: productDraft.description.trim(),
          categoryId: productDraft.categoryId,
          brandId: productDraft.brandId,
          imageUrl: catalogImage,
          variantLayout: layoutGrouped ? "grouped" : "flat",
          imageUrls: orderedProductImages,
          videoUrls: productDraft.videoUrls,
          itemType: productDraft.itemType,
          hsnSac: productDraft.hsnSac.trim() || null,
          price: hasVariants
            ? null
            : productDraft.defaultPrice > 0
              ? roundMoney2(productDraft.defaultPrice)
              : null,
          mrp: hasVariants
            ? null
            : productDraft.defaultMrp > 0
              ? roundMoney2(productDraft.defaultMrp)
              : null,
          barcode: hasVariants ? null : erpFields.barcode,
          purchasePrice: hasVariants ? null : erpFields.purchasePrice,
          taxRatePercent: hasVariants ? null : erpFields.taxRatePercent,
        });

        if (layoutGrouped && groupDrafts.some((g) => g.rows.length > 0)) {
          for (let gi = 0; gi < groupDrafts.length; gi++) {
            const g = groupDrafts[gi];
            const groupId = await createVariantGroupAction(id, {
              name: g.name.trim(),
              sortOrder: gi,
            });
            for (let ri = 0; ri < g.rows.length; ri++) {
              const row = g.rows[ri];
              await createVariantAction(id, {
                name: row.name.trim(),
                price: roundMoney2(row.price),
                mrp: roundMoney2(row.mrp),
                variantGroupId: groupId,
                ...(gi === 0 && ri === 0 ? erpFields : {}),
              });
            }
          }
        } else if (variantDrafts.length > 0) {
          for (let i = 0; i < variantDrafts.length; i++) {
            const v = variantDrafts[i];
              await createVariantAction(id, {
                name: v.name.trim() || DEFAULT_SKU_NAME,
                price: roundMoney2(v.price),
                mrp: roundMoney2(v.mrp),
                imageUrls: orderedImages(v.imageUrls, v.previewIndex),
                ...(i === 0 ? erpFields : {}),
              });
          }
        } else if (productDraft.defaultPrice > 0) {
          await ensureDefaultProductVariantAction(id);
        }
        await queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
        onClose();
      } catch (err) {
        setError(formatActionError(err));
      }
    });
  }

  const showBack = false;

  async function handleCatalogSync() {
    if (!productId) return;
    await syncProductCatalogImage(queryClient, productId);
  }

  return (
    <Modal
      title={isCreate ? "New Product" : "Edit Product"}
      subtitle={product?.name ?? undefined}
      onClose={onClose}
      size="landscape"
      bareBody
    >
      <div className="flex shrink-0 border-b border-slate-200 bg-white px-2.5 sm:px-4 min-[1100px]:px-5">
        <button
          type="button"
          onClick={() => setActiveTab("details")}
          className={`px-2.5 py-2 text-xs font-semibold border-b-[3px] transition-colors -mb-px sm:px-3 sm:py-2.5 sm:text-sm ${
            activeTab === "details"
              ? "border-[#2563EB] text-[#2563EB]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Product Details
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("variants")}
          className={`px-2.5 py-2 text-xs font-semibold border-b-[3px] transition-colors -mb-px sm:px-3 sm:py-2.5 sm:text-sm ${
            activeTab === "variants"
              ? "border-[#2563EB] text-[#2563EB]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Variants & SKUs
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/30">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            data-form-enter-nav
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {activeTab === "details" && !isCreate && isLoading && !detailHydrated ? (
              <div className="flex flex-1 flex-col p-6">
                <AdminFormSkeleton />
              </div>
            ) : null}

            {activeTab === "details" && (isCreate || detailHydrated || !isLoading) ? (
              <DetailsStepForm
                draft={productDraft}
                categories={categories}
                brands={brands}
                itemUnits={itemUnits}
                onDraftChange={setProductDraft}
                error={error}
                showMrp={showMrp}
                isGroupedLayout={isCreate ? layoutGrouped : isGroupedProduct}
              />
            ) : null}

            {activeTab === "variants" && isCreate ? (
              createVariantLayout === "none" ? (
                <VariantSetupSelection onSelect={handleCreateVariantLayoutSelect} />
              ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-2.5 py-2 shadow-sm sm:px-4 min-[1100px]:px-6 min-[1100px]:py-2.5">
                    <p className="text-[11px] text-slate-600 sm:text-xs">
                      Layout: <strong>{createVariantLayout === "grouped" ? "Variant Groups" : "Standard Variants"}</strong>
                    </p>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm("Are you sure you want to remove all variants? This will revert to a simple product.")) {
                            handleCreateVariantLayoutSelect("none");
                          }
                        }}
                        className="text-xs font-medium text-slate-500 hover:text-rose-600 transition-colors"
                      >
                        Remove all variants
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCreateVariantLayoutSelect(createVariantLayout === "grouped" ? "flat" : "grouped")}
                        className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] transition-colors"
                      >
                        Switch to {createVariantLayout === "grouped" ? "Standard Variants" : "Variant Groups"}
                      </button>
                    </div>
                  </div>
                  {createVariantLayout === "grouped" ? (
                    <GroupVariantsStep
                      groups={groupDrafts}
                      onChange={setGroupDrafts}
                      onDirty={() => {}}
                      showMrp={showMrp}
                      defaultPrice={productDraft.defaultPrice}
                      defaultMrp={productDraft.defaultMrp}
                    />
                  ) : (
                    <CreateVariantsStep
                      drafts={variantDrafts}
                      onChange={setVariantDrafts}
                    />
                  )}
                </div>
              )
            ) : null}

            {activeTab === "variants" && !isCreate && productId && isGroupedProduct ? (
              <GroupVariantsStep
                groups={groupDrafts}
                onChange={setGroupDrafts}
                onDirty={() => setGroupedDirty(true)}
                showMrp={showMrp}
                defaultPrice={productDraft.defaultPrice}
                defaultMrp={productDraft.defaultMrp}
                initialVariantId={
                  typeof initialVariantId === "string" ? initialVariantId : undefined
                }
              />
            ) : null}

            {activeTab === "variants" && !isCreate && productId && !isGroupedProduct ? (
              <EditVariantsStep
                productId={productId}
                productName={productDraft.name}
                variants={variants}
                isLoading={isLoading && !data}
                isGroupedLayout={false}
                defaultPrice={productDraft.defaultPrice}
                defaultMrp={productDraft.defaultMrp}
                initialSelectedVariantId={initialVariantId}
                onCatalogSync={handleCatalogSync}
                onFormIdChange={setEditFormId}
              />
            ) : null}

            {(activeTab === "variants" && isCreate && error) ? (
              <div className="shrink-0 border-t border-border bg-background px-6 py-3">
                <FormError message={error} />
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      <div
        data-form-enter-footer
        className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-background px-2.5 py-2.5 sm:gap-3 sm:px-4 sm:py-3 min-[1100px]:px-6 min-[1100px]:py-4"
      >
        <div className="flex items-center gap-2">
          <SecondaryBtn onClick={onClose} disabled={isPending}>
            Cancel
          </SecondaryBtn>

          {isCreate ? (
            <PrimaryBtn enterNavSubmit onClick={handleCreateAll} disabled={isPending}>
              {isPending ? "Creating…" : "Save product"}
            </PrimaryBtn>
          ) : activeTab === "details" ? (
            <PrimaryBtn
              enterNavSubmit
              onClick={handleSaveDetails}
              disabled={isPending || !detailsValid}
            >
              {isPending ? "Saving…" : "Save product"}
            </PrimaryBtn>
          ) : isGroupedProduct ? (
            <PrimaryBtn
              enterNavSubmit
              onClick={handleSaveGroupedVariants}
              disabled={isPending || !groupsValid}
            >
              {isPending
                ? "Saving…"
                : isGroupedVariantsDirty
                  ? "Save variants"
                  : "Done"}
            </PrimaryBtn>
          ) : editFormId === EDIT_VARIANT_FORM_ID ? (
            <PrimaryBtn type="submit" form={editFormId} disabled={isPending}>
              {isPending ? "Saving…" : "Save changes"}
            </PrimaryBtn>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
