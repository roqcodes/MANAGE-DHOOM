"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { SalesLineFormRow } from "@/common/erp/sales-types";
import { calcSalesLine, roundSalesMoney } from "@/common/erp/sales-types";
import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";
import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";
import { dispatchOutboxChanged } from "@/lib/sync/outbox-browser-events";
import { broadcastSyncWake } from "@/lib/sync/sync-network";
import { getOrCreateErpTerminalId } from "@/lib/sync/erp-terminal-id";
import { createOutboxStore } from "@/lib/sync/outbox-store";
import { OutboxEnqueueError } from "@/lib/sync/outbox-errors";
import { resolveOutboxUserId } from "@/lib/sync/resolve-outbox-user-id.client";
import { notifyErpLocalFormSaved } from "@/modules/erp/lib/erp-form-save-feedback.client";
import type { SalesOrderCreatePayload } from "@/modules/orders/types/sales-order-create-payload";
import type { SalesOrderUpdatePayload } from "@/modules/orders/types/sales-order-update-payload";
import { salesOrderResourceScope } from "@/modules/orders/types/sales-order-update-payload";
import type { SalesOrderDetail } from "@/modules/orders/services/sales-order-detail.service";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import {
  AdminFormActions,
  AdminFormField,
  AdminFormGrid,
  AdminFormModalLayout,
  AdminFormSection,
  AdminFormShell,
  applyFieldValidation,
  CustomerSearchSelect,
  ErpDocumentNumberField,
  type ErpFormViewBaseProps,
  useFormFieldValidation,
} from "@/modules/admin/ui";
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
import { SalesmanPinField } from "@/modules/erp/components/salesman-pin-field";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";
import {
  AdminFormSkeleton,
  AdminPageSkeleton,
} from "@/modules/admin/components/admin-page-skeleton";

export type SalesOrderFormViewProps = ErpFormViewBaseProps & {
  mode?: "create" | "edit";
  orderId?: string;
};

