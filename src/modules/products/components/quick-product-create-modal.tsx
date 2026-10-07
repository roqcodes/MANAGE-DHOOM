"use client";

import { useEffect, useState, useTransition } from "react";
import { AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";

import type { Category } from "@/common/admin/types";
import type { ErpProductSearchRow } from "@/common/erp/purchasing-types";
import {
  createProductAction,
  ensureDefaultProductVariantAction,
} from "@/modules/products/actions/products.actions";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import {
  FieldLabel,
  FormError,
  Modal,
  PrimaryBtn,
  SecondaryBtn,
  inputCls,
  selectCls,
} from "@/modules/admin/components/modal";
import { invalidateAdminProductCatalogQueries } from "@/modules/erp/lib/erp-product-live-search.client";

export type QuickProductCreateModalProps = {
  /** Prefill product name from search query. */
  initialName?: string;
  /** Render above an open ERP form dialog. */
  nested?: boolean;
  onClose: () => void;
  onCreated: (product: ErpProductSearchRow) => void;
};

export function QuickProductCreateModal({
  initialName = "",
  nested = false,
  onClose,
  onCreated,
}: QuickProductCreateModalProps) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let cancelled = false;
    adminGet<{ categories: Category[] }>("categories")
      .then((res) => {
        if (!cancelled) setCategories(res.categories ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const barcode = (fd.get("barcode") as string).trim();
    const purchasePriceRaw = (fd.get("purchasePrice") as string).trim();
    const taxRateRaw = (fd.get("taxRatePercent") as string).trim();
    const hsnSac = (fd.get("hsnSac") as string).trim();
    const categoryId = (fd.get("categoryId") as string).trim();

    if (!name) {
      setError("Product name is required.");
      return;
    }

    const purchasePrice = purchasePriceRaw ? parseFloat(purchasePriceRaw) : 0;
    const taxRatePercent = taxRateRaw ? parseFloat(taxRateRaw) : 0;

    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
      setError("Enter a valid purchase price.");
      return;
    }
    if (!Number.isFinite(taxRatePercent) || taxRatePercent < 0) {
      setError("Enter a valid tax rate.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const productId = await createProductAction({
          name,
          description: "",
          categoryId: categoryId || null,
          brandId: null,
          imageUrl: null,
          itemType: "goods",
          variantLayout: "flat",
          barcode: barcode || null,
          purchasePrice,
          taxRatePercent,
          hsnSac: hsnSac || null,
        });

        await ensureDefaultProductVariantAction(productId);

        void invalidateAdminProductCatalogQueries(queryClient);

        onCreated({
          id: productId,
          product_name: name,
          barcode: barcode || null,
          purchase_price: purchasePrice,
          tax_rate_percent: taxRatePercent,
        });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create product.");
      }
    });
  }

  return (
    <AnimatePresence>
      <Modal
        title="New product"
        subtitle="Adds a goods item to your catalog and inserts it on this document. You can add images and SKUs later from the products page."
        onClose={onClose}
        size="md"
        nested={nested}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FieldLabel label="Product name">
            <input
              className={inputCls}
              name="name"
              defaultValue={initialName}
              placeholder="e.g. Organic tomatoes"
              required
              autoFocus
            />
          </FieldLabel>

          <div className="grid gap-4 sm:grid-cols-2">
            <FieldLabel label="Barcode">
              <input className={inputCls} name="barcode" placeholder="Optional" />
            </FieldLabel>
            <FieldLabel label="HSN / SAC">
              <input className={inputCls} name="hsnSac" placeholder="Optional" />
            </FieldLabel>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FieldLabel label="Purchase price">
              <input
                className={inputCls}
                name="purchasePrice"
                type="number"
                min={0}
                step="any"
                placeholder="0"
              />
            </FieldLabel>
            <FieldLabel label="Tax %">
              <input
                className={inputCls}
                name="taxRatePercent"
                type="number"
                min={0}
                step="any"
                placeholder="0"
              />
            </FieldLabel>
          </div>

          <FieldLabel label="Category">
            <select className={selectCls} name="categoryId" defaultValue="">
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FieldLabel>

          <FormError message={error} />

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
            <PrimaryBtn type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create & add line"}
            </PrimaryBtn>
          </div>
        </form>
      </Modal>
    </AnimatePresence>
  );
}
