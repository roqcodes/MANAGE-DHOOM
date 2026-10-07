"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { adminGet, adminPost, adminPut } from "@/modules/admin/lib/admin-api-client";
import {
  AdminFormField,
  AdminFormGrid,
  AdminFormModalLayout,
  AdminFormSection,
  AdminFormShell,
  ErpDocumentNumberField,
  InvoiceSearchSelect,
  type ErpFormViewBaseProps,
} from "@/modules/admin/ui";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import {
  SalesLinesEditor,
  salesLinesToApiInput,
} from "@/modules/erp/components/sales-lines-editor";
import type { SalesLineFormRow } from "@/common/erp/sales-types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ActiveStoreFormField,
  useActiveStoreFormField,
} from "@/modules/erp/components/use-active-store-form-field";
import { formatCurrencyAmount } from "@/lib/format-currency";
import {
  CLOUDINARY_CONFIGURED,
  uploadImageToCloudinary,
} from "@/modules/products/lib/cloudinary-upload";

type InvoiceDetail = {
  id: string;
  invoice_number: string;
  user_id: string;
  store_id: string | null;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
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
};

type CreditNoteDetail = {
  id: string;
  credit_note_number: string;
  user_id: string;
  store_id: string;
  credit_note_date: string;
  reference: string | null;
  notes: string | null;
  status: string;
  attachment_url: string | null;
  source_invoice_id: string | null;
  users: { name: string | null; email: string | null } | null;
  source_invoice: { id: string; invoice_number: string } | null;
  erp_credit_note_lines: Array<{
    id: string;
    variant_id: string | null;
    product_name: string;
    quantity: number;
    unit_price: number;
    tax_rate_percent: number;
  }>;
};

function newLineKey() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export type CreditNoteFormViewProps = ErpFormViewBaseProps & {
  mode: "create" | "edit";
  creditNoteId?: string;
};

