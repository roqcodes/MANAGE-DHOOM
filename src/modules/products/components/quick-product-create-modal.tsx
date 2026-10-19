"use client";

import { useEffect, useState, useTransition } from "react";
import { AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";

import type { Category } from "@/common/admin/types";
import type { ErpProductSearchRow } from "@/common/erp/purchasing-types";
import { createCatalogProductAction } from "@/modules/products/actions/create-product-catalog.action";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { formatActionError } from "@/modules/admin/lib/format-action-error";
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
import { useProductCreateSession } from "@/modules/products/lib/product-create-session";
import { DEFAULT_ITEM_TAX_RATE_PERCENT } from "@/modules/tax/default-item-tax-rate";

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
  const { begin, end } = useProductCreateSession(true);

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
    const operationId = begin();
    if (!operationId) return;

    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const barcode = (fd.get("barcode") as string).trim();
    const purchasePriceRaw = (fd.get("purchasePrice") as string).trim();
    const taxRateRaw = (fd.get("taxRatePercent") as string).trim();
    const hsnSac = (fd.get("hsnSac") as string).trim();
    const categoryId = (fd.get("categoryId") as string).trim();

    if (!name) {
      setError("Product name is required.");
      end();
      return;
    }

    const purchasePrice = purchasePriceRaw ? parseFloat(purchasePriceRaw) : 0;
    const taxRatePercent = taxRateRaw
      ? parseFloat(taxRateRaw)
      : DEFAULT_ITEM_TAX_RATE_PERCENT;

    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
      setError("Enter a valid purchase price.");
      end();
      return;
    }
    if (!Number.isFinite(taxRatePercent) || taxRatePercent < 0) {
      setError("Enter a valid tax rate.");
      end();
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const result = await createCatalogProductAction({
          operationId,
          name,
          description: "",
          categoryId: categoryId || null,
          brandId: null,
          imageUrl: null,
          variantLayout: "flat",
          itemType: "goods",
          barcode: barcode || null,
          purchasePrice,
          taxRatePercent,
          hsnSac: hsnSac || null,
          setup: { mode: "simple", ensureDefaultVariant: true },
        });

        await invalidateAdminProductCatalogQueries(queryClient);

        if (result.status === "failed" || !result.productId) {
          setError(result.message);
          return;
        }

        if (result.status === "partial") {
          setError(
            result.openProductHref
              ? `${result.message} Check the product list or retry with the same save session.`
              : result.message,
          );
          return;
        }

        onCreated({
          id: result.productId,
          product_name: name,
          barcode: barcode || null,
          purchase_price: purchasePrice,
          tax_rate_percent: taxRatePercent,
        });
        onClose();
      } catch (err) {
        setError(
          formatActionError(err) ||
            "We couldn't confirm whether the product was saved. Check the product list before trying again.",
        );
      } finally {
        end();
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
                defaultValue={DEFAULT_ITEM_TAX_RATE_PERCENT}
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