export function SalesOrderFormView({
  mode = "create",
  orderId,
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: SalesOrderFormViewProps) {
  const router = useRouter();
  const formId = useId();
  const isEdit = mode === "edit" && Boolean(orderId);
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode: isEdit ? "edit" : "create" });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | string[] | null>(null);
  const fieldValidation = useFormFieldValidation();
  const [loadingOrder, setLoadingOrder] = useState(isEdit);
  const isModal = variant === "modal";

  const [customerId, setCustomerId] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [shipmentDate, setShipmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [salesmanPin, setSalesmanPin] = useState("");
  const [salesPersonId, setSalesPersonId] = useState<string | null>(null);
  const salesmanPinValid = Boolean(salesPersonId);
  const [discount, setDiscount] = useState(0);
  const [taxInclusive, setTaxInclusive] = useState(true);
  const [lines, setLines] = useState<SalesLineFormRow[]>([]);
  const [createSession, setCreateSession] = useState(0);

  useEffect(() => {
    if (!isEdit || !orderId) return;

    adminGet<{ order: SalesOrderDetail }>(`erp/sales-orders/${orderId}`)
      .then(({ order }) => {
        setCustomerId(order.user_id);
        setCustomerLabel(
          order.users?.name ?? order.users?.email ?? order.users?.phone ?? "",
        );
        setStoreId(order.store_id);
        setReferenceNumber(order.reference_number ?? "");
        setShipmentDate(order.shipment_date ?? new Date().toISOString().slice(0, 10));
        setDeliveryMethod(order.delivery_method ?? "");
        setDiscount(Number(order.discount ?? 0));
        setTaxInclusive(order.tax_inclusive);
        setLines(
          order.order_items.length > 0
            ? order.order_items.map((item) => ({
                key: `line-${item.id}`,
                productId: item.product_id,
                variantId: null,
                productName: item.product_name ?? "",
                description: "",
                barcode: "",
                quantity: item.quantity,
                unitPrice: item.final_price ?? item.price,
                taxRatePercent: item.tax_rate_percent,
                unitId: null,
              }))
            : [],
        );
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load sales order");
      })
      .finally(() => setLoadingOrder(false));
  }, [isEdit, orderId, setStoreId]);

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

  const detailHref = orderId ? `/admin/erp/sales-orders/${orderId}` : "/admin/erp/sales-orders";

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push(isEdit ? detailHref : "/admin/erp/sales-orders");
    }
  }

  function resetCreateForm() {
    setCustomerId("");
    setCustomerLabel("");
    setReferenceNumber("");
    setOrderDate(new Date().toISOString().slice(0, 10));
    setShipmentDate(new Date().toISOString().slice(0, 10));
    setDeliveryMethod("");
    setSalesmanPin("");
    setSalesPersonId(null);
    setDiscount(0);
    setTaxInclusive(true);
    setLines([]);
    setError(null);
    setCreateSession((n) => n + 1);
  }

  function handleSuccessNavigate() {
    if (!isEdit) {
      onSuccess?.();
      resetCreateForm();
      return;
    }
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(orderId);
    } else {
      router.push(detailHref);
    }
  }

  function handleSubmit() {
    setError(null);
    const apiLines = salesLinesToApiInput(lines);
    const items = apiLines
      .filter((l) => l.productId)
      .map((l) => ({
        productId: l.productId as string,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRatePercent: l.taxRatePercent,
      }));
    const lineWithoutPrice = items.find((i) => !i.unitPrice || i.unitPrice <= 0);
    const validationMessages = applyFieldValidation(
      [
        { key: "customer", ok: Boolean(customerId), message: "Customer is required." },
        {
          key: "store",
          ok: Boolean(effectiveStoreId),
          message: storeRequiredMessage ?? "Store is required.",
        },
        { key: "lines", ok: apiLines.length > 0, message: "Add at least one item." },
        {
          key: "lines",
          ok: items.length > 0,
          message: "Select products from catalog search.",
        },
        {
          key: "lines",
          ok: !lineWithoutPrice,
          message:
            "Each line needs a unit price above zero. Enter a price on the line or set the product's catalog selling price.",
        },
        {
          key: "salesmanPin",
          ok: Boolean(salesPersonId),
          message: "Enter a valid salesman PIN.",
        },
      ],
      fieldValidation.markFieldValidationFailed,
      fieldValidation.clearFieldValidation,
    );
    if (validationMessages) {
      setError(
        validationMessages.length === 1 ? validationMessages[0] : validationMessages,
      );
      return;
    }

    startTransition(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const staffUserId = await resolveOutboxUserId(supabase);
        if (!staffUserId) {
          setError("You must be signed in to save a sales order.");
          return;
        }

        const basePayload: SalesOrderCreatePayload = {
          userId: customerId,
          referenceNumber: referenceNumber || undefined,
          shipmentDate: shipmentDate || undefined,
          deliveryMethod: deliveryMethod || undefined,
          salesPersonId: salesPersonId!,
          subtotal: totals.subtotal,
          tax: totals.tax,
          discount: coalesceNumber(discount),
          totalAmount: totals.total,
          taxInclusive,
          items,
        };

        const store = createOutboxStore();
        try {
          if (isEdit && orderId) {
            const updatePayload: SalesOrderUpdatePayload = {
              ...basePayload,
              orderId,
            };
            await store.enqueue({
              operationType: ERP_CLIENT_OPERATION_TYPES.salesOrder.update,
              schemaVersion: 1,
              payload: updatePayload,
              userId: staffUserId,
              storeId: effectiveStoreId,
              terminalId: getOrCreateErpTerminalId(),
              resourceScope: salesOrderResourceScope(orderId),
            });
          } else {
            await store.enqueue({
              operationType: ERP_CLIENT_OPERATION_TYPES.salesOrder.create,
              schemaVersion: 1,
              payload: basePayload,
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
                : "Could not save sales order locally. Check browser storage.",
            );
          }
          return;
        } finally {
          await store.close();
        }

        notifyErpLocalFormSaved({
          entityLabel: "Sales order",
          mode: isEdit ? "update" : "create",
        });
        dispatchOutboxChanged();
        broadcastSyncWake();
        handleSuccessNavigate();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to queue sales order");
      }
    });
  }

  if (isModal && !open) return null;

  const title = isEdit ? "Edit sales order" : "Add sales order";

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
          <Label>Discount</Label>
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
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={taxInclusive}
            onChange={(e) => setTaxInclusive(e.target.checked)}
          />
          Tax inclusive rates
        </label>
      </CardContent>
    </Card>
  );

  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel={isEdit ? "Save changes" : "Save & next"}
      pending={pending}
      submitDisabled={!salesmanPinValid}
      loadingLabel="Saving locally…"
    />
  ) : undefined;

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Create a sales order with line items, shipment details, and pricing."
      backHref={isEdit ? detailHref : "/admin/erp/sales-orders"}
      breadcrumb={[
        { label: "Sales orders", href: "/admin/erp/sales-orders" },
        ...(isEdit ? [{ label: "Order", href: detailHref }] : []),
        { label: title },
      ]}
      size="landscape"
      formId={formId}
      pending={pending}
      footer={footer}
      loading={loadingOrder}
      loadingFallback={isModal ? <AdminFormSkeleton /> : <AdminPageSkeleton />}
    >
      <form
        id={formId}
        className="space-y-4"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <AdminFormModalLayout sidebar={totalsSidebar}>
          <AdminFormSection title="Sales order details">
            <AdminFormGrid cols={3}>
              <AdminFormField label="Customer" required fieldKey="customer" className="sm:col-span-2">
                <CustomerSearchSelect
                  key={createSession}
                  value={customerId || null}
                  selectedLabel={customerLabel || undefined}
                  invalid={fieldValidation.isFieldInvalid("customer")}
                  onChange={(id, option) => {
                    setCustomerId(id ?? "");
                    setCustomerLabel(option?.label ?? "");
                  }}
                />
              </AdminFormField>
              <ErpDocumentNumberField kind="SO" resetToken={createSession} />
              <AdminFormField label="Reference number">
                <Input
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                />
              </AdminFormField>
              <AdminFormField label="Sales order date">
                <Input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
              </AdminFormField>
              <AdminFormField label="Shipment date">
                <Input
                  type="date"
                  value={shipmentDate}
                  onChange={(e) => setShipmentDate(e.target.value)}
                />
              </AdminFormField>
              <AdminFormField label="Delivery method">
                <Input
                  placeholder="Delivery method"
                  value={deliveryMethod}
                  onChange={(e) => setDeliveryMethod(e.target.value)}
                />
              </AdminFormField>
              <SalesmanPinField
                value={salesmanPin}
                onChange={setSalesmanPin}
                onSalesmanChange={(s) => setSalesPersonId(s?.id ?? null)}
                submitInvalid={fieldValidation.isFieldInvalid("salesmanPin")}
              />
              <AdminFormField label="Store" required fieldKey="store">
                <ActiveStoreFormField
                  mode={isEdit ? "edit" : "create"}
                  stores={stores}
                  activeStoreId={activeStoreId}
                  storeId={storeId}
                  onStoreIdChange={setStoreId}
                  label=""
                  invalid={fieldValidation.isFieldInvalid("store")}
                />
              </AdminFormField>
            </AdminFormGrid>
          </AdminFormSection>

          <AdminFormSection
            title="Order items"
            className={
              fieldValidation.isFieldInvalid("lines") ? "ring-2 ring-destructive/60" : undefined
            }
          >
            <SalesLinesEditor
              key={createSession}
              lines={lines}
              onChange={setLines}
              storeId={effectiveStoreId}
              customerId={customerId}
              taxInclusive={taxInclusive}
              showSerial
            />
          </AdminFormSection>

          <ErrorsFeedbackBridge errors={error} />

          {!isModal ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Link href="/admin/erp/sales-orders" className={buttonVariants({ variant: "outline" })}>
                Cancel
              </Link>
              <Button variant="outline" disabled>
                Save as draft
              </Button>
              <Button disabled={pending || !salesmanPinValid} onClick={handleSubmit}>
                {pending ? "Saving locally…" : "Save & next"}
              </Button>
            </div>
          ) : null}
        </AdminFormModalLayout>
      </form>
    </AdminFormShell>
  );
}

