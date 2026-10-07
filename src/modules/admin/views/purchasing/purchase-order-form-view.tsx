"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { ErpPurchaseOrderDetail } from "@/common/erp/purchasing-types";
import { roundMoney } from "@/common/erp/purchasing-types";
import type { PurchaseLineFormRow, LandedCostFormRow } from "@/common/erp/purchasing-types";
import {
  emptyPurchaseLine,
  linesToApiInput,
  PurchaseLinesEditor,
} from "@/modules/purchasing/components/purchase-lines-editor";
import {
  LandedCostsEditor,
  landedCostsToApiInput,
} from "@/modules/purchasing/components/landed-costs-editor";
import type { ErpLandedCostItem } from "@/common/erp/purchasing-types";
import {
  ActiveStoreFormField,
  useActiveStoreFormField,
} from "@/modules/erp/components/use-active-store-form-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { coalesceNumber } from "@/lib/numeric-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { calcPurchaseLine } from "@/common/erp/purchasing-types";
import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";
import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";
import { dispatchOutboxChanged } from "@/lib/sync/outbox-browser-events";
import { OutboxEnqueueError } from "@/lib/sync/outbox-errors";
import { createOutboxStore } from "@/lib/sync/outbox-store";
import { getOrCreateErpTerminalId } from "@/lib/sync/erp-terminal-id";
import { broadcastSyncWake } from "@/lib/sync/sync-network";
import { resolveOutboxUserId } from "@/lib/sync/resolve-outbox-user-id.client";
import { notifyErpLocalFormSaved } from "@/modules/erp/lib/erp-form-save-feedback.client";
import {
  purchaseOrderResourceScope,
  type PurchaseOrderCreatePayload,
  type PurchaseOrderUpdatePayload,
} from "@/modules/erp/types/purchase-payload";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import type { StoreStockShortageRow } from "@/common/erp/stock-shortage-types";
import {
  AdminFormActions,
  AdminFormField,
  AdminFormGrid,
  AdminFormModalLayout,
  AdminFormSection,
  AdminFormShell,
  ErpDocumentNumberField,
  VendorSearchSelect,
  type ErpFormViewBaseProps,
} from "@/modules/admin/ui";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";

export type PurchaseOrderFormViewProps = ErpFormViewBaseProps & {
  mode: "create" | "edit";
  poId?: string;
};

