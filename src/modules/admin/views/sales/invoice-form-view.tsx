"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import type { CustomerErpProfile, SalesLineFormRow } from "@/common/erp/sales-types";
import { calcSalesLine, roundSalesMoney } from "@/common/erp/sales-types";
import { toDateInputValue } from "@/lib/format-date";
import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";
import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";
import { dispatchOutboxChanged } from "@/lib/sync/outbox-browser-events";
import { broadcastSyncWake } from "@/lib/sync/sync-network";
import { getOrCreateErpTerminalId } from "@/lib/sync/erp-terminal-id";
import { createOutboxStore } from "@/lib/sync/outbox-store";
import { OutboxEnqueueError } from "@/lib/sync/outbox-errors";
import { resolveOutboxUserId } from "@/lib/sync/resolve-outbox-user-id.client";
import { notifyErpLocalFormSaved } from "@/modules/erp/lib/erp-form-save-feedback.client";
import type { SalesInvoiceCreatePayload } from "@/modules/erp/types/sales-invoice-payload";
import type { SalesInvoiceUpdatePayload } from "@/modules/erp/types/sales-invoice-payload";
import { salesInvoiceResourceScope } from "@/modules/erp/types/sales-invoice-payload";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
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
import { getSalesLinesStockFeedback } from "@/modules/erp/lib/sales-line-stock-validation";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import type { CurrencySettings } from "@/lib/format-currency";
import type { LineProductContextMap } from "@/common/erp/line-product-context";
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
import { AdminCustomerFormView } from "@/modules/admin/views/admin-customer-form-view";
import { invalidateAdminCustomerSearchQueries } from "@/modules/erp/lib/entity-live-search.client";

function customerSelectLabel(profile: CustomerErpProfile): string {
  return (
    profile.companyName?.trim() ||
    profile.contactDisplayName?.trim() ||
    profile.name?.trim() ||
    profile.phone?.trim() ||
    profile.email?.trim() ||
    "Customer"
  );
}

export type InvoiceFormViewProps = ErpFormViewBaseProps & {
  mode: "create" | "edit";
  invoiceId?: string;
};

