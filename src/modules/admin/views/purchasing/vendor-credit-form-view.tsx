"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Paperclip } from "lucide-react";

import type { PurchaseLineFormRow, PurchaseReceiveAdjustments } from "@/common/erp/purchasing-types";
import { calcPurchaseLine, roundMoney } from "@/common/erp/purchasing-types";
import { adminGet, adminPost, adminPut } from "@/modules/admin/lib/admin-api-client";
import {
  AdminFormField,
  AdminFormGrid,
  AdminFormModalLayout,
  AdminFormSection,
  AdminFormShell,
  ErpDocumentNumberField,
  PurchaseBillSearchSelect,
  VendorSearchSelect,
  type ErpFormViewBaseProps,
} from "@/modules/admin/ui";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ActiveStoreFormField,
  useActiveStoreFormField,
} from "@/modules/erp/components/use-active-store-form-field";
import {
  linesToApiInput,
  PurchaseLinesEditor,
} from "@/modules/purchasing/components/purchase-lines-editor";
import {
  CLOUDINARY_CONFIGURED,
  uploadImageToCloudinary,
} from "@/modules/products/lib/cloudinary-upload";
import { displayErpDocumentNumber } from "@/lib/erp-document-ref";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

type BillDetail = {
  id: string;
  vendor_id: string;
  store_id: string;
  purchase_bill_number: string;
  erp_purchase_bill_lines: Array<{
    id: string;
    variant_id: string | null;
    product_name: string;
    quantity: number;
    purchase_price: number;
    tax_rate_percent: number;
  }>;
};

function billLinesToForm(
  lines: BillDetail["erp_purchase_bill_lines"],
): PurchaseLineFormRow[] {
  return lines.map((line) => ({
    key: line.id,
    productId: (line as { product_id?: string | null }).product_id ?? null,
    variantId: line.variant_id,
    productName: line.product_name,
    barcode: "",
    expiryDate: "",
    quantity: Number(line.quantity),
    purchasePrice: Number(line.purchase_price),
    taxRatePercent: Number(line.tax_rate_percent),
  }));
}

function purchaseLinesToVendorCreditInput(lines: PurchaseLineFormRow[]) {
  return linesToApiInput(lines).map((line) => ({
    productId: line.productId,
    variantId: line.variantId,
    productName: line.productName,
    quantity: line.quantity,
    unitPrice: line.purchasePrice,
    taxRatePercent: line.taxRatePercent,
  }));
}

type VendorCreditDetail = {
  id: string;
  credit_number: string;
  vendor_id: string;
  store_id: string;
  credit_date: string;
  reference: string | null;
  notes: string | null;
  status: string;
  source_bill_id: string | null;
  erp_vendor_credit_lines: Array<{
    id: string;
    variant_id: string | null;
    product_name: string;
    quantity: number;
    unit_price: number;
    tax_rate_percent: number;
  }>;
};

export type VendorCreditFormViewProps = ErpFormViewBaseProps & {
  mode: "create" | "edit";
  creditId?: string;
};

