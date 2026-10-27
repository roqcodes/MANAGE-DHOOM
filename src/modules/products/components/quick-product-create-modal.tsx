"use client";

import { useEffect, useState, useTransition } from "react";
import { AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";

import type { Category } from "@/common/admin/types";
import type { ErpProductSearchRow } from "@/common/erp/purchasing-types";
import { createCatalogProductAction } from "@/modules/products/actions/create-product-catalog.action";
import {
  buildSimpleCatalogProductCreateInput,
  isPurchaseQuickCreatePricingValid,
  purchaseQuickCreatePricingMessage,
} from "@/modules/products/lib/build-simple-catalog-product-create-input";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { formatActionError } from "@/modules/admin/lib/format-action-error";
import {
  FieldLabel,
  Modal,
  ModalFormFooter,
  PrimaryBtn,
  SecondaryBtn,
  fieldControlCls,
  inputCls,
  selectCls,
} from "@/modules/admin/components/modal";
import {
  FormValidationScope,
  applyFieldValidation,
  useFormFieldValidation,
} from "@/modules/admin/ui";
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

export function QuickProductCreateModal(props: QuickProductCreateModalProps) {
  const { nested = false, initialName = "", onClose } = props;
  return (
    <AnimatePresence>
      <Modal
        title="New product"
        subtitle="Adds a goods item with purchase cost for this bill. Set sales price later on the products page before selling."
        onClose={onClose}
        size="md"
        nested={nested}
      >
        <FormValidationScope resetKey={initialName || "new"}>
          <QuickProductCreateModalForm {...props} />
        </FormValidationScope>
      </Modal>
    </AnimatePresence>
  );
}

function QuickProductCreateModalForm({
  initialName = "",
  onClose,
  onCreated,
}: QuickProductCreateModalProps) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | string[] | null>(null);
  const fieldValidation = useFormFieldValidation();
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

    const purchasePrice = purchasePriceRaw ? parseFloat(purchasePriceRaw) : 0;
    const taxRatePercent = taxRateRaw
      ? parseFloat(taxRateRaw)
      : DEFAULT_ITEM_TAX_RATE_PERCENT;
    const pricingMessage = !isPurchaseQuickCreatePricingValid(purchasePrice)
      ? purchaseQuickCreatePricingMessage()
      : null;

    const validationMessages = applyFieldValidation(
      [
        { key: "name", ok: Boolean(name), message: "Product name is required." },
        {
          key: "purchasePrice",
          ok: Number.isFinite(purchasePrice) && purchasePrice >= 0,
          message: "Enter a valid purchase price.",
        },
        { key: "purchasePrice", ok: !pricingMessage, message: pricingMessage ?? "" },
        {
          key: "taxRatePercent",
          ok: Number.isFinite(taxRatePercent) && taxRatePercent >= 0,
          message: "Enter a valid tax rate.",
        },
      ].filter((c) => c.message !== ""),
      fieldValidation.markFieldValidationFailed,
      fieldValidation.clearFieldValidation,
    );
    if (validationMessages) {
      setError(
        validationMessages.length === 1 ? validationMessages[0] : validationMessages,
      );
      end();
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const catalogInput = buildSimpleCatalogProductCreateInput({
          operationId,
          name,
          categoryId: categoryId || null,
          barcode: barcode || null,
          purchasePrice,
          taxRatePercent,
          hsnSac: hsnSac || null,
        });
        const result = await createCatalogProductAction(catalogInput);

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
          barcode: catalogInput.barcode ?? null,
          purchase_price: catalogInput.purchasePrice ?? null,
          tax_rate_percent: catalogInput.taxRatePercent ?? null,
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
        <form onSubmit={handleSubmit} className="space-y-4">
          <FieldLabel label="Product name">
            <input
              className={fieldControlCls(inputCls, fieldValidation.isFieldInvalid("name"))}
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
            <FieldLabel label="Purchase price" required>
              <input
                className={inputCls}
                name="purchasePrice"
                type="number"
                min={0.001}
                step="any"
                placeholder="Required"
                required
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

          <ModalFormFooter errors={error} className="border-t border-border pt-3">
            <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
            <PrimaryBtn type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create & add line"}
            </PrimaryBtn>
          </ModalFormFooter>
        </form>
  );
}