export function InvoiceFormView({
  mode,
  invoiceId,
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: InvoiceFormViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const formId = useId();
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [stockWarning, setStockWarning] = useState<string | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(mode === "edit");

  const { data: appSettings } = useQuery({
    queryKey: adminQueryKeys.appSettings(),
    queryFn: () =>
      adminGet<{ settings: CurrencySettings }>("settings").then((r) => r.settings),
    staleTime: 60_000,
  });
  const allowNegativeStoreStock = appSettings?.allow_negative_store_stock ?? false;
  const isModal = variant === "modal";

  const [customerId, setCustomerId] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");
  const [customerCreateOpen, setCustomerCreateOpen] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [discount, setDiscount] = useState(0);
  const [taxInclusive, setTaxInclusive] = useState(true);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<SalesLineFormRow[]>([]);

  useEffect(() => {
    const preselected = searchParams.get("customerId");
    if (preselected && mode === "create") setCustomerId(preselected);
  }, [searchParams, mode]);

  useEffect(() => {
    if (mode !== "edit" || !invoiceId) return;
    adminGet<{
      user_id: string;
      store_id: string | null;
      created_at: string;
      due_date: string | null;
      discount: number;
      tax_inclusive: boolean;
      notes: string | null;
      users: { name: string | null; email: string | null } | null;
      invoice_items: Array<{
        variant_id: string | null;
        product_name: string;
        description: string | null;
        quantity: number;
        unit_price: number;
        gst_rate: number;
        unit_id: string | null;
      }>;
    }>(`erp/invoices/${invoiceId}`)
      .then((detail) => {
        setCustomerId(detail.user_id);
        setCustomerLabel(detail.users?.name ?? detail.users?.email ?? "");
        if (detail.store_id) setStoreId(detail.store_id);
        setInvoiceDate(detail.created_at?.slice(0, 10) ?? invoiceDate);
        setDueDate(toDateInputValue(detail.due_date));
        setDiscount(Number(detail.discount ?? 0));
        setTaxInclusive(detail.tax_inclusive);
        setNotes(detail.notes ?? "");
        setLines(
          detail.invoice_items.map((item) => ({
            key: `line-${item.product_name}-${Math.random().toString(36).slice(2, 7)}`,
            productId: (item as { product_id?: string | null }).product_id ?? null,
            variantId: item.variant_id,
            productName: item.product_name,
            description: item.description ?? "",
            barcode: "",
            quantity: item.quantity,
            unitPrice: item.unit_price,
            taxRatePercent: item.gst_rate,
            unitId: item.unit_id,
          })),
        );
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load invoice"))
      .finally(() => setLoadingInvoice(false));
  }, [invoiceId, invoiceDate, mode]);

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
      router.push(invoiceId ? `/admin/erp/invoices/${invoiceId}` : "/admin/erp/invoices");
    }
  }

  async function handleCustomerCreated(savedId?: string) {
    setCustomerCreateOpen(false);
    if (!savedId) return;
    setCustomerId(savedId);
    try {
      const res = await adminGet<{ profile: CustomerErpProfile }>(
        `customers/${savedId}/erp`,
      );
      setCustomerLabel(customerSelectLabel(res.profile));
    } catch {
      setCustomerLabel("");
    }
    void invalidateAdminCustomerSearchQueries(queryClient);
  }

  function resetCreateForm() {
    setCustomerId("");
    setCustomerLabel("");
    const today = new Date().toISOString().slice(0, 10);
    setInvoiceDate(today);
    setDueDate(today);
    setDiscount(0);
    setTaxInclusive(true);
    setNotes("");
    setLines([]);
    setStockWarning(null);
    setError(null);
  }

  function handleSuccessNavigate(id?: string) {
    if (mode === "create") {
      resetCreateForm();
      onSuccess?.(id);
      if (!isModal) return;
      return;
    }
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(id);
      return;
    }
    router.push(id ? `/admin/erp/invoices/${id}` : "/admin/erp/invoices");
  }

  function handleSubmit(finalize: boolean) {
    setError(null);
    setStockWarning(null);
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
    if (finalize && totals.total <= 0) {
      setError("Enter line rates so the total is greater than zero before issuing.");
      return;
    }

    startTransition(async () => {
      try {
        if (finalize) {
          const productIds = [
            ...new Set(apiLines.map((line) => line.productId).filter(Boolean) as string[]),
          ];
          if (productIds.length > 0 && effectiveStoreId) {
            const stockCtx = await adminGet<{ data: LineProductContextMap }>(
              `erp/line-product-context?storeId=${encodeURIComponent(effectiveStoreId)}&productIds=${productIds.join(",")}`,
            );
            const feedback = getSalesLinesStockFeedback(
              lines,
              stockCtx.data ?? {},
              allowNegativeStoreStock,
            );
            if (feedback.blocking) {
              setError(feedback.blocking);
              return;
            }
            if (feedback.warning) {
              setStockWarning(feedback.warning);
            }
          } else if (apiLines.some((line) => !line.productId)) {
            setError("Each line must be linked to a product (use product search) before issuing.");
            return;
          }
        }

        const supabase = createSupabaseBrowserClient();
        const staffUserId = await resolveOutboxUserId(supabase);
        if (!staffUserId) {
          setError("You must be signed in to save an invoice.");
          return;
        }

        const store = createOutboxStore();
        try {
          if (invoiceId) {
            const updatePayload: SalesInvoiceUpdatePayload = {
              invoiceId,
              invoiceDate,
              dueDate: dueDate || invoiceDate,
              lines: apiLines,
              discount: coalesceNumber(discount),
              taxInclusive,
              notes: notes || undefined,
            };
            await store.enqueue({
              operationType: ERP_CLIENT_OPERATION_TYPES.salesInvoice.update,
              schemaVersion: 1,
              payload: updatePayload,
              userId: staffUserId,
              storeId: effectiveStoreId,
              terminalId: getOrCreateErpTerminalId(),
              resourceScope: salesInvoiceResourceScope(invoiceId),
            });
          } else {
            const createPayload: SalesInvoiceCreatePayload = {
              userId: customerId,
              invoiceDate,
              dueDate: dueDate || invoiceDate,
              lines: apiLines,
              discount: coalesceNumber(discount),
              taxInclusive,
              notes: notes || undefined,
              finalize,
            };
            await store.enqueue({
              operationType: ERP_CLIENT_OPERATION_TYPES.salesInvoice.create,
              schemaVersion: 1,
              payload: createPayload,
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
                : "Could not queue invoice locally.",
            );
          }
          return;
        } finally {
          await store.close();
        }

        notifyErpLocalFormSaved({
          entityLabel: "Sales invoice",
          mode: mode === "edit" ? "update" : "create",
          queuedForPost: finalize,
        });
        dispatchOutboxChanged();
        broadcastSyncWake();
        if (mode === "create") {
          handleSuccessNavigate();
        } else {
          handleSuccessNavigate(invoiceId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to queue invoice");
      }
    });
  }

  if (isModal && !open) return null;

  const title = mode === "edit" ? "Edit invoice" : "Create invoice";
  const backHref = invoiceId ? `/admin/erp/invoices/${invoiceId}` : "/admin/erp/invoices";

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
      </CardContent>
    </Card>
  );

  const footer = isModal ? (
    <>
      <Button type="button" variant="outline" onClick={handleCancel}>
        Cancel
      </Button>
      {mode === "create" ? (
        <Button variant="outline" disabled={pending} onClick={() => handleSubmit(false)}>
          Save as draft
        </Button>
      ) : null}
      <Button disabled={pending} onClick={() => handleSubmit(true)}>
        {pending ? "Saving…" : mode === "edit" ? "Update invoice" : "Save & next"}
      </Button>
    </>
  ) : undefined;

  return (
    <>
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Create or update a sales invoice with line items, tax, and payment terms."
      backHref={backHref}
      breadcrumb={[
        { label: "Invoices", href: "/admin/erp/invoices" },
        { label: title },
      ]}
      size="landscape"
      formId={formId}
      pending={pending}
      footer={footer}
      loading={loadingInvoice}
      loadingFallback={<AdminPageSkeleton />}
    >
      <form
        id={formId}
        className="space-y-4"
        autoComplete="off"
        onSubmit={(e) => e.preventDefault()}
      >
        <AdminFormModalLayout sidebar={totalsSidebar}>
          <AdminFormSection title="Invoice details">
            <AdminFormGrid cols={3}>
              <AdminFormField label="Customer" required className="sm:col-span-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <CustomerSearchSelect
                      value={customerId || null}
                      selectedLabel={customerLabel || undefined}
                      disabled={mode === "edit"}
                      onChange={(id, option) => {
                        setCustomerId(id ?? "");
                        setCustomerLabel(option?.label ?? "");
                      }}
                    />
                  </div>
                  {mode === "create" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0 whitespace-nowrap px-3"
                      onClick={() => setCustomerCreateOpen(true)}
                    >
                      <UserPlus className="size-4" />
                      Add customer
                    </Button>
                  ) : null}
                </div>
              </AdminFormField>
              <ErpDocumentNumberField kind="INV" enabled={mode === "create"} />
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
              <AdminFormField label="Invoice date">
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </AdminFormField>
              <AdminFormField label="Due date">
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </AdminFormField>
              <AdminFormField label="Notes" className="sm:col-span-2">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </AdminFormField>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={taxInclusive}
                  onChange={(e) => setTaxInclusive(e.target.checked)}
                />
                Item rates are tax inclusive
              </label>
            </AdminFormGrid>
          </AdminFormSection>

          <AdminFormSection title="Invoice items">
            <SalesLinesEditor
              lines={lines}
              onChange={setLines}
              storeId={effectiveStoreId}
              customerId={customerId}
              taxInclusive={taxInclusive}
              showSerial
            />
          </AdminFormSection>

          {stockWarning ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">{stockWarning}</p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {!isModal ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Link href={backHref} className={buttonVariants({ variant: "outline" })}>
                Cancel
              </Link>
              {mode === "create" ? (
                <Button variant="outline" disabled={pending} onClick={() => handleSubmit(false)}>
                  Save as draft
                </Button>
              ) : null}
              <Button disabled={pending} onClick={() => handleSubmit(true)}>
                {pending ? "Saving…" : mode === "edit" ? "Update invoice" : "Save & next"}
              </Button>
            </div>
          ) : null}
        </AdminFormModalLayout>
      </form>
    </AdminFormShell>

    {customerCreateOpen ? (
      <AdminCustomerFormView
        variant="modal"
        mode="create"
        open={customerCreateOpen}
        onOpenChange={setCustomerCreateOpen}
        modalStacked={isModal}
        onSuccess={handleCustomerCreated}
      />
    ) : null}
    </>
  );
}
