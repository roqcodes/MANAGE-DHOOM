"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Package, Plus, Search, Trash2 } from "lucide-react";

import type { OrderStatus, OrderWithItems } from "@/common/admin/types";
import { searchBillingVariants } from "@/app/admin/billing/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import {
  coalesceNumber,
  formatNumberInputValue,
  parseNumberInputValue,
} from "@/lib/numeric-input";
import { Label } from "@/components/ui/label";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  FormError,
  Modal,
  PrimaryBtn,
  SecondaryBtn,
  selectCls,
  textareaCls,
} from "@/modules/admin/components/modal";
import { updateOrderWithItemsAction } from "@/modules/orders/actions/orders.actions";
import {
  formatInr,
  isCancelled,
  ORDER_FULFILLMENT_FLOW,
  shortOrderRef,
} from "@/modules/orders/components/orders-ui";
import {
  orderItemUnitPrice,
  parseProductName,
} from "@/modules/orders/lib/order-display-blocks";
import { roundMoney2 } from "@/modules/billing/components/billing-ui";

type EditableLine = {
  key: string;
  variantId: string;
  productName: string;
  variantName: string | null;
  listPrice: number;
  quantity: number;
  discount: number;
  finalPrice: number;
  stock: number;
  /** Qty already on this order when modal opened (for stock ceiling). */
  reservedQty: number;
};

function lineKeyFromOrderItem(itemId: string) {
  return `existing-${itemId}`;
}

function lineKeyNew(variantId: string) {
  return `new-${variantId}`;
}

function initLinesFromOrder(order: OrderWithItems): EditableLine[] {
  return order.order_items.map((item) => {
    const unit = orderItemUnitPrice(item);
    const parsed = parseProductName(item.product_name);
    const metaProduct = item.variant_meta?.product?.name?.trim();
    const metaVariant = item.variant_meta?.name?.trim();

    return {
      key: lineKeyFromOrderItem(item.id),
      variantId: item.variant_id ?? "",
      productName: metaProduct ?? parsed.product,
      variantName: metaVariant ?? parsed.variant,
      listPrice: unit,
      quantity: Math.max(1, Number(item.quantity ?? 1)),
      discount: 0,
      finalPrice: unit,
      stock: 0,
      reservedQty: Math.max(1, Number(item.quantity ?? 1)),
    };
  });
}

