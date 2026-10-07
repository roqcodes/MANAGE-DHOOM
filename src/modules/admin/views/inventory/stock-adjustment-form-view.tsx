"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import type { ErpSalesProductSearchRow } from "@/common/erp/sales-types";
import { adminPost } from "@/modules/admin/lib/admin-api-client";
import {
  AdminFormColumns,
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  AdminFormShell,
  ErpDocumentNumberField,
  ProductLiveSearch,
  type ErpFormViewBaseProps,
} from "@/modules/admin/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { coalesceNumber } from "@/lib/numeric-input";
import {
  ActiveStoreFormField,
  useActiveStoreFormField,
} from "@/modules/erp/components/use-active-store-form-field";
import { formatCurrencyAmount } from "@/lib/format-currency";

type AdjLine = {
  key: string;
  productId: string;
  productName: string;
  direction: "add" | "remove";
  quantity: number;
  purchaseCost: number;
};

function newKey() {
  return `adj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export type StockAdjustmentFormViewProps = ErpFormViewBaseProps;

export function StockAdjustmentFormView({
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: StockAdjustmentFormViewProps) {
  const router = useRouter();
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode: "create" });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isModal = variant === "modal";

  const [adjustmentDate, setAdjustmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<AdjLine[]>([]);

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/erp/stock-adjustments");
    }
  }

  function handleSuccessNavigate(id: string) {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(id);
      return;
    }
    router.push(`/admin/erp/stock-adjustments/${id}`);
  }

  function addLine(row: ErpSalesProductSearchRow, direction: "add" | "remove") {
    setLines([
      ...lines,
      {
        key: newKey(),
        productId: row.id,
        productName: row.product_name,
        direction,
        quantity: 1,
        purchaseCost: row.purchase_price ?? 0,
      },
    ]);
  }

  function handleSubmit(finalize: boolean) {
    setError(null);
    if (!effectiveStoreId) {
      setError(storeRequiredMessage ?? "Store is required");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one item");
      return;
    }
    for (const line of lines) {
      if (line.direction === "add" && (!line.purchaseCost || line.purchaseCost <= 0)) {
        setError(`Purchase cost is required when adding stock (${line.productName})`);
        return;
      }
    }

    startTransition(async () => {
      try {
        const res = await adminPost<{ id: string }>("erp/stock-adjustments", {
          storeId: effectiveStoreId,
          adjustmentDate,
          note: note || undefined,
          finalize,
          lines: lines.map((l) => ({
            productId: l.productId,
            direction: l.direction,
            quantity: l.quantity,
            purchaseCost: l.direction === "remove" ? 0 : l.purchaseCost,
          })),
        });
        handleSuccessNavigate(res.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  if (isModal && !open) return null;

  const title = "New stock adjustment";
  const footer = isModal ? (
    <>
      <Button type="button" variant="outline" onClick={handleCancel}>
        Cancel
      </Button>
      <Button type="button" disabled={pending} onClick={() => handleSubmit(false)}>
        Save draft
      </Button>
      <Button type="button" disabled={pending} onClick={() => handleSubmit(true)}>
        {pending ? "Savingâ€¦" : "Save & finalize"}
      </Button>
    </>
  ) : undefined;

  const sections = (
    <AdminFormColumns cols={2}>
      <AdminFormSection title="Adjustment details">
        <AdminFormGrid cols={2}>
          <ErpDocumentNumberField kind="SA" />
          <AdminFormField label="Store" required>
            <ActiveStoreFormField
              mode="create"
              stores={stores}
              activeStoreId={activeStoreId}
              storeId={storeId}
              onStoreIdChange={setStoreId}
              label=""
            />
          </AdminFormField>
          <AdminFormField label="Date">
            <Input
              type="date"
              value={adjustmentDate}
              onChange={(e) => setAdjustmentDate(e.target.value)}
            />
          </AdminFormField>
          <AdminFormField label="Note" className="sm:col-span-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </AdminFormField>
        </AdminFormGrid>
      </AdminFormSection>

      <AdminFormSection title="Items">
        <ProductLiveSearch
          catalog="sales"
          storeId={effectiveStoreId}
          placeholder="Search productâ€¦"
          renderResult={(r, dismiss) => (
            <div className="flex items-center justify-between gap-2 rounded border border-border bg-background p-2 text-sm">
              <span>
                {r.product_name} {r.barcode ? `(${r.barcode})` : ""}
              </span>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    addLine(r as ErpSalesProductSearchRow, "add");
                    dismiss();
                  }}
                >
                  Stock add
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    addLine(r as ErpSalesProductSearchRow, "remove");
                    dismiss();
                  }}
                >
                  Stock remove
                </Button>
              </div>
            </div>
          )}
        />

        {lines.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Direction</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Cost</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.key} className="border-t">
                    <td className="px-3 py-2">{line.productName}</td>
                    <td className="px-3 py-2 capitalize">{line.direction}</td>
                    <td className="px-3 py-2">
                      <NumericInput
                        min={0}
                        step="any"
                        value={line.quantity}
                        onValueChange={(quantity) =>
                          setLines(
                            lines.map((l) => (l.key === line.key ? { ...l, quantity } : l)),
                          )
                        }
                        className="w-20"
                      />
                    </td>
                    <td className="px-3 py-2">
                      {line.direction === "add" ? (
                        <NumericInput
                          min={0}
                          step="0.01"
                          value={line.purchaseCost}
                          onValueChange={(purchaseCost) =>
                            setLines(
                              lines.map((l) =>
                                l.key === line.key ? { ...l, purchaseCost } : l,
                              ),
                            )
                          }
                          className="w-24"
                          required
                        />
                      ) : (
                        <span className="text-muted-foreground">â€”</span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {line.direction === "add"
                        ? formatCurrencyAmount(
                            coalesceNumber(line.quantity) * coalesceNumber(line.purchaseCost),
                          )
                        : "â€”"}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setLines(lines.filter((l) => l.key !== line.key))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </AdminFormSection>
    </AdminFormColumns>
  );

  return (
    <AdminFormShell
      pending={pending}
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Add or remove inventory with optional purchase cost for stock increases."
      backHref="/admin/erp/stock-adjustments"
      breadcrumb={[
        { label: "Stock adjustments", href: "/admin/erp/stock-adjustments" },
        { label: title },
      ]}
      size="landscape"
      footer={footer}
    >
      <div className="space-y-4">
        {sections}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!isModal ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Link
              href="/admin/erp/stock-adjustments"
              className={buttonVariants({ variant: "outline" })}
            >
              Cancel
            </Link>
            <Button type="button" disabled={pending} onClick={() => handleSubmit(false)}>
              Save draft
            </Button>
            <Button type="button" disabled={pending} onClick={() => handleSubmit(true)}>
              {pending ? "Savingâ€¦" : "Save & finalize"}
            </Button>
          </div>
        ) : null}
      </div>
    </AdminFormShell>
  );
}