export function VendorCreditFormView({
  mode,
  creditId,
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: VendorCreditFormViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formId = useId();
  const prefillBillId = searchParams.get("billId") ?? "";
  const prefillReceiveId = searchParams.get("receiveId") ?? "";
  const prefillKind = (searchParams.get("kind") ?? "all") as "shortfall" | "rejected" | "all";
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode });
  const isModal = variant === "modal";

  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(mode === "edit");

  const [vendorId, setVendorId] = useState("");
  const [vendorLabel, setVendorLabel] = useState("");
  const [sourceBillId, setSourceBillId] = useState(prefillBillId);
  const [billLabel, setBillLabel] = useState("");
  const [creditDate, setCreditDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [reduceStock, setReduceStock] = useState(true);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [creditNumber, setCreditNumber] = useState("");
  const [skipBillPrefill, setSkipBillPrefill] = useState(mode === "edit");
  const [lines, setLines] = useState<PurchaseLineFormRow[]>([]);

  useEffect(() => {
    if (!prefillBillId || mode !== "create") return;
    setSourceBillId(prefillBillId);
  }, [prefillBillId, mode]);

  useEffect(() => {
    if (mode !== "edit" || !creditId) return;
    adminGet<VendorCreditDetail>(`erp/vendor-credits/${creditId}`)
      .then((detail) => {
        if (detail.status !== "draft") {
          setError("Only draft vendor credits can be edited");
          return;
        }
        setCreditNumber(detail.credit_number);
        setVendorId(detail.vendor_id);
        setStoreId(detail.store_id);
        setCreditDate(detail.credit_date);
        setReference(detail.reference ?? "");
        setNotes(detail.notes ?? "");
        setSourceBillId(detail.source_bill_id ?? "");
        if (detail.erp_vendor_credit_lines.length > 0) {
          setLines(
            detail.erp_vendor_credit_lines.map((line) => ({
              key: line.id,
              productId: (line as { product_id?: string | null }).product_id ?? null,
              variantId: line.variant_id,
              productName: line.product_name,
              barcode: "",
              expiryDate: "",
              quantity: Number(line.quantity),
              purchasePrice: Number(line.unit_price),
              taxRatePercent: Number(line.tax_rate_percent),
            })),
          );
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load vendor credit");
      })
      .finally(() => {
        setLoading(false);
        setSkipBillPrefill(false);
      });
  }, [creditId, mode]);

  useEffect(() => {
    if (!sourceBillId || skipBillPrefill || prefillReceiveId) return;
    adminGet<{ bill: BillDetail }>(`erp/purchase-bills/${sourceBillId}`).then((res) => {
      const bill = res.bill;
      setVendorId(bill.vendor_id);
      setStoreId(bill.store_id);
      setReference(bill.purchase_bill_number);
      if (bill.erp_purchase_bill_lines.length > 0) {
        setLines(billLinesToForm(bill.erp_purchase_bill_lines));
      }
    });
  }, [sourceBillId, skipBillPrefill, prefillReceiveId]);

  useEffect(() => {
    if (!prefillReceiveId || mode !== "create") return;
    setSkipBillPrefill(true);
    Promise.all([
      adminGet<{
        receive: {
          vendor_id: string;
          store_id: string;
          purchase_bill_id: string | null;
          receive_number: string;
          id: string;
          erp_purchase_bills: { purchase_bill_number: string | null } | null;
        };
      }>(`erp/purchase-receives/${prefillReceiveId}`),
      adminGet<{ adjustments: PurchaseReceiveAdjustments }>(
        `erp/purchase-receives/${prefillReceiveId}/adjustments`,
      ),
    ])
      .then(([receiveRes, adjRes]) => {
        const receive = receiveRes.receive;
        const adjustments = adjRes.adjustments;
        setVendorId(receive.vendor_id);
        setStoreId(receive.store_id);
        if (receive.purchase_bill_id) {
          setSourceBillId(receive.purchase_bill_id);
          setBillLabel(receive.erp_purchase_bills?.purchase_bill_number ?? "");
        }
        const receiveLabel = displayErpDocumentNumber(
          receive.receive_number,
          "PR",
          receive.id,
        );
        setReference(receive.erp_purchase_bills?.purchase_bill_number ?? receiveLabel);
        setNotes(`Adjustment from purchase receive ${receiveLabel}`);

        const formLines: PurchaseLineFormRow[] = [];
        if (prefillKind === "shortfall" || prefillKind === "all") {
          for (const line of adjustments.shortfall_lines) {
            formLines.push({
              key: `shortfall-${line.bill_line_id}`,
              productId: line.product_id ?? null,
              variantId: line.variant_id,
              productName: line.product_name,
              barcode: "",
              expiryDate: "",
              quantity: Number(line.shortfall_qty),
              purchasePrice: Number(line.purchase_price),
              taxRatePercent: Number(line.tax_rate_percent),
            });
          }
        }
        if (prefillKind === "rejected" || prefillKind === "all") {
          for (const line of adjustments.rejected_lines) {
            formLines.push({
              key: `rejected-${line.product_name}-${line.rejected_qty}`,
              productId: line.product_id ?? null,
              variantId: line.variant_id,
              productName: line.product_name,
              barcode: "",
              expiryDate: "",
              quantity: Number(line.rejected_qty),
              purchasePrice: Number(line.purchase_price),
              taxRatePercent: Number(line.tax_rate_percent),
            });
          }
        }
        if (formLines.length > 0) {
          setLines(formLines);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to prefill from receive");
      });
  }, [prefillReceiveId, prefillKind, mode]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const line of lines) {
      const { taxable, taxAmount } = calcPurchaseLine(
        line.quantity,
        line.purchasePrice,
        line.taxRatePercent,
      );
      subtotal += taxable;
      tax += taxAmount;
    }
    return {
      subtotal: roundMoney(subtotal),
      tax: roundMoney(tax),
      total: roundMoney(subtotal + tax),
    };
  }, [lines]);

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/erp/vendor-credits");
    }
  }

  function handleSuccessNavigate(id?: string) {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(id);
      return;
    }
    router.push(id ? `/admin/erp/vendor-credits/${id}` : "/admin/erp/vendor-credits");
  }

  async function handleAttachmentChange(file: File | null) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await uploadImageToCloudinary(file);
      setAttachmentUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function submit(finalize: boolean) {
    setError(null);
    if (!vendorId) {
      setError("Supplier is required.");
      return;
    }
    if (!effectiveStoreId) {
      setError(storeRequiredMessage ?? "Store is required.");
      return;
    }

    const apiLines = purchaseLinesToVendorCreditInput(lines);
    if (apiLines.length === 0) {
      setError("Add at least one item with quantity and rate.");
      return;
    }
    if (finalize && totals.total <= 0) {
      setError("Enter line rates so the credit total is greater than zero before issuing.");
      return;
    }

    const noteParts = [notes.trim()];
    if (attachmentUrl) noteParts.push(`Attachment: ${attachmentUrl}`);
    const combinedNotes = noteParts.filter(Boolean).join("\n\n") || undefined;

    startTransition(async () => {
      try {
        const payload = {
          vendorId,
          storeId: effectiveStoreId,
          creditDate,
          sourceBillId: sourceBillId || undefined,
          reference: reference || undefined,
          notes: combinedNotes,
          lines: apiLines,
        };

        if (creditId) {
          await adminPut(`erp/vendor-credits/${creditId}`, payload);
          if (finalize) {
            await adminPost(`erp/vendor-credits/${creditId}`, { reduceStock });
          }
          handleSuccessNavigate(creditId);
        } else {
          const res = await adminPost<{ id: string }>("erp/vendor-credits", {
            ...payload,
            finalize,
            reduceStock: finalize ? reduceStock : false,
          });
          handleSuccessNavigate(res.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save vendor credit.");
      }
    });
  }

  if (isModal && !open) return null;

  const title = mode === "edit" ? "Edit vendor credit" : "New vendor credit";
  const description = creditNumber
    ? creditNumber
    : "Record supplier credits against purchase bills. Credits can auto-apply to the source bill when finalized.";

  const sidebar = (
    <Card className="h-fit border-border py-0 ring-0">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="text-sm font-semibold">Attachment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {CLOUDINARY_CONFIGURED ? (
          <label
            className={cn(
              "flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center transition-colors hover:bg-muted/40",
              uploading && "pointer-events-none opacity-60",
            )}
          >
            <Paperclip className="size-8 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium text-foreground">
              {uploading ? "Uploadingâ€¦" : "Drop file here or click to upload"}
            </span>
            <span className="text-xs text-muted-foreground">Images supported</span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => void handleAttachmentChange(e.target.files?.[0] ?? null)}
            />
          </label>
        ) : (
          <p className="text-sm text-muted-foreground">
            File upload is not configured. Add Cloudinary keys to enable attachments.
          </p>
        )}
        {attachmentUrl ? (
          <a
            href={attachmentUrl}
            target="_blank"
            rel="noreferrer"
            className="block text-sm text-primary hover:underline"
          >
            View uploaded attachment
          </a>
        ) : null}
        <div className="space-y-2 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{formatCurrencyAmount(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax</span>
            <span className="tabular-nums">{formatCurrencyAmount(totals.tax)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>Draft total</span>
            <span className="tabular-nums">{formatCurrencyAmount(totals.total)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const footer = isModal ? (
    <>
      <Button type="button" variant="outline" onClick={handleCancel}>
        Cancel
      </Button>
      <Button type="button" variant="outline" disabled={isPending} onClick={() => submit(false)}>
        {isPending ? "Savingâ€¦" : "Save as draft"}
      </Button>
      <Button type="button" disabled={isPending} onClick={() => submit(true)}>
        {isPending ? "Savingâ€¦" : "Save vendor credit"}
      </Button>
    </>
  ) : undefined;

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      backHref="/admin/erp/vendor-credits"
      breadcrumb={[
        { label: "Vendor credits", href: "/admin/erp/vendor-credits" },
        { label: title },
      ]}
      size="landscape"
      formId={formId}
      pending={isPending}
      footer={footer}
      loading={loading}
      loadingFallback={<AdminPageSkeleton />}
    >
      <form id={formId} className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        <AdminFormModalLayout sidebar={sidebar}>
          <AdminFormSection title="Credit details">
            <AdminFormGrid cols={3}>
              <AdminFormField label="Supplier" required className="sm:col-span-2">
                <VendorSearchSelect
                  value={vendorId || null}
                  selectedLabel={vendorLabel || undefined}
                  onChange={(id, option) => {
                    setVendorId(id ?? "");
                    setVendorLabel(option?.label ?? "");
                    setSourceBillId("");
                    setBillLabel("");
                  }}
                />
              </AdminFormField>
              <ErpDocumentNumberField kind="VC" value={creditNumber} enabled={mode === "create"} />
              <AdminFormField label="Vendor credit date">
                <Input type="date" value={creditDate} onChange={(e) => setCreditDate(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Reference number">
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Supplier reference"
                />
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
              <AdminFormField label="Source purchase bill" className="sm:col-span-2">
                <PurchaseBillSearchSelect
                  value={sourceBillId || null}
                  selectedLabel={billLabel || undefined}
                  vendorId={vendorId || undefined}
                  storeId={effectiveStoreId || undefined}
                  disabled={!vendorId}
                  onChange={(id, option) => {
                    setSourceBillId(id ?? "");
                    setBillLabel(option?.label ?? "");
                  }}
                />
                {sourceBillId ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    On finalize, this credit auto-applies to the selected bill up to its balance due.
                  </p>
                ) : null}
              </AdminFormField>
              <AdminFormField label="Notes" className="sm:col-span-2">
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes"
                />
              </AdminFormField>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={reduceStock}
                  onChange={(e) => setReduceStock(e.target.checked)}
                />
                Reduce stock for returned items (on finalize)
              </label>
            </AdminFormGrid>
          </AdminFormSection>

          <AdminFormSection title="Items">
            <PurchaseLinesEditor
              lines={lines}
              onChange={setLines}
              showSerial
              storeId={effectiveStoreId}
              vendorId={vendorId}
            />
          </AdminFormSection>

          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          {!isModal ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Link href="/admin/erp/vendor-credits" className={buttonVariants({ variant: "outline" })}>
                Cancel
              </Link>
              <Button type="button" variant="outline" disabled={isPending} onClick={() => submit(false)}>
                {isPending ? "Savingâ€¦" : "Save as draft"}
              </Button>
              <Button type="button" disabled={isPending} onClick={() => submit(true)}>
                {isPending ? "Savingâ€¦" : "Save vendor credit"}
              </Button>
            </div>
          ) : null}
        </AdminFormModalLayout>
      </form>
    </AdminFormShell>
  );
}
