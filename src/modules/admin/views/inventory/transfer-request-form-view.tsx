"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import type { ErpSalesProductSearchRow } from "@/common/erp/sales-types";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import {
  AdminFormColumns,
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  AdminFormShell,
  applyFieldValidation,
  ErpDocumentNumberField,
  ProductLiveSearch,
  type ErpFormViewBaseProps,
  useFormFieldValidation,
} from "@/modules/admin/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { StoreSelect, useErpStores } from "@/modules/erp/components/use-erp-stores";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";

type RequestLine = {
  key: string;
  productId: string;
  productName: string;
  quantity: number;
  sourceAvailable: number;
  transferPrice: number;
  salesPrice: number;
  averagePurchaseCost: number;
};

function newKey() {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export type TransferRequestFormViewProps = ErpFormViewBaseProps;

export function TransferRequestFormView({
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: TransferRequestFormViewProps) {
  const router = useRouter();
  const { stores } = useErpStores();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | string[] | null>(null);
  const fieldValidation = useFormFieldValidation();
  const isModal = variant === "modal";

  const [fromStoreId, setFromStoreId] = useState("");
  const [toStoreId, setToStoreId] = useState("");
  const [requestDate, setRequestDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<RequestLine[]>([]);

  useEffect(() => {
    if (!fromStoreId || lines.length === 0) return;
    const productIds = [...new Set(lines.map((line) => line.productId).filter(Boolean))];
    if (productIds.length === 0) return;
    void adminGet<{ stocks: Record<string, number> }>(
      `erp/store-stock?storeId=${fromStoreId}&productIds=${productIds.join(",")}`,
    ).then((stockRes) => {
      const stocks = stockRes.stocks ?? {};
      setLines((prev) =>
        prev.map((line) =>
          stocks[line.productId] != null
            ? { ...line, sourceAvailable: stocks[line.productId] }
            : line,
        ),
      );
    });
  }, [fromStoreId]);

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/erp/transfer-requests");
    }
  }

  function handleSuccessNavigate(id: string) {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(id);
      return;
    }
    router.push(`/admin/erp/transfer-requests/${id}`);
  }

  async function addLine(row: ErpSalesProductSearchRow) {
    if (!fromStoreId) {
      setError("Select the supplying store first.");
      return;
    }
    const stockRes = await adminGet<{ stock: number }>(
      `erp/store-stock?storeId=${fromStoreId}&productId=${row.id}`,
    );
    const sourceAvailable = stockRes.stock;
    setLines([
      ...lines,
      {
        key: newKey(),
        productId: row.id,
        productName: row.product_name,
        quantity: 1,
        sourceAvailable,
        transferPrice: row.purchase_price ?? 0,
        salesPrice: row.sales_price ?? 0,
        averagePurchaseCost: row.purchase_price ?? 0,
      },
    ]);
  }

  function handleSubmit(submit: boolean) {
    setError(null);
    const overStockLine = lines.find((line) => line.quantity > line.sourceAvailable);
    const validationMessages = applyFieldValidation(
      [
        {
          key: "stores",
          ok: Boolean(fromStoreId && toStoreId && fromStoreId !== toStoreId),
          message: "Valid from/to stores required.",
        },
        { key: "lines", ok: lines.length > 0, message: "Add at least one item." },
        {
          key: "lines",
          ok: !overStockLine,
          message: overStockLine
            ? `Quantity exceeds available stock for ${overStockLine.productName}.`
            : "",
        },
      ].filter((c) => c.message !== ""),
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
        const res = await adminPost<{ id: string }>("erp/transfer-requests", {
          fromStoreId,
          toStoreId,
          requestDate,
          note: note || undefined,
          submit,
          lines: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            sourceAvailable: l.sourceAvailable,
            transferPrice: l.transferPrice,
            salesPrice: l.salesPrice,
            averagePurchaseCost: l.averagePurchaseCost,
          })),
        });
        handleSuccessNavigate(res.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  if (isModal && !open) return null;

  const title = "New transfer request";
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  const footer = isModal ? (
    <>
      <Button type="button" variant="outline" onClick={handleCancel}>
        Cancel
      </Button>
      <Button type="button" disabled={pending} onClick={() => handleSubmit(false)}>
        Save draft
      </Button>
      <Button type="button" disabled={pending} onClick={() => handleSubmit(true)}>
        {pending ? "Savingâ€¦" : "Submit request"}
      </Button>
    </>
  ) : undefined;

  const sections = (
    <AdminFormColumns cols={2}>
      <AdminFormSection title="Request details">
        <AdminFormGrid cols={2}>
          <ErpDocumentNumberField kind="TR" />
          <AdminFormField label="Supplying store (has stock)" required fieldKey="stores">
            <StoreSelect value={fromStoreId} onChange={setFromStoreId} stores={stores} label="" />
          </AdminFormField>
          <AdminFormField label="Requesting store (needs stock)" required fieldKey="stores">
            <StoreSelect value={toStoreId} onChange={setToStoreId} stores={stores} label="" />
          </AdminFormField>
          <AdminFormField label="Request date">
            <Input
              type="date"
              value={requestDate}
              onChange={(e) => setRequestDate(e.target.value)}
            />
          </AdminFormField>
          <AdminFormField label="Notes" className="sm:col-span-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </AdminFormField>
        </AdminFormGrid>
      </AdminFormSection>

      <AdminFormSection
        title="Items"
        className={
          fieldValidation.isFieldInvalid("lines") ? "ring-2 ring-destructive/60" : undefined
        }
      >
        <ProductLiveSearch
          catalog="sales"
          storeId={fromStoreId}
          placeholder="Search product…"
          disabled={!fromStoreId}
          onSelect={(row) => addLine(row as ErpSalesProductSearchRow)}
        />
        {!fromStoreId ? (
          <p className="text-sm text-muted-foreground">
            Select the supplying store to search items and view its on-hand stock.
          </p>
        ) : null}
        {lines.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Available</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Transfer price</th>
                  <th className="px-3 py-2">Sales price</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.key} className="border-t">
                    <td className="px-3 py-2">{line.productName}</td>
                    <td className="px-3 py-2">{line.sourceAvailable}</td>
                    <td className="px-3 py-2">
                      <NumericInput
                        min={0}
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
                      <NumericInput
                        min={0}
                        value={line.transferPrice}
                        onValueChange={(transferPrice) =>
                          setLines(
                            lines.map((l) =>
                              l.key === line.key ? { ...l, transferPrice } : l,
                            ),
                          )
                        }
                        className="w-24"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <NumericInput
                        min={0}
                        value={line.salesPrice}
                        onValueChange={(salesPrice) =>
                          setLines(
                            lines.map((l) =>
                              l.key === line.key ? { ...l, salesPrice } : l,
                            ),
                          )
                        }
                        className="w-24"
                      />
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
        <p className="text-sm text-muted-foreground">Total quantity: {totalQty}</p>
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
      description="Request stock from a supplying store to fulfill inventory needs."
      backHref="/admin/erp/transfer-requests"
      breadcrumb={[
        { label: "Transfer requests", href: "/admin/erp/transfer-requests" },
        { label: title },
      ]}
      size="landscape"
      footer={footer}
    >
      <div className="space-y-4">
        {sections}
        <ErrorsFeedbackBridge errors={error} />
        {!isModal ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Link
              href="/admin/erp/transfer-requests"
              className={buttonVariants({ variant: "outline" })}
            >
              Cancel
            </Link>
            <Button type="button" disabled={pending} onClick={() => handleSubmit(false)}>
              Save draft
            </Button>
            <Button type="button" disabled={pending} onClick={() => handleSubmit(true)}>
              {pending ? "Savingâ€¦" : "Submit request"}
            </Button>
          </div>
        ) : null}
      </div>
    </AdminFormShell>
  );
}