export function CreditNoteFormView({
  mode,
  creditNoteId,
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: CreditNoteFormViewProps) {
  const router = useRouter();
  const formId = useId();
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode });
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isModal = variant === "modal";

  const [creditNoteDate, setCreditNoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [restoreStock, setRestoreStock] = useState(true);
  const [lines, setLines] = useState<SalesLineFormRow[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [invoiceLabel, setInvoiceLabel] = useState("");
  const [sourceInvoice, setSourceInvoice] = useState<InvoiceDetail | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [creditNoteNumber, setCreditNoteNumber] = useState("");
  const [loading, setLoading] = useState(mode === "edit");
  const [skipInvoicePrefill, setSkipInvoicePrefill] = useState(mode === "edit");

  useEffect(() => {
    if (mode !== "edit" || !creditNoteId) return;
    adminGet<CreditNoteDetail>(`erp/credit-notes/${creditNoteId}`)
      .then((detail) => {
        if (detail.status !== "draft") {
          setError("Only draft credit notes can be edited");
          return;
        }
        setCreditNoteNumber(detail.credit_note_number);
        setStoreId(detail.store_id);
        setCreditNoteDate(detail.credit_note_date);
        setReference(detail.reference ?? "");
        setNotes(detail.notes ?? "");
        setAttachmentUrl(detail.attachment_url);
        setCustomerId(detail.user_id);
        setCustomerName(detail.users?.name ?? detail.users?.email ?? "");
        setSelectedInvoiceId(detail.source_invoice_id ?? "");
        setInvoiceLabel(detail.source_invoice?.invoice_number ?? "");
        setLines(
          detail.erp_credit_note_lines.map((line) => ({
            key: line.id,
            productId: (line as { product_id?: string | null }).product_id ?? null,
            variantId: line.variant_id,
            productName: line.product_name,
            description: "",
            barcode: "",
            quantity: Number(line.quantity),
            unitPrice: Number(line.unit_price),
            taxRatePercent: Number(line.tax_rate_percent),
            unitId: null,
          })),
        );
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load credit note");
      })
      .finally(() => {
        setLoading(false);
        setSkipInvoicePrefill(false);
      });
  }, [creditNoteId, mode]);

  useEffect(() => {
    if (!selectedInvoiceId || skipInvoicePrefill) {
      if (!selectedInvoiceId) setSourceInvoice(null);
      return;
    }
    adminGet<InvoiceDetail>(`erp/invoices/${selectedInvoiceId}`).then((detail) => {
      setSourceInvoice(detail);
      setCustomerId(detail.user_id);
      setCustomerName(detail.users?.name ?? detail.users?.email ?? "");
      setInvoiceLabel(detail.invoice_number);
      if (detail.store_id) setStoreId(detail.store_id);
      setReference(detail.invoice_number);
      setLines(
        detail.invoice_items.map((item) => ({
          key: newLineKey(),
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
    });
  }, [selectedInvoiceId, skipInvoicePrefill]);

  const lineTotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [lines],
  );

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/erp/credit-notes");
    }
  }

  function handleSuccessNavigate(id?: string) {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(id);
      return;
    }
    router.push(id ? `/admin/erp/credit-notes/${id}` : "/admin/erp/credit-notes");
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

  function handleSubmit(finalize: boolean) {
    setError(null);
    if (!customerId) {
      setError("Select a source invoice to load customer details");
      return;
    }
    if (!selectedInvoiceId) {
      setError("Source invoice is required");
      return;
    }
    if (!effectiveStoreId) {
      setError(storeRequiredMessage ?? "Store is required");
      return;
    }
    const apiLines = salesLinesToApiInput(lines);
    if (apiLines.length === 0) {
      setError("Add at least one refund line");
      return;
    }
    const refundTotal = lines.reduce((sum, line) => {
      const taxable = line.quantity * line.unitPrice;
      const tax = taxable * (line.taxRatePercent / 100);
      return sum + taxable + tax;
    }, 0);
    if (finalize && refundTotal <= 0) {
      setError("Enter line rates so the refund total is greater than zero before issuing.");
      return;
    }

    const payload = {
      userId: customerId,
      storeId: effectiveStoreId,
      creditNoteDate,
      lines: apiLines,
      reference: reference || sourceInvoice?.invoice_number || undefined,
      notes: notes || undefined,
      sourceInvoiceId: selectedInvoiceId,
      attachmentUrl: attachmentUrl ?? undefined,
    };

    startTransition(async () => {
      try {
        if (creditNoteId) {
          await adminPut(`erp/credit-notes/${creditNoteId}`, payload);
          if (finalize) {
            await adminPost(`erp/credit-notes/${creditNoteId}`, { restoreStock });
          }
          handleSuccessNavigate(creditNoteId);
        } else {
          const res = await adminPost<{ id: string }>("erp/credit-notes", {
            ...payload,
            finalize,
            restoreStock: finalize ? restoreStock : false,
          });
          handleSuccessNavigate(res.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save credit note");
      }
    });
  }

  if (isModal && !open) return null;

  const title = mode === "edit" ? "Edit credit note" : "Create credit note";
  const description = creditNoteNumber
    ? creditNoteNumber
    : "Issue a credit note against a source invoice. Customer and line items load from the invoice.";

  const invoiceSidebar = sourceInvoice ? (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-base">Invoice summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Invoice</span>
          <span className="font-medium">{sourceInvoice.invoice_number}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Total</span>
          <span className="tabular-nums">{formatCurrencyAmount(sourceInvoice.total_amount)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Paid</span>
          <span className="tabular-nums">{formatCurrencyAmount(sourceInvoice.amount_paid)}</span>
        </div>
        <div className="flex justify-between gap-3 border-t pt-3">
          <span className="font-medium">Balance due</span>
          <span className="font-semibold tabular-nums">
            {formatCurrencyAmount(sourceInvoice.balance_due)}
          </span>
        </div>
        <div className="flex justify-between gap-3 border-t pt-3">
          <span className="text-muted-foreground">Refund subtotal</span>
          <span className="tabular-nums">{formatCurrencyAmount(lineTotal)}</span>
        </div>
        <p className="border-t pt-3 text-xs text-muted-foreground">
          Adjust refund quantities below. The original invoice document is not edited; its balance is
          reduced when the credit note is saved.
        </p>
      </CardContent>
    </Card>
  ) : (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-base">Refund total</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal (ex tax)</span>
          <span className="font-semibold tabular-nums">{formatCurrencyAmount(lineTotal)}</span>
        </div>
      </CardContent>
    </Card>
  );

  const footer = isModal ? (
    <>
      <Button type="button" variant="outline" onClick={handleCancel}>
        Cancel
      </Button>
      <Button
        variant="outline"
        onClick={() => handleSubmit(false)}
        disabled={pending || uploading}
      >
        {pending ? "Savingâ€¦" : "Save as draft"}
      </Button>
      <Button onClick={() => handleSubmit(true)} disabled={pending || uploading}>
        {pending ? "Savingâ€¦" : mode === "edit" ? "Save & issue" : "Save credit note"}
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
      backHref="/admin/erp/credit-notes"
      breadcrumb={[
        { label: "Credit notes", href: "/admin/erp/credit-notes" },
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
        <AdminFormModalLayout sidebar={invoiceSidebar}>
          <AdminFormSection title="Credit note details">
            <AdminFormGrid cols={3}>
              <ErpDocumentNumberField
                kind="CN"
                value={creditNoteNumber}
                enabled={mode === "create"}
              />
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
              <AdminFormField label="Credit note date">
                <Input
                  type="date"
                  value={creditNoteDate}
                  onChange={(e) => setCreditNoteDate(e.target.value)}
                />
              </AdminFormField>
              <AdminFormField label="Reference">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Source invoice" required className="sm:col-span-2">
                <InvoiceSearchSelect
                  value={selectedInvoiceId || null}
                  selectedLabel={invoiceLabel || undefined}
                  storeId={effectiveStoreId || undefined}
                  onChange={(id, option) => {
                    setSelectedInvoiceId(id ?? "");
                    setInvoiceLabel(option?.label ?? "");
                    if (!id) {
                      setSourceInvoice(null);
                      setCustomerId("");
                      setCustomerName("");
                    }
                  }}
                />
              </AdminFormField>
              <AdminFormField label="Customer">
                <Input value={customerName || "Select an invoice"} readOnly />
              </AdminFormField>
              <AdminFormField label="Reason / notes" className="sm:col-span-2">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Attachment" className="sm:col-span-2">
                {CLOUDINARY_CONFIGURED ? (
                  <div className="space-y-2">
                    <Input
                      type="file"
                      accept="image/*"
                      disabled={uploading}
                      onChange={(e) => void handleAttachmentChange(e.target.files?.[0] ?? null)}
                    />
                    {attachmentUrl ? (
                      <a
                        href={attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        View uploaded attachment
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Cloudinary upload is not configured.</p>
                )}
              </AdminFormField>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={restoreStock}
                  onChange={(e) => setRestoreStock(e.target.checked)}
                />
                Restore stock on credit note
              </label>
            </AdminFormGrid>
          </AdminFormSection>

          <AdminFormSection title="Refund items">
            <SalesLinesEditor
              lines={lines}
              onChange={setLines}
              storeId={effectiveStoreId}
              customerId={customerId}
              showSerial
            />
          </AdminFormSection>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {!isModal ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Link href="/admin/erp/credit-notes" className={buttonVariants({ variant: "outline" })}>
                Cancel
              </Link>
              <Button
                variant="outline"
                onClick={() => handleSubmit(false)}
                disabled={pending || uploading}
              >
                {pending ? "Savingâ€¦" : "Save as draft"}
              </Button>
              <Button onClick={() => handleSubmit(true)} disabled={pending || uploading}>
                {pending ? "Savingâ€¦" : mode === "edit" ? "Save & issue" : "Save credit note"}
              </Button>
            </div>
          ) : null}
        </AdminFormModalLayout>
      </form>
    </AdminFormShell>
  );
}
