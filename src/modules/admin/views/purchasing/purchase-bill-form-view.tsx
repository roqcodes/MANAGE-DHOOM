"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import type {
  ErpLandedCostItem,
  ErpPurchaseOrderDetail,
} from "@/common/erp/purchasing-types";
import { calcPurchaseLine, roundMoney } from "@/common/erp/purchasing-types";
import type { PurchaseLineFormRow, LandedCostFormRow } from "@/common/erp/purchasing-types";
import {
  linesToApiInput,
  PurchaseLinesEditor,
} from "@/modules/purchasing/components/purchase-lines-editor";
import {
  LandedCostsEditor,
  landedCostsToApiInput,
} from "@/modules/purchasing/components/landed-costs-editor";
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
  purchaseBillResourceScope,
  type PurchaseBillCreatePayload,
  type PurchaseBillUpdatePayload,
} from "@/modules/erp/types/purchase-payload";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import {
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
import {
  ActiveStoreFormField,
  useActiveStoreFormField,
} from "@/modules/erp/components/use-active-store-form-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { coalesceNumber } from "@/lib/numeric-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyAmount } from "@/lib/format-currency";

type BillDetail = {
  id: string;
  purchase_bill_number: string;
  vendor_id: string;
  vendors?: { name: string | null } | null;
  store_id: string;
  po_id: string | null;
  purchase_date: string;
  due_date: string | null;
  expected_delivery_date: string | null;
  vendor_bill_number: string | null;
  grn_reference: string | null;
  batch_reference: string | null;
  reference: string | null;
  notes: string | null;
  discount: number;
  status: string;
  physical_receipt_on_bill?: boolean;
  erp_purchase_bill_lines: Array<{
    id: string;
    variant_id: string | null;
    product_name: string;
    barcode: string | null;
    expiry_date: string | null;
    quantity: number;
    purchase_price: number;
    tax_rate_percent: number;
  }>;
  erp_purchase_bill_landed_costs: Array<{
    id: string;
    landed_cost_item_id: string | null;
    name: string;
    quantity: number;
    rate: number;
    tax_rate_percent: number;
  }>;
};

function poLandedCostsToForm(po: ErpPurchaseOrderDetail): LandedCostFormRow[] {
  return (po.purchase_order_landed_costs ?? []).map((lc) => ({
    key: lc.id,
    landedCostItemId: lc.landed_cost_item_id,
    name: lc.name,
    quantity: lc.quantity,
    rate: lc.rate,
    taxRatePercent: lc.tax_rate_percent,
  }));
}

