"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import type { SalesLineFormRow } from "@/common/erp/sales-types";
import { calcSalesLine, roundSalesMoney } from "@/common/erp/sales-types";
import { adminGet, adminPatch, adminPost } from "@/modules/admin/lib/admin-api-client";
import {
  AdminFormField,
  AdminFormGrid,
  AdminFormModalLayout,
  AdminFormSection,
  AdminFormShell,
  CustomerSearchSelect,
  ErpDocumentNumberField,
  type ErpFormViewBaseProps,
} from "@/modules/admin/ui";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import {
  SalesLinesEditor,
  salesLinesToApiInput,
} from "@/modules/erp/components/sales-lines-editor";
import {
  ActiveStoreFormField,
  useActiveStoreFormField,
} from "@/modules/erp/components/use-active-store-form-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { coalesceNumber } from "@/lib/numeric-input";
import { Label } from "@/components/ui/label";

export type EstimateFormViewProps = ErpFormViewBaseProps & {
  mode: "create" | "edit";
  estimateId?: string;
};

export function EstimateFormView({
  mode,
  estimateId,
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: EstimateFormViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formId = useId();
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(mode === "edit");
  const isModal = variant === "modal";

  const [customerId, setCustomerId] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");
  const [estimateDate, setEstimateDate] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState("");
  const [discount, setDiscount] = useState(0);
  const [taxInclusive, setTaxInclusive] = useState(true);
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<SalesLineFormRow[]>([]);

  useEffect(() => {
    const preselected = searchParams.get("customerId");
    if (preselected && mode === "create") setCustomerId(preselected);
  }, [searchParams, mode]);

  useEffect(() => {
    if (mode === "create" && !validUntil) setValidUntil(estimateDate);
  }, [mode, estimateDate, validUntil]);

  useEffect(() => {
    if (mode !== "edit" || !estimateId) return;

    adminGet<{
      user_id: string;
      store_id: string;
      estimate_date: string;
      valid_until: string | null;
      discount: number;
      tax_inclusive: boolean;
      notes: string | null;
      reference: string | null;
      users: { name: string | null; email: string | null } | null;
      erp_estimate_lines: Array<{
        variant_id: string | null;
        product_name: string;
        description: string | null;
        quantity: number;
        unit_price: number;
        tax_rate_percent: number;
        unit_id: string | null;
      }>;
    }>(`erp/estimates/${estimateId}`)
      .then((detail) => {
        setCustomerId(detail.user_id);
        setCustomerLabel(detail.users?.name ?? detail.users?.email ?? "");
        setStoreId(detail.store_id);
        setEstimateDate(detail.estimate_date);
        setValidUntil(detail.valid_until ?? detail.estimate_date);
        setDiscount(Number(detail.discount ?? 0));
        setTaxInclusive(detail.tax_inclusive);
        setNotes(detail.notes ?? "");
        setReference(detail.reference ?? "");
        setLines(
          detail.erp_estimate_lines.map((item) => ({
            key: `line-${item.product_name}-${Math.random().toString(36).slice(2, 7)}`,
            productId: (item as { product_id?: string | null }).product_id ?? null,
            variantId: item.variant_id,
            productName: item.product_name,
            description: item.description ?? "",
            barcode: "",
            quantity: item.quantity,
            unitPrice: item.unit_price,
            taxRatePercent: item.tax_rate_percent,
            unitId: item.unit_id,
          })),
        );
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load estimate"))
      .finally(() => setLoadingEstimate(false));
  }, [estimateId, mode]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const line of lines) {
      const { taxable, taxAmount } = calcSalesLine(
        line.quantity,
        line.unitPrice,
        line.taxRatePercent,
        taxInclusive,
      );
      subtotal += taxable;
      tax += taxAmount;
    }
    const gross = roundSalesMoney(subtotal + tax);
    const net = roundSalesMoney(Math.max(0, gross - coalesceNumber(discount)));
    return { subtotal: roundSalesMoney(subtotal), tax: roundSalesMoney(tax), total: net };
  }, [lines, taxInclusive, discount]);

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push(estimateId ? `/admin/erp/estimates/${estimateId}` : "/admin/erp/estimates");
    }
  }

  function handleSuccessNavigate(id?: string, print?: boolean) {
    if (print && id) {
      if (isModal) onOpenChange?.(false);
      router.push(`/admin/erp/estimates/${id}/print`);
      return;
    }
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(id);
      return;
    }
    router.push(id ? `/admin/erp/estimates/${id}` : "/admin/erp/estimates");
  }

  function handleSubmit(submitMode: "save" | "draft" | "print") {
    setError(null);
    if (!customerId) {
      setError("Customer is required");
      return;
    }
    if (!effectiveStoreId) {
      setError(storeRequiredMessage ?? "Store is required");
      return;
    }
    const apiLines = salesLinesToApiInput(lines);
    if (apiLines.length === 0) {
      setError("Add at least one item");
      return;
    }

    const payload = {
      estimateDate,
      validUntil: validUntil || estimateDate,
      lines: apiLines,
      discount: coalesceNumber(discount),
      taxInclusive,
      notes: notes || undefined,
      reference: reference || undefined,
    };

    startTransition(async () => {
      try {
        if (estimateId) {
          await adminPatch(`erp/estimates/${estimateId}`, {
            ...payload,
            status: submitMode === "draft" ? "draft" : "sent",
          });
          handleSuccessNavigate(estimateId, submitMode === "print");
          return;
        }

        const res = await adminPost<{ id: string }>("erp/estimates", {
          userId: customerId,
          storeId: effectiveStoreId,
          ...payload,
          finalize: submitMode !== "draft",
        });
        handleSuccessNavigate(res.id, submitMode === "print");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save estimate");
      }
    });
  }

  if (isModal && !open) return null;

  const title = mode === "edit" ? "Edit estimate" : "Add estimate";
  const backHref = estimateId ? `/admin/erp/estimates/${estimateId}` : "/admin/erp/estimates";

  const totalsSidebar = (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Total</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Sub total</span>
          <span className="tabular-nums font-medium">{totals.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tax</span>
          <span className="tabular-nums font-medium">{totals.tax.toFixed(2)}</span>
        </div>
        <div className="space-y-1">
          <Label>Discount after tax</Label>
          <NumericInput
            min={0}
            step="0.01"
            value={discount}
            onValueChange={setDiscount}
          />
        </div>
        <div className="flex justify-between border-t pt-3 text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{totals.total.toFixed(2)}</span>
        </div>
      </CardContent>
    </Card>
  );

  const footer = isModal ? (
    <>
      <Button type="button" variant="outline" onClick={handleCancel}>
        Cancel
      </Button>
      <Button variant="outline" disabled={pending} onClick={() => handleSubmit("draft")}>
        Save as draft
      </Button>
      <Button variant="outline" disabled={pending} onClick={() => handleSubmit("print")}>
        Save and print
      </Button>
      <Button disabled={pending} onClick={() => handleSubmit("save")}>
        {pending ? "Savingâ€¦" : mode === "edit" ? "Update estimate" : "Save"}
      </Button>
    </>
  ) : undefined;

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Create or update a sales estimate."
      backHref={backHref}
      breadcrumb={[
        { label: "Estimates", href: "/admin/erp/estimates" },
        { label: title },
      ]}
      size="landscape"
      formId={formId}
      pending={pending}
      footer={footer}
      loading={loadingEstimate}
      loadingFallback={<AdminPageSkeleton />}
    >
      <form
        id={formId}
        className="space-y-4"
        autoComplete="off"
        onSubmit={(e) => e.preventDefault()}
      >
        <AdminFormModalLayout sidebar={totalsSidebar}>
          <AdminFormSection title="Estimate details">
            <AdminFormGrid cols={3}>
              <AdminFormField label="Customer" required className="sm:col-span-2">
                <CustomerSearchSelect
                  value={customerId || null}
                  selectedLabel={customerLabel || undefined}
                  disabled={mode === "edit"}
                  onChange={(id, option) => {
                    setCustomerId(id ?? "");
                    setCustomerLabel(option?.label ?? "");
                  }}
                />
                <Link href="/admin/customers" className="mt-1 inline-block text-xs text-primary hover:underline">
                  Add customer
                </Link>
              </AdminFormField>
              <AdminFormField label="Store" required>
                <ActiveStoreFormField
                  mode={mode}
                  stores={stores}
                  activeStoreId={activeStoreId}
                  storeId={storeId}
                  onStoreIdChange={setStoreId}
                  label=""
                />
              </AdminFormField>
              <ErpDocumentNumberField kind="EST" enabled={mode === "create"} />
              <AdminFormField label="Estimate date">
                <Input type="date" value={estimateDate} onChange={(e) => setEstimateDate(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Expiry date">
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Reference">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </AdminFormField>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={taxInclusive} onChange={(e) => setTaxInclusive(e.target.checked)} />
                Item rates are tax inclusive
              </label>
              <AdminFormField label="Notes" className="sm:col-span-2">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </AdminFormField>
            </AdminFormGrid>
          </AdminFormSection>

          <AdminFormSection title="Estimate items">
            <SalesLinesEditor
              lines={lines}
              onChange={setLines}
              storeId={effectiveStoreId}
              customerId={customerId}
              taxInclusive={taxInclusive}
              showSerial
            />
          </AdminFormSection>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {!isModal ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Link href={backHref} className={buttonVariants({ variant: "outline" })}>
                Cancel
              </Link>
              <Button variant="outline" disabled={pending} onClick={() => handleSubmit("draft")}>
                Save as draft
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => handleSubmit("print")}>
                Save and print
              </Button>
              <Button disabled={pending} onClick={() => handleSubmit("save")}>
                {pending ? "Savingâ€¦" : mode === "edit" ? "Update estimate" : "Save"}
              </Button>
            </div>
          ) : null}
        </AdminFormModalLayout>
      </form>
    </AdminFormShell>
  );
}
