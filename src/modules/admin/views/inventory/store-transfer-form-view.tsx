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
  ErpDocumentNumberField,
  ProductLiveSearch,
  type ErpFormViewBaseProps,
} from "@/modules/admin/ui";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { coalesceNumber } from "@/lib/numeric-input";
import { StoreSelect, useErpStores } from "@/modules/erp/components/use-erp-stores";
import { formatCurrencyAmount } from "@/lib/format-currency";

type TransferLine = {
  key: string;
  productId: string;
  productName: string;
  quantity: number;
  available: number;
  purchasePrice: number;
  salesPrice: number;
  transferPrice: number;
};

function newKey() {
  return `tr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

type TransferRequestLine = {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  quantity: number;
  source_available: number;
  transfer_price: number;
  sales_price: number;
  average_purchase_cost: number;
  products: { name: string | null; barcode: string | null } | null;
};

type TransferRequestDetail = {
  id: string;
  request_number: string;
  request_date: string;
  status: string;
  note: string | null;
  from_store_id: string;
  to_store_id: string;
  erp_transfer_request_lines: TransferRequestLine[];
};

function productLabel(line: TransferRequestLine): string {
  const productId =
    line.product_id ??
    line.variant_id ??
    "unknown";
  const name = line.products?.name ?? "Product";
  const barcode = line.products?.barcode;
  return barcode ? `${name} (${barcode})` : name || productId;
}

export type StoreTransferFormViewProps = ErpFormViewBaseProps & {
  requestId?: string;
};

export function StoreTransferFormView({
  requestId,
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: StoreTransferFormViewProps) {
  const router = useRouter();
  const { stores } = useErpStores();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isModal = variant === "modal";

  const [fromStoreId, setFromStoreId] = useState("");
  const [toStoreId, setToStoreId] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [linkedRequestId, setLinkedRequestId] = useState<string | null>(null);
  const [loadingRequest, setLoadingRequest] = useState(Boolean(requestId));

  useEffect(() => {
    if (!requestId) return;

    let cancelled = false;
    setLoadingRequest(true);
    setError(null);

    adminGet<TransferRequestDetail>(`erp/transfer-requests/${requestId}`)
      .then(async (request) => {
        if (cancelled) return;

        if (!["draft", "submitted"].includes(request.status)) {
          setError("This transfer request is no longer available for creating a transfer.");
          return;
        }

        setFromStoreId(request.from_store_id);
        setToStoreId(request.to_store_id);
        if (request.note) setNote(request.note);
        setLinkedRequestId(request.id);

        const transferLines: TransferLine[] = [];
        for (const line of request.erp_transfer_request_lines ?? []) {
          const productId = line.product_id ?? line.variant_id;
          if (!productId) continue;

          let available = Number(line.source_available ?? 0);
          try {
            const stockRes = await adminGet<{ stock: number }>(
              `erp/store-stock?storeId=${request.from_store_id}&productId=${productId}`,
            );
            available = stockRes.stock;
          } catch {
            // keep request snapshot if live stock lookup fails
          }

          transferLines.push({
            key: newKey(),
            productId,
            productName: productLabel(line),
            quantity: Number(line.quantity),
            available,
            purchasePrice: Number(line.average_purchase_cost ?? 0),
            salesPrice: Number(line.sales_price ?? 0),
            transferPrice: Number(line.transfer_price ?? 0),
          });
        }

        setLines(transferLines);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load transfer request");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRequest(false);
      });

    return () => {
      cancelled = true;
    };
  }, [requestId]);

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/erp/store-transfers");
    }
  }

  function handleSuccessNavigate(id: string) {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(id);
      return;
    }
    router.push(`/admin/erp/store-transfers/${id}`);
  }

  async function addLine(row: ErpSalesProductSearchRow) {
    let available = 0;
    if (fromStoreId) {
      const stockRes = await adminGet<{ stock: number }>(
        `erp/store-stock?storeId=${fromStoreId}&productId=${row.id}`,
      );
      available = stockRes.stock;
    }
    setLines([
      ...lines,
      {
        key: newKey(),
        productId: row.id,
        productName: row.product_name,
        quantity: 1,
        available,
        purchasePrice: row.purchase_price ?? 0,
        salesPrice: row.sales_price ?? 0,
        transferPrice: row.purchase_price ?? 0,
      },
    ]);
  }

  function handleSubmit() {
    setError(null);
    if (!fromStoreId || !toStoreId) {
      setError("From and To stores are required");
      return;
    }
    if (fromStoreId === toStoreId) {
      setError("From and To stores must be different");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one item");
      return;
    }

    startTransition(async () => {
      try {
        const res = await adminPost<{ id: string }>("erp/store-transfers", {
          fromStoreId,
          toStoreId,
          transferDate,
          note: note || undefined,
          requestId: linkedRequestId ?? undefined,
          lines: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            purchasePrice: l.purchasePrice,
            salesPrice: l.salesPrice,
            transferPrice: l.transferPrice,
          })),
        });
        handleSuccessNavigate(res.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  if (isModal && !open) return null;

  const title = linkedRequestId ? "From request" : "New transfer";
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);

  if (loadingRequest) {
    return (
      <AdminFormShell
        variant={variant}
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        size="landscape"
        loading
        loadingFallback={<AdminPageSkeleton />}
      >
        {null}
      </AdminFormShell>
    );
  }

  const footer = isModal ? (
    <>
      <Button type="button" variant="outline" onClick={handleCancel}>
        Cancel
      </Button>
      <Button type="button" disabled={pending || loadingRequest} onClick={handleSubmit}>
        {pending ? "Savingâ€¦" : "Save transfer"}
      </Button>
    </>
  ) : undefined;

  const sections = (
    <AdminFormColumns cols={2}>
      <AdminFormSection title="Transfer details">
        <AdminFormGrid cols={2}>
          <ErpDocumentNumberField kind="ST" />
          <AdminFormField label="From store" required>
            <StoreSelect value={fromStoreId} onChange={setFromStoreId} stores={stores} label="" />
          </AdminFormField>
          <AdminFormField label="To store" required>
            <StoreSelect value={toStoreId} onChange={setToStoreId} stores={stores} label="" />
          </AdminFormField>
          <AdminFormField label="Transfer date">
            <Input
              type="date"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
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
          storeId={fromStoreId}
          placeholder="Search product…"
          disabled={!fromStoreId}
          onSelect={(row) => addLine(row as ErpSalesProductSearchRow)}
        />
        {!fromStoreId ? (
          <p className="text-sm text-muted-foreground">Select a source store to search products.</p>
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
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.key} className="border-t">
                    <td className="px-3 py-2">{line.productName}</td>
                    <td className="px-3 py-2 tabular-nums">{line.available}</td>
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
                      <NumericInput
                        min={0}
                        step="0.01"
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
                    <td className="px-3 py-2 tabular-nums">
                      {formatCurrencyAmount(
                        coalesceNumber(line.quantity) * coalesceNumber(line.transferPrice),
                      )}
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
      description="Move stock between stores with transfer pricing and quantities."
      backHref="/admin/erp/store-transfers"
      breadcrumb={[
        { label: "Store transfers", href: "/admin/erp/store-transfers" },
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
            <Link href="/admin/erp/store-transfers" className={buttonVariants({ variant: "outline" })}>
              Cancel
            </Link>
            <Button type="button" disabled={pending || loadingRequest} onClick={handleSubmit}>
              {pending ? "Savingâ€¦" : "Save transfer"}
            </Button>
          </div>
        ) : null}
      </div>
    </AdminFormShell>
  );
}