function poLinesToForm(po: ErpPurchaseOrderDetail): PurchaseLineFormRow[] {
  return po.purchase_order_items.map((item) => ({
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
  }));
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export type PurchaseBillFormViewProps = ErpFormViewBaseProps & {
  mode: "create" | "edit";
  billId?: string;
  poIdFromQuery?: string;
};

export function PurchaseBillFormView({
  mode,
  billId,
  poIdFromQuery,
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: PurchaseBillFormViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formId = useId();
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [landedMaster, setLandedMaster] = useState<ErpLandedCostItem[]>([]);
  const [loading, setLoading] = useState(mode === "edit");
  const isModal = variant === "modal";

  const poIdParam = poIdFromQuery ?? searchParams.get("poId") ?? undefined;

  const [vendorId, setVendorId] = useState("");
  const [vendorLabel, setVendorLabel] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() =>
    addDays(new Date().toISOString().slice(0, 10), 30),
  );
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [poId, setPoId] = useState<string | null>(poIdParam ?? null);
  const [vendorBillNumber, setVendorBillNumber] = useState("");
  const [grnReference, setGrnReference] = useState("");
  const [batchReference, setBatchReference] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState(0);
  const [lines, setLines] = useState<PurchaseLineFormRow[]>([]);
  const [landedCosts, setLandedCosts] = useState<LandedCostFormRow[]>([]);
  const [billNumber, setBillNumber] = useState<string | null>(null);
  const [physicalReceiptOnBill, setPhysicalReceiptOnBill] = useState(true);
  const [poPrefillToken, setPoPrefillToken] = useState(0);

  useEffect(() => {
    if (mode === "create") {
      setDueDate(addDays(purchaseDate, 30));
    }
  }, [purchaseDate, mode]);

  useEffect(() => {
    adminGet<{ data: ErpLandedCostItem[] }>("erp/landed-costs").then((r) =>
      setLandedMaster(r.data ?? []),
    );
  }, []);

  useEffect(() => {
    if (mode !== "edit" || !billId) return;
    adminGet<{ bill: BillDetail }>(`erp/purchase-bills/${billId}`)
      .then((res) => {
        const bill = res.bill;
        setVendorId(bill.vendor_id);
        setVendorLabel(bill.vendors?.name ?? "");
        setStoreId(bill.store_id);
        setPurchaseDate(bill.purchase_date);
        setDueDate(bill.due_date ?? "");
        setExpectedDeliveryDate(bill.expected_delivery_date ?? "");
        setPoId(bill.po_id);
        setVendorBillNumber(bill.vendor_bill_number ?? "");
        setGrnReference(bill.grn_reference ?? "");
        setBatchReference(bill.batch_reference ?? "");
        setReference(bill.reference ?? "");
        setNotes(bill.notes ?? "");
        setDiscount(Number(bill.discount ?? 0));
        setPhysicalReceiptOnBill(bill.physical_receipt_on_bill ?? true);
        setBillNumber(bill.purchase_bill_number);
        setLines(
          bill.erp_purchase_bill_lines.length
            ? bill.erp_purchase_bill_lines.map((line) => ({
                key: line.id,
                productId: (line as { product_id?: string | null }).product_id ?? null,
                variantId: line.variant_id,
                productName: line.product_name,
                barcode: line.barcode ?? "",
                expiryDate: line.expiry_date ?? "",
                quantity: Number(line.quantity),
                purchasePrice: Number(line.purchase_price),
                taxRatePercent: Number(line.tax_rate_percent),
              }))
            : [],
        );
        setLandedCosts(
          bill.erp_purchase_bill_landed_costs.map((lc) => ({
            key: lc.id,
            landedCostItemId: lc.landed_cost_item_id,
            name: lc.name,
            quantity: Number(lc.quantity),
            rate: Number(lc.rate),
            taxRatePercent: Number(lc.tax_rate_percent),
          })),
        );
      })
      .finally(() => setLoading(false));
  }, [billId, mode]);

  useEffect(() => {
    if (mode !== "create" || !poIdParam) return;
    adminGet<{ po: ErpPurchaseOrderDetail }>(`erp/purchase-orders/${poIdParam}`).then((res) => {
      const po = res.po;
      setVendorId(po.vendor_id ?? po.vendors?.id ?? "");
      setVendorLabel(po.vendors?.name ?? "");
      setStoreId(po.store_id ?? "");
      setPoId(po.id);
      setExpectedDeliveryDate(po.expected_delivery_date ?? "");
      setReference(po.reference ?? "");
      setNotes(po.notes ?? "");
      setDiscount(po.discount ?? 0);
      if (po.purchase_order_items.length) setLines(poLinesToForm(po));
      setLandedCosts(poLandedCostsToForm(po));
    });
  }, [mode, poIdParam, poPrefillToken, setStoreId]);

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
      router.push("/admin/erp/purchase-bills");
    }
  }

  function resetCreateForm() {
    const today = new Date().toISOString().slice(0, 10);
    setVendorId("");
    setVendorLabel("");
    setPurchaseDate(today);
    setDueDate(addDays(today, 30));
    setExpectedDeliveryDate("");
    setPoId(poIdParam ?? null);
    setVendorBillNumber("");
    setGrnReference("");
    setBatchReference("");
    setReference("");
    setNotes("");
    setDiscount(0);
    setLines([]);
    setLandedCosts([]);
    setBillNumber(null);
    setPhysicalReceiptOnBill(true);
    setError(null);
  }

  function handleSuccessNavigate(id?: string) {
    if (mode === "create") {
      resetCreateForm();
      if (poIdParam) setPoPrefillToken((t) => t + 1);
      onSuccess?.(id);
      return;
    }
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(id);
      return;
    }
    router.push(id ? `/admin/erp/purchase-bills/${id}` : "/admin/erp/purchase-bills");
  }

  function submit(finalize: boolean) {
    setError(null);
    const shouldFinalize = finalize && !poId;
    const apiLines = linesToApiInput(lines);
    if (!vendorId || !effectiveStoreId) {
      setError(
        !effectiveStoreId
          ? (storeRequiredMessage ?? "Select a store using the header switcher before saving.")
          : "Vendor and store are required",
      );
      return;
    }
    if (!apiLines.length) {
      setError("Add at least one valid line item");
      return;
    }
    if (shouldFinalize && totals.total <= 0) {
      setError("Enter line rates so the grand total is greater than zero before finalizing.");
      return;
    }

    const payload = {
      vendorId,
      storeId: effectiveStoreId,
      purchaseDate,
      dueDate: dueDate || null,
      expectedDeliveryDate: expectedDeliveryDate || null,
      poId,
      vendorBillNumber: vendorBillNumber || null,
      grnReference: grnReference || null,
      batchReference: batchReference || null,
      reference: reference || null,
      notes: notes || null,
      lines: apiLines,
      landedCosts: landedCostsToApiInput(landedCosts),
      discount: coalesceNumber(discount),
      finalize: shouldFinalize,
      physicalReceiptOnBill: poId ? false : physicalReceiptOnBill,
    };

    startTransition(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const staffUserId = await resolveOutboxUserId(supabase);
        if (!staffUserId) {
          setError("You must be signed in to save a purchase bill.");
          return;
        }

        const store = createOutboxStore();
        try {
          if (billId) {
            const updatePayload: PurchaseBillUpdatePayload = { ...payload, billId };
            await store.enqueue({
              operationType: ERP_CLIENT_OPERATION_TYPES.purchaseBill.update,
              schemaVersion: 1,
              payload: updatePayload,
              userId: staffUserId,
              storeId: effectiveStoreId,
              terminalId: getOrCreateErpTerminalId(),
              resourceScope: purchaseBillResourceScope(billId),
            });
          } else {
            await store.enqueue({
              operationType: ERP_CLIENT_OPERATION_TYPES.purchaseBill.create,
              schemaVersion: 1,
              payload: payload as PurchaseBillCreatePayload,
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
                : "Could not save purchase bill locally.",
            );
          }
          return;
        } finally {
          await store.close();
        }

        notifyErpLocalFormSaved({
          entityLabel: "Purchase bill",
          mode: billId ? "update" : "create",
          queuedForPost: shouldFinalize,
        });
        dispatchOutboxChanged();
        broadcastSyncWake();
        handleSuccessNavigate(billId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  if (isModal && !open) return null;

  const title = mode === "edit" ? "Edit purchase bill" : "Purchase entry";
  const description = billNumber ?? "Record vendor bills, line items, and landed costs.";

  const totalsSidebar = (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Total</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatCurrencyAmount(totals.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tax</span>
          <span>{formatCurrencyAmount(totals.tax)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Landed</span>
          <span>{formatCurrencyAmount(totals.landed)}</span>
        </div>
        <div className="space-y-1 border-t pt-3">
          <AdminFormField label="Discount">
            <NumericInput
              min={0}
              value={discount}
              onValueChange={setDiscount}
            />
          </AdminFormField>
        </div>
        <div className="flex justify-between border-t pt-3 font-semibold">
          <span>Grand total</span>
          <span>{formatCurrencyAmount(totals.total)}</span>
        </div>
      </CardContent>
    </Card>
  );

  const footer = isModal ? (
    <>
      <Button type="button" variant="outline" onClick={handleCancel}>
        Cancel
      </Button>
      {mode === "create" ? (
        <>
          <Button variant="outline" disabled={pending} onClick={() => submit(false)}>
            Save draft
          </Button>
          {!poId ? (
            <Button disabled={pending} onClick={() => submit(true)}>
              Save & next
            </Button>
          ) : null}
        </>
      ) : (
        <Button disabled={pending} onClick={() => submit(false)}>
          Save changes
        </Button>
      )}
    </>
  ) : undefined;

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      backHref="/admin/erp/purchase-bills"
      breadcrumb={[
        { label: "Purchase bills", href: "/admin/erp/purchase-bills" },
        { label: title },
      ]}
      size="landscape"
      formId={formId}
      pending={pending}
      footer={footer}
      loading={loading}
      loadingFallback={<AdminPageSkeleton />}
    >
      <form id={formId} className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        <AdminFormModalLayout sidebar={totalsSidebar}>
          <AdminFormSection title="Purchase header">
            <AdminFormGrid cols={3}>
              <ErpDocumentNumberField kind="PB" value={billNumber} enabled={mode === "create"} />
              <AdminFormField label="Supplier" required>
                <VendorSearchSelect
                  value={vendorId || null}
                  selectedLabel={vendorLabel || undefined}
                  disabled={Boolean(poId)}
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
              <AdminFormField label="Purchase date">
                <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Due date">
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Expected delivery">
                <Input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                />
              </AdminFormField>
              <AdminFormField label="Vendor bill number">
                <Input value={vendorBillNumber} onChange={(e) => setVendorBillNumber(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="GRN reference">
                <Input value={grnReference} onChange={(e) => setGrnReference(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Batch reference">
                <Input value={batchReference} onChange={(e) => setBatchReference(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="PO link">
                <Input
                  value={poId ?? ""}
                  onChange={(e) => setPoId(e.target.value || null)}
                  placeholder="PO id (optional)"
                />
              </AdminFormField>
              <AdminFormField label="Reference">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Notes" className="sm:col-span-2">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </AdminFormField>
              {!poId ? (
                <div className="flex items-start gap-3 sm:col-span-2">
                  <Checkbox
                    id={`${formId}-mark-received`}
                    checked={physicalReceiptOnBill}
                    onCheckedChange={(v) => setPhysicalReceiptOnBill(v === true)}
                  />
                  <div className="grid gap-1">
                    <Label htmlFor={`${formId}-mark-received`} className="font-normal">
                      Mark items as received
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      When finalized, increases store stock on this bill (Zoho-style). Turn off if
                      you will record a purchase receive after the vendor invoice arrives.
                    </p>
                  </div>
                </div>
              ) : null}
            </AdminFormGrid>
          </AdminFormSection>

          <AdminFormSection title="Purchase items">
            <PurchaseLinesEditor
              lines={lines}
              onChange={setLines}
              showExpiry
              storeId={effectiveStoreId}
              vendorId={vendorId}
            />
          </AdminFormSection>

          <AdminFormSection title="Landed costs">
            <LandedCostsEditor rows={landedCosts} onChange={setLandedCosts} masterItems={landedMaster} />
          </AdminFormSection>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          {!isModal ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Link href="/admin/erp/purchase-bills" className={buttonVariants({ variant: "outline" })}>
                Cancel
              </Link>
              {mode === "create" ? (
                <>
                  <Button variant="outline" disabled={pending} onClick={() => submit(false)}>
                    Save draft
                  </Button>
                  <Button disabled={pending} onClick={() => submit(true)}>
                    Save & next
                  </Button>
                </>
              ) : (
                <Button disabled={pending} onClick={() => submit(false)}>
                  Save
                </Button>
              )}
            </div>
          ) : null}
        </AdminFormModalLayout>
      </form>
    </AdminFormShell>
  );
}