export function OrderEditModal({
  order,
  onClose,
  onSaved,
}: {
  order: OrderWithItems;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [lines, setLines] = useState<EditableLine[]>(() =>
    initLinesFromOrder(order),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Awaited<ReturnType<typeof searchBillingVariants>>
  >([]);
  const [isSearching, setIsSearching] = useState(false);

  const [status, setStatus] = useState(order.status);
  const [paymentStatus, setPaymentStatus] = useState(
    order.payment_status ?? "pending",
  );
  const [merchantNote, setMerchantNote] = useState(order.merchant_note ?? "");
  const [orderDiscount, setOrderDiscount] = useState(0);

  useEffect(() => {
    const delay = setTimeout(() => {
      setIsSearching(true);
      searchBillingVariants(searchQuery)
        .then((res) => {
          setSearchResults(res);
          setIsSearching(false);
        })
        .catch(() => setIsSearching(false));
    }, 200);
    return () => clearTimeout(delay);
  }, [searchQuery]);

  useEffect(() => {
    const variantIds = [
      ...new Set(lines.map((l) => l.variantId).filter(Boolean)),
    ];
    if (variantIds.length === 0) return;

    searchBillingVariants("")
      .then((catalog) => {
        const byId = new Map(catalog.map((v) => [v.variantId, v]));
        setLines((prev) =>
          prev.map((line) => {
            const match = byId.get(line.variantId);
            if (!match) return line;
            return {
              ...line,
              stock: match.stock,
              listPrice:
                line.reservedQty > 0 ? line.listPrice : match.price,
            };
          }),
        );
      })
      .catch(() => undefined);
  }, []);

  const totals = useMemo(() => {
    const subtotal = lines.reduce(
      (sum, line) => sum + line.listPrice * coalesceNumber(line.quantity),
      0,
    );
    const lineDiscountTotal = lines.reduce(
      (sum, line) =>
        sum + coalesceNumber(line.discount) * coalesceNumber(line.quantity),
      0,
    );
    const extraDiscount = roundMoney2(Math.max(0, coalesceNumber(orderDiscount)));
    const totalDiscount = roundMoney2(lineDiscountTotal + extraDiscount);
    const tax = 0;
    const grandTotal = roundMoney2(
      Math.max(0, subtotal - totalDiscount + tax),
    );
    return { subtotal, lineDiscountTotal, extraDiscount, totalDiscount, tax, grandTotal };
  }, [lines, orderDiscount]);

  const hasStockIssue = lines.some(
    (line) => coalesceNumber(line.quantity) > line.stock + line.reservedQty,
  );

  function updateLine(key: string, patch: Partial<EditableLine>) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const updated = { ...line, ...patch };
        if (patch.discount !== undefined) {
          updated.finalPrice = Math.max(0, updated.listPrice - updated.discount);
        }
        if (patch.finalPrice !== undefined) {
          updated.discount = Math.max(0, updated.listPrice - updated.finalPrice);
        }
        return updated;
      }),
    );
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((line) => line.key !== key));
  }

  function addVariant(
    variant: Awaited<ReturnType<typeof searchBillingVariants>>[number],
  ) {
    const existing = lines.find((l) => l.variantId === variant.variantId);
    if (existing) {
      const maxQty = variant.stock + existing.reservedQty;
      if (existing.quantity >= maxQty) return;
      updateLine(existing.key, { quantity: existing.quantity + 1 });
      return;
    }

    setLines((prev) => [
      ...prev,
      {
        key: lineKeyNew(variant.variantId),
        variantId: variant.variantId,
        productName: variant.productName,
        variantName: variant.variantName,
        listPrice: variant.price,
        quantity: 1,
        discount: 0,
        finalPrice: variant.price,
        stock: variant.stock,
        reservedQty: 0,
      },
    ]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (lines.length === 0) {
      setError("Add at least one product to the order.");
      return;
    }
    if (hasStockIssue) {
      setError("One or more items exceed available stock.");
      return;
    }

    startTransition(async () => {
      try {
        await updateOrderWithItemsAction(order.id, {
          items: lines.map((line) => ({
            variantId: line.variantId,
            quantity: line.quantity,
            listPrice: roundMoney2(line.listPrice),
            unitPrice: roundMoney2(line.finalPrice),
          })),
          orderDiscount: totals.extraDiscount,
          status,
          paymentStatus,
          merchantNote: merchantNote.trim() || null,
        });
        onSaved();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save order.");
      }
    });
  }

  const cancelled = isCancelled(order.status);

  return (
    <Modal
      title="Edit order"
      subtitle={`#${shortOrderRef(order.id)} · adjust items, discounts, and details`}
      onClose={onClose}
      size="landscape"
      bareBody
    >
      <form
        id="order-edit-form"
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">Add products</p>
              <p className="text-xs text-muted-foreground">
                Search catalog variants to add or increase quantity.
              </p>
            </div>
            <div className="px-4 py-3">
              <InputGroup className="h-9">
                <InputGroupAddon align="inline-start">
                  <Search aria-hidden />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  placeholder="Search product or variant…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </InputGroup>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {isSearching ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Searching…
                </p>
              ) : searchResults.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Package
                    className="size-9 text-muted-foreground/40"
                    aria-hidden
                  />
                  <p className="text-sm text-muted-foreground">
                    No products found.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {searchResults.map((item) => (
                    <div
                      key={item.variantId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {item.productName}
                        </p>
                        {item.variantName ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {item.variantName}
                          </p>
                        ) : null}
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold tabular-nums">
                            {formatInr(item.price)}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              item.stock <= 0 &&
                                "border-rose-200 bg-rose-50 text-rose-700",
                            )}
                          >
                            {item.stock.toLocaleString("en-IN")} in stock
                          </Badge>
                        </div>
                      </div>
                      <Button
                        size="icon-sm"
                        variant="outline"
                        disabled={item.stock <= 0}
                        onClick={() => addVariant(item)}
                        aria-label={`Add ${item.productName}`}
                      >
                        <Plus />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-semibold">Line items</p>
                <p className="text-xs text-muted-foreground">
                  Adjust quantity and per-unit discount for each row.
                </p>
              </div>

              {lines.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                  <Package
                    className="size-10 text-muted-foreground/40"
                    aria-hidden
                  />
                  <p className="text-sm text-muted-foreground">
                    No items on this order. Search products to add.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Product</TableHead>
                      <TableHead className="w-24">Qty</TableHead>
                      <TableHead>Unit price</TableHead>
                      <TableHead>Discount</TableHead>
                      <TableHead className="text-right">Line total</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => {
                      const maxQty = line.stock + line.reservedQty;
                      const overStock = line.quantity > maxQty;

                      return (
                        <TableRow key={line.key}>
                          <TableCell>
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                {line.productName}
                              </p>
                              {line.variantName ? (
                                <p className="text-xs text-muted-foreground">
                                  {line.variantName}
                                </p>
                              ) : null}
                              {overStock ? (
                                <p className="text-xs text-rose-600">
                                  Exceeds stock ({maxQty} available)
                                </p>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 w-20 tabular-nums"
                              type="number"
                              min={1}
                              max={maxQty}
                              value={formatNumberInputValue(line.quantity)}
                              onChange={(e) => {
                                const n = parseNumberInputValue(e.target.value);
                                updateLine(line.key, {
                                  quantity: Number.isNaN(n)
                                    ? Number.NaN
                                    : Math.max(1, Math.floor(n)),
                                });
                              }}
                            />
                          </TableCell>
                          <TableCell className="tabular-nums text-sm">
                            {formatInr(line.listPrice)}
                          </TableCell>
                          <TableCell>
                            <NumericInput
                              className="h-8 w-24 tabular-nums"
                              min={0}
                              step="0.01"
                              value={line.discount}
                              onValueChange={(discount) =>
                                updateLine(line.key, {
                                  discount: Number.isNaN(discount)
                                    ? discount
                                    : roundMoney2(discount),
                                })
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold tabular-nums">
                            {formatInr(line.finalPrice * line.quantity)}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => removeLine(line.key)}
                              aria-label={`Remove ${line.productName}`}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}

              <div className="grid gap-4 border-t border-border px-4 py-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="order-edit-status">Fulfillment status</Label>
                  <select
                    id="order-edit-status"
                    className={selectCls}
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    disabled={cancelled}
                  >
                    {ORDER_FULFILLMENT_FLOW.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="order-edit-payment">Payment status</Label>
                  <select
                    id="order-edit-payment"
                    className={selectCls}
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value)}
                    disabled={cancelled}
                  >
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="not_required">No payment</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="order-edit-note">Note for merchant</Label>
                  <textarea
                    id="order-edit-note"
                    className={textareaCls}
                    rows={2}
                    value={merchantNote}
                    onChange={(e) => setMerchantNote(e.target.value)}
                    placeholder="Delivery instructions, preferences, etc."
                    maxLength={500}
                  />
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-border bg-muted/20 px-4 py-3">
              <div className="flex flex-col items-end gap-2 text-sm">
                <div className="flex w-full max-w-sm justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums text-foreground">
                    {formatInr(totals.subtotal)}
                  </span>
                </div>
                <div className="flex w-full max-w-sm justify-between text-muted-foreground">
                  <span>Line discounts</span>
                  <span className="tabular-nums text-emerald-700">
                    −{formatInr(totals.lineDiscountTotal)}
                  </span>
                </div>
                <div className="flex w-full max-w-sm items-center justify-between gap-3 text-muted-foreground">
                  <span>Extra order discount</span>
                  <NumericInput
                    className="h-8 w-28 tabular-nums"
                    min={0}
                    step="0.01"
                    value={orderDiscount}
                    onValueChange={(discount) =>
                      setOrderDiscount(
                        Number.isNaN(discount) ? discount : roundMoney2(discount),
                      )
                    }
                  />
                </div>
                <div className="flex w-full max-w-sm justify-between border-t border-border pt-2 text-base font-semibold">
                  <span>Order total</span>
                  <span className="tabular-nums">
                    {formatInr(totals.grandTotal)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-border px-4 py-3">
          <FormError message={error} />
          <div className="flex justify-end gap-2">
            <SecondaryBtn onClick={onClose} disabled={isPending}>
              Cancel
            </SecondaryBtn>
            <PrimaryBtn
              type="submit"
              form="order-edit-form"
              disabled={isPending || lines.length === 0 || hasStockIssue}
            >
              {isPending ? "Saving…" : "Save changes"}
            </PrimaryBtn>
          </div>
        </div>
      </form>
    </Modal>
  );
}
