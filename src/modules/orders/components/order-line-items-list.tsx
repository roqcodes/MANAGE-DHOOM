"use client";

import type { ReactNode } from "react";
import { Package } from "lucide-react";

import type { OrderItem, OrderWithItems } from "@/common/admin/types";
import {
  formatInr,
  CustomerEditLineBadge,
} from "@/modules/orders/components/orders-ui";
import { CurrencySymbolMark } from "@/components/currency-symbol-mark";
import { useCurrencySettings } from "@/modules/settings/providers/currency-settings-provider";
import {
  buildOrderDisplayBlocks,
  buildOrderItemSections,
  blockLineTotal,
  orderItemLineTotal,
  orderItemUnitPrice,
  orderLineProductLabel,
  orderLineVariantLabel,
  sectionQtyTotal,
  type OrderLineItem,
} from "@/modules/orders/lib/order-display-blocks";

const LINE_GRID =
  "grid grid-cols-[minmax(0,1fr)_4.5rem_2.5rem_4.5rem] items-center gap-x-2 gap-y-0";

function LineThumb({ url }: { url: string | null }) {
  const trimmed = url?.trim() ?? "";
  if (!trimmed) {
    return (
      <span className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
        <Package className="size-5" aria-hidden />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={trimmed}
      alt=""
      className="size-12 shrink-0 rounded-lg border bg-muted/40 object-cover"
    />
  );
}

function OrderItemsTableHeader() {
  const { settings } = useCurrencySettings();
  return (
    <div
      className={`${LINE_GRID} border-b border-border/60 bg-muted/30 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground`}
    >
      <span>Item</span>
      <span className="inline-flex items-baseline justify-end gap-0.5">
        Rate (<CurrencySymbolMark settings={settings} />)
      </span>
      <span className="text-center">Qty</span>
      <span className="inline-flex items-baseline justify-end gap-0.5">
        Amount (<CurrencySymbolMark settings={settings} />)
      </span>
    </div>
  );
}

function OrderLineRowGrid({ item }: { item: OrderLineItem }) {
  const unit = orderItemUnitPrice(item);
  const lineTotal = orderItemLineTotal(item);
  const variantLabel = orderLineVariantLabel(item);

  return (
    <div className={`${LINE_GRID} border-b border-border/40 px-3 py-2.5 last:border-b-0`}>
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 text-[12px] font-medium leading-snug">{variantLabel}</span>
        <CustomerEditLineBadge flag={item.customer_edit_flag} />
      </span>
      <p className="text-right text-[12px] font-semibold tabular-nums">{formatInr(unit)}</p>
      <p className="text-center text-[12px] font-semibold tabular-nums">
        {item.quantity ?? 1}
      </p>
      <p className="text-right text-[12px] font-semibold tabular-nums">{formatInr(lineTotal)}</p>
    </div>
  );
}

function GroupedOrderBlock({
  productName,
  imageUrl,
  items,
  groups,
  layout,
}: {
  productName: string;
  imageUrl: string | null;
  items: OrderLineItem[];
  groups: OrderWithItems["variant_groups"];
  layout: "grouped" | "flat";
}) {
  const productId = items[0]?.variant_meta?.product?.id ?? "";
  const sections = buildOrderItemSections(items, groups?.[productId] ?? []);
  const totalQty = sectionQtyTotal(items);
  const total = blockLineTotal(items);
  const variantCount = items.length;
  const metaLabel =
    layout === "grouped"
      ? `${totalQty} unit${totalQty === 1 ? "" : "s"} · grouped`
      : `${variantCount} variant${variantCount === 1 ? "" : "s"} · ${totalQty} unit${totalQty === 1 ? "" : "s"}`;

  return (
    <div className="border-b border-border/60 last:border-b-0">
      <div className="flex items-start gap-3 border-b border-border/50 bg-muted/20 px-3 py-3">
        <LineThumb url={imageUrl} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug">{productName}</p>
          <p className="text-[11px] text-muted-foreground">{metaLabel}</p>
        </div>
        <p className="text-sm font-semibold tabular-nums">{formatInr(total)}</p>
      </div>
      <div>
        {layout === "flat" ? (
          items.map((item) => <OrderLineRowGrid key={item.id} item={item} />)
        ) : (
          sections.map((section) => (
            <div key={section.key}>
              <div className="flex items-center justify-between gap-2 bg-muted/35 px-3 py-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                  {section.title}
                </p>
                <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {sectionQtyTotal(section.items)}
                </span>
              </div>
              {section.items.map((item) => (
                <OrderLineRowGrid key={item.id} item={item} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SingleOrderLineRow({ item }: { item: OrderLineItem }) {
  const productLabel = orderLineProductLabel(item);
  const variantLabel = orderLineVariantLabel(item);
  const showVariantSub =
    variantLabel !== productLabel && !item.product_name?.includes("—");
  const unit = orderItemUnitPrice(item);
  const lineTotal = orderItemLineTotal(item);

  return (
    <div className="flex items-start gap-3 border-b border-border/60 px-3 py-3 last:border-b-0">
      <LineThumb url={item.variant_meta?.image_url ?? null} />
      <div className={`min-w-0 flex-1 ${LINE_GRID}`}>
        <div className="min-w-0">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 text-[13px] font-medium leading-snug">{productLabel}</span>
            <CustomerEditLineBadge flag={item.customer_edit_flag} />
          </span>
          {showVariantSub ? (
            <p className="text-[11px] text-muted-foreground">{variantLabel}</p>
          ) : null}
        </div>
        <p className="text-right text-[12px] font-semibold tabular-nums">{formatInr(unit)}</p>
        <p className="text-center text-[12px] font-semibold tabular-nums">
          {item.quantity ?? 1}
        </p>
        <p className="text-right text-[12px] font-semibold tabular-nums">{formatInr(lineTotal)}</p>
      </div>
    </div>
  );
}

export function OrderLineItemsList({
  order,
  className,
}: {
  order: OrderWithItems;
  className?: string;
}) {
  const items = order.order_items;
  const variantGroups = order.variant_groups ?? {};
  const blocks = buildOrderDisplayBlocks(items, variantGroups);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No line items.</p>;
  }

  return (
    <div className={className ?? "flex flex-col gap-0"}>
      <div className="rounded-lg border border-border/80 bg-card overflow-hidden">
        <OrderItemsTableHeader />
        {blocks.map((block) => {
          if (block.type === "single") {
            return <SingleOrderLineRow key={block.item.id} item={block.item} />;
          }

          return (
            <GroupedOrderBlock
              key={block.productId}
              productName={block.productName}
              imageUrl={block.imageUrl}
              items={block.items}
              groups={variantGroups}
              layout={block.layout}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Invoice / print table rows with optional group subheadings. */
export function OrderLineItemsTableBody({ order }: { order: OrderWithItems }) {
  const variantGroups = order.variant_groups ?? {};
  const blocks = buildOrderDisplayBlocks(order.order_items, variantGroups);

  if (order.order_items.length === 0) {
    return (
      <tr>
        <td colSpan={4} className="px-3 py-6 text-center font-medium text-slate-500">
          No line items.
        </td>
      </tr>
    );
  }

  const rows: ReactNode[] = [];

  for (const block of blocks) {
    if (block.type === "grouped") {
      const sections =
        block.layout === "flat"
          ? [{ key: "__flat", title: "", items: block.items }]
          : buildOrderItemSections(
              block.items,
              variantGroups[block.productId] ?? [],
            );
      rows.push(
        <tr key={`group-${block.productId}`} className="border-b border-slate-100 bg-slate-50/80">
          <td colSpan={4} className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">
            {block.productName}
            <span className="ml-2 font-normal normal-case text-slate-500">
              · {sectionQtyTotal(block.items)} units
            </span>
          </td>
        </tr>,
      );
      for (const section of sections) {
        if (block.layout === "grouped") {
          rows.push(
            <tr key={`section-${block.productId}-${section.key}`} className="border-b border-slate-50">
              <td colSpan={4} className="px-3 py-1.5 text-[11px] font-semibold text-slate-500">
                {section.title}
              </td>
            </tr>,
          );
        }
        for (const item of section.items) {
          rows.push(<InvoiceItemRow key={item.id} item={item} variantOnly />);
        }
      }
    } else {
      rows.push(<InvoiceItemRow key={block.item.id} item={block.item} />);
    }
  }

  return <>{rows}</>;
}

function InvoiceItemRow({
  item,
  variantOnly = false,
}: {
  item: OrderItem;
  variantOnly?: boolean;
}) {
  const unit = orderItemUnitPrice(item);
  const lineAmt = orderItemLineTotal(item);
  const label = variantOnly
    ? orderLineVariantLabel(item)
    : item.product_name ?? orderLineProductLabel(item);

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-3 py-2.5 align-top">
        <span className="font-semibold text-slate-900">{label}</span>
        {item.vendor_id ? (
          <span className="mt-0.5 block font-mono text-[10px] text-slate-400 print:text-[9px]">
            Vendor {item.vendor_id.slice(0, 8)}…
          </span>
        ) : null}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums font-medium">
        {formatInr(unit)}
      </td>
      <td className="px-3 py-2.5 text-center tabular-nums font-medium">
        {item.quantity ?? "—"}
      </td>
      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
        {formatInr(lineAmt)}
      </td>
    </tr>
  );
}