export function PurchaseOrderFormView({
  mode,
  poId,
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: PurchaseOrderFormViewProps) {
  const router = useRouter();
  const formId = useId();
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(mode === "edit");
  const [vendorLabel, setVendorLabel] = useState("");
  const isModal = variant === "modal";

  const [vendorId, setVendorId] = useState("");
  const [poDate, setPoDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState(0);
  const [lines, setLines] = useState<PurchaseLineFormRow[]>([]);
  const [landedCosts, setLandedCosts] = useState<LandedCostFormRow[]>([]);
  const [landedMaster, setLandedMaster] = useState<ErpLandedCostItem[]>([]);
  const [poNumber, setPoNumber] = useState<string | null>(null);
  const [shortagesLoading, setShortagesLoading] = useState(false);

  async function fillLinesFromShortages() {
    if (!effectiveStoreId) {
      setError(storeRequiredMessage ?? "Select a store first");
      return;
    }
    setShortagesLoading(true);
    setError(null);
    try {
      const res = await adminGet<{ data: StoreStockShortageRow[] }>(
        `erp/stock-shortages?storeId=${encodeURIComponent(effectiveStoreId)}`,
      );
      const shortages = res.data ?? [];
      if (shortages.length === 0) {
        setError("No negative store stock for this branch.");
        return;
      }
      const newLines = shortages.map((row) => ({
        ...emptyPurchaseLine(),
        productId: row.productId,
        productName: row.productName,
        quantity: Math.max(1, Math.ceil(row.suggestedQty)),
      }));
      setLines(newLines);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load shortages");
    } finally {
      setShortagesLoading(false);
    }
  }

  useEffect(() => {
    adminGet<{ data: ErpLandedCostItem[] }>("erp/landed-costs").then((r) =>
      setLandedMaster(r.data ?? []),
    );
  }, []);

  useEffect(() => {
    if (mode !== "edit" || !poId) return;
    adminGet<{ po: ErpPurchaseOrderDetail }>(`erp/purchase-orders/${poId}`)
      .then((res) => {
        const po = res.po;
        setVendorId(po.vendor_id ?? po.vendors?.id ?? "");
        setVendorLabel(po.vendors?.name ?? "");
        setStoreId(po.store_id ?? "");
        setPoDate(po.po_date ?? new Date().toISOString().slice(0, 10));
        setExpectedDeliveryDate(po.expected_delivery_date ?? "");
        setReference(po.reference ?? "");
        setNotes(po.notes ?? "");
        setDiscount(po.discount ?? 0);
        setPoNumber(po.po_number);
        setLines(
          po.purchase_order_items.length
            ? po.purchase_order_items.map((item) => ({
                key: item.id,
                productId:
                  (item as { product_id?: string | null }).product_id ??
                  item.product_variants?.product_id ??
                  null,
                variantId: item.variant_id,
                productName:
                  (item as { products?: { name?: string | null } | null }).products?.name ??
                  item.product_variants?.products?.name ??
                  "Item",
                barcode: item.product_variants?.barcode ?? "",
                expiryDate: "",
                quantity: item.quantity,
                purchasePrice: item.price,
                taxRatePercent: item.tax_rate_percent,
              }))
            : [],
        );
        setLandedCosts(
          (po.purchase_order_landed_costs ?? []).map((lc) => ({
            key: lc.id,
            landedCostItemId: lc.landed_cost_item_id,
            name: lc.name,
            quantity: lc.quantity,
            rate: lc.rate,
            taxRatePercent: lc.tax_rate_percent,
          })),
        );
      })
      .finally(() => setLoading(false));
  }, [poId, mode]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const line of lines) {
      const { taxable, taxAmount } = calcPurchaseLine(
        coalesceNumber(line.quantity),
        coalesceNumber(line.purchasePrice),
        coalesceNumber(line.taxRatePercent),
      );
      subtotal += taxable;
      tax += taxAmount;
    }
    let landed = 0;
    for (const lc of landedCosts) {
      landed += calcPurchaseLine(
        coalesceNumber(lc.quantity),
        coalesceNumber(lc.rate),
        coalesceNumber(lc.taxRatePercent),
      ).lineTotal;
    }
    const total = roundMoney(Math.max(0, subtotal + tax - coalesceNumber(discount)) + landed);
    return {
      subtotal: roundMoney(subtotal),
      tax: roundMoney(tax),
      landed: roundMoney(landed),
      total,
    };
  }, [lines, landedCosts, discount]);

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/purchase-orders");
    }
  }

  function resetCreateForm() {
    setVendorId("");
    setVendorLabel("");
    setPoDate(new Date().toISOString().slice(0, 10));
    setExpectedDeliveryDate("");
    setReference("");
    setNotes("");
    setDiscount(0);
    setLines([]);
    setLandedCosts([]);
    setPoNumber(null);
    setError(null);
  }

  function handleSuccessNavigate(id?: string) {
    if (mode === "create") {
      resetCreateForm();
      onSuccess?.(id);
      return;
    }
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(id);
      return;
    }
    if (id) router.push(`/admin/purchase-orders/${id}`);
  }

  function submit() {
    setError(null);
    const apiLines = linesToApiInput(lines);
    if (!vendorId) {
      setError("Vendor is required");
      return;
    }
    if (!effectiveStoreId) {
      setError(storeRequiredMessage ?? "Store is required");
      return;
    }
    if (!apiLines.length) {
      setError("Add at least one valid line item");
      return;
    }

    const payload = {
      vendorId,
      storeId: effectiveStoreId,
      poDate,
      expectedDeliveryDate: expectedDeliveryDate || null,
      reference: reference || null,
      notes: notes || null,
      lines: apiLines,
      discount: coalesceNumber(discount),
      landedCosts: landedCostsToApiInput(landedCosts),
    };

    startTransition(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const staffUserId = await resolveOutboxUserId(supabase);
        if (!staffUserId) {
          setError("You must be signed in to save a purchase order.");
          return;
        }

        const store = createOutboxStore();
        try {
          if (poId) {
            const updatePayload: PurchaseOrderUpdatePayload = { ...payload, poId };
            await store.enqueue({
              operationType: ERP_CLIENT_OPERATION_TYPES.purchaseOrder.update,
              schemaVersion: 1,
              payload: updatePayload,
              userId: staffUserId,
              storeId: effectiveStoreId,
              terminalId: getOrCreateErpTerminalId(),
              resourceScope: purchaseOrderResourceScope(poId),
            });
          } else {
            await store.enqueue({
              operationType: ERP_CLIENT_OPERATION_TYPES.purchaseOrder.create,
              schemaVersion: 1,
              payload: payload as PurchaseOrderCreatePayload,
              userId: staffUserId,
              storeId: effectiveStoreId,
              terminalId: getOrCreateErpTerminalId(),
            });
          }
        } catch (enqueueErr) {
          if (enqueueErr instanceof OutboxEnqueueError) {
            setError(enqueueErr.message);
          } else {
            setError(
              enqueueErr instanceof Error
                ? enqueueErr.message
                : "Could not save purchase order locally.",
            );
          }
          return;
        } finally {
          await store.close();
        }

        notifyErpLocalFormSaved({
          entityLabel: "Purchase order",
          mode: poId ? "update" : "create",
        });
        dispatchOutboxChanged();
        broadcastSyncWake();
        handleSuccessNavigate(poId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  if (isModal && !open) return null;

  const title = mode === "edit" ? "Edit purchase order" : "New purchase order";

  const totalsSidebar = (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-base">Totals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">{formatCurrencyAmount(totals.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tax</span>
          <span className="tabular-nums">{formatCurrencyAmount(totals.tax)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Landed costs</span>
          <span className="tabular-nums">{formatCurrencyAmount(totals.landed)}</span>
        </div>
        <AdminFormField label="Discount">
          <NumericInput min={0} value={discount} onValueChange={setDiscount} />
        </AdminFormField>
        <div className="flex justify-between border-t pt-2 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatCurrencyAmount(totals.total)}</span>
        </div>
      </CardContent>
    </Card>
  );

  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel={mode === "edit" ? "Save changes" : "Save & next"}
      pending={pending}
    />
  ) : undefined;

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={poNumber ? `PO ${poNumber}` : "Create a purchase order for a vendor."}
      backHref="/admin/purchase-orders"
      breadcrumb={[
        { label: "Purchase orders", href: "/admin/purchase-orders" },
        { label: title },
      ]}
      size="landscape"
      formId={formId}
      footer={footer}
      loading={loading}
      loadingFallback={<AdminPageSkeleton />}
    >
      <form
        id={formId}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <AdminFormModalLayout sidebar={totalsSidebar}>
          <AdminFormSection title="Purchase order details">
            <AdminFormGrid cols={3}>
              <ErpDocumentNumberField kind="PO" value={poNumber} enabled={mode === "create"} />
              <AdminFormField label="Vendor" required>
                <VendorSearchSelect
                  value={vendorId || null}
                  selectedLabel={vendorLabel || undefined}
                  onChange={(id, option) => {
                    setVendorId(id ?? "");
                    setVendorLabel(option?.label ?? "");
                  }}
                />
              </AdminFormField>
              <AdminFormField label="Destination store" required>
                <ActiveStoreFormField
                  mode={mode}
                  stores={stores}
                  activeStoreId={activeStoreId}
                  storeId={storeId}
                  onStoreIdChange={setStoreId}
                  label=""
                />
              </AdminFormField>
              <AdminFormField label="PO date">
                <Input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Expected delivery">
                <Input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                />
              </AdminFormField>
              <AdminFormField label="Reference">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Notes" className="sm:col-span-2">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </AdminFormField>
            </AdminFormGrid>
          </AdminFormSection>

          <AdminFormSection title="Line items">
            {mode === "create" ? (
              <div className="mb-3 flex flex-wrap justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={shortagesLoading || !effectiveStoreId}
                  onClick={() => fillLinesFromShortages()}
                >
                  {shortagesLoading ? "Loading…" : "Fill from stock shortages"}
                </Button>
              </div>
            ) : null}
            <PurchaseLinesEditor
              lines={lines}
              onChange={setLines}
              storeId={effectiveStoreId}
              vendorId={vendorId}
            />
          </AdminFormSection>

          <AdminFormSection title="Landed costs">
            <p className="mb-3 text-sm text-muted-foreground">
              Freight, duty, and other charges are allocated to each line by extended value
              (quantity × unit price) when stock is received.
            </p>
            <LandedCostsEditor
              rows={landedCosts}
              onChange={setLandedCosts}
              masterItems={landedMaster}
            />
          </AdminFormSection>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {!isModal ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Link href="/admin/purchase-orders" className={buttonVariants({ variant: "outline" })}>
                Cancel
              </Link>
              <Button disabled={pending} onClick={submit}>
                {pending ? "Saving…" : mode === "edit" ? "Save changes" : "Save & next"}
              </Button>
            </div>
          ) : null}
        </AdminFormModalLayout>
      </form>
    </AdminFormShell>
  );
}
