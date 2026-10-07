"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Ban, ChevronDown, Columns3, Search } from "lucide-react";

import type {
  AdminPurchaseOrderListRow,
  PurchaseOrderCatalogStats,
  PurchaseOrderDeliveryFilter,
  PurchaseOrderStatusFilter,
} from "@/common/admin/types";
import { Pagination } from "@/modules/admin/components/pagination";
import { VendorSearchSelect } from "@/modules/admin/ui";
import { resolveVendorPickerOption } from "@/modules/erp/lib/entity-live-search.client";
import {
  exportPurchaseOrdersCsv,
  PurchaseOrdersBulkActionBar,
  PurchaseOrdersDataTable,
} from "@/modules/purchase-orders/components/purchase-orders-data-table";
import { PurchaseOrdersMetricsBar } from "@/modules/purchase-orders/components/purchase-orders-metrics-bar";
import {
  buildPurchaseOrdersListParams,
  PO_ACCENT,
  PURCHASE_ORDER_DELIVERY_FILTER_OPTIONS,
  PURCHASE_ORDER_STATUS_FILTER_OPTIONS,
  shortPoRef,
} from "@/modules/purchase-orders/components/purchase-orders-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  const activeLabel =
    options.find((option) => option.id === value)?.label ?? label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <InputGroupButton
            variant="ghost"
            size="sm"
            className={cn("gap-1 px-2", PO_ACCENT.focus)}
          />
        }
      >
        {activeLabel}
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuGroup>
          {options.map((option) => (
            <DropdownMenuItem key={option.id} onClick={() => onChange(option.id)}>
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AdminPurchaseOrdersPanel({
  orders,
  total,
  page,
  statusFilter,
  deliveryFilter,
  selectedVendorId,
  stats,
}: {
  orders: AdminPurchaseOrderListRow[];
  total: number;
  page: number;
  statusFilter: PurchaseOrderStatusFilter;
  deliveryFilter: PurchaseOrderDeliveryFilter | null;
  selectedVendorId: string | null;
  stats: PurchaseOrderCatalogStats;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [vendorFilterLabel, setVendorFilterLabel] = useState("");

  useEffect(() => {
    if (!selectedVendorId) {
      setVendorFilterLabel("");
      return;
    }
    void resolveVendorPickerOption(selectedVendorId)
      .then((option) => setVendorFilterLabel(option.label))
      .catch(() => setVendorFilterLabel(""));
  }, [selectedVendorId]);

  const listParams: Record<string, string> = {};
  if (statusFilter !== "all") listParams.status = statusFilter;
  if (deliveryFilter) listParams.delivery = deliveryFilter;
  if (selectedVendorId) listParams.vendorId = selectedVendorId;

  function pushFilters(next: {
    status?: PurchaseOrderStatusFilter;
    delivery?: PurchaseOrderDeliveryFilter | null;
  }) {
    const params = buildPurchaseOrdersListParams({
      status: next.status ?? statusFilter,
      delivery: next.delivery !== undefined ? next.delivery : deliveryFilter,
      vendorId: searchParams.get("vendorId"),
    });
    router.push(`/admin/purchase-orders?${params.toString()}`);
  }

  function handleStatusFilter(nextStatus: PurchaseOrderStatusFilter) {
    pushFilters({ status: nextStatus });
  }

  function handleDeliveryFilter(nextDeliveryId: string) {
    pushFilters({
      delivery: nextDeliveryId === "all" ? null : (nextDeliveryId as PurchaseOrderDeliveryFilter),
    });
  }

  function handleClearFilters() {
    setSearch("");
    handleVendorFilter(null);
    pushFilters({ status: "all", delivery: null });
  }

  function handleVendorFilter(vendorId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (vendorId) params.set("vendorId", vendorId);
    else params.delete("vendorId");
    params.delete("page");
    router.push(`/admin/purchase-orders?${params.toString()}`);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;

    return orders.filter((po) => {
      const idMatch = po.id.toLowerCase().includes(q);
      const refMatch = shortPoRef(po.id).toLowerCase().includes(q);
      const poNumber = (po.po_number ?? "").toLowerCase();
      const vendorName = (po.vendors?.name ?? "").toLowerCase();
      const vendorId = (po.vendor_id ?? "").toLowerCase();
      return (
        idMatch ||
        refMatch ||
        poNumber.includes(q) ||
        vendorName.includes(q) ||
        vendorId.includes(q)
      );
    });
  }, [orders, search]);

  const isClientFiltering = search.trim().length > 0;
  const isViewFiltered =
    statusFilter !== "all" || deliveryFilter !== null || selectedVendorId !== null;

  return (
    <div className="flex flex-col gap-4">
      <PurchaseOrdersMetricsBar
        stats={stats}
        activeDeliveryFilter={deliveryFilter}
        allFiltersClear={statusFilter === "all" && deliveryFilter === null}
        onDeliveryFilter={(delivery) => pushFilters({ delivery })}
        onClearFilters={handleClearFilters}
        onExport={() => exportPurchaseOrdersCsv(filtered)}
      />

      <Card className="overflow-hidden border border-border py-0 ring-0">
        <CardContent className="flex flex-col gap-0 p-0">
          <div className="border-b p-2">
            <InputGroup className="h-9">
              <InputGroupAddon align="inline-start" className="pl-1">
                <FilterDropdown
                  label="Status"
                  value={statusFilter}
                  options={PURCHASE_ORDER_STATUS_FILTER_OPTIONS}
                  onChange={(id) =>
                    handleStatusFilter(id as PurchaseOrderStatusFilter)
                  }
                />
              </InputGroupAddon>
              <InputGroupAddon align="inline-start" className="px-0">
                <div className="h-4 w-px bg-border" aria-hidden />
              </InputGroupAddon>
              <InputGroupAddon align="inline-start">
                <FilterDropdown
                  label="Delivery"
                  value={deliveryFilter ?? "all"}
                  options={PURCHASE_ORDER_DELIVERY_FILTER_OPTIONS}
                  onChange={handleDeliveryFilter}
                />
              </InputGroupAddon>
              <InputGroupAddon align="inline-start" className="px-0">
                <div className="h-4 w-px bg-border" aria-hidden />
              </InputGroupAddon>
              <InputGroupAddon align="inline-start" className="min-w-[11rem] max-w-[14rem] py-0.5 pr-1">
                <VendorSearchSelect
                  value={selectedVendorId}
                  selectedLabel={vendorFilterLabel || undefined}
                  placeholder="All vendors"
                  className="[&_input]:h-8 [&_input]:border-0 [&_input]:bg-transparent [&_input]:shadow-none"
                  onChange={(id, option) => {
                    setVendorFilterLabel(option?.label ?? "");
                    handleVendorFilter(id);
                  }}
                />
              </InputGroupAddon>
              <InputGroupAddon align="inline-start" className="px-0">
                <div className="h-4 w-px bg-border" aria-hidden />
              </InputGroupAddon>
              <InputGroupAddon align="inline-start">
                <Search aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search and filter..."
                className="border-0"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Column view"
                  className={PO_ACCENT.focus}
                >
                  <Columns3 />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </div>

          <div className="px-2 pt-2">
            <PurchaseOrdersBulkActionBar
              selectedIds={selectedIds}
              orders={filtered}
              onClearSelection={() => setSelectedIds(new Set())}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <Ban className="size-12 text-muted-foreground/30" aria-hidden />
              <p className="text-sm text-muted-foreground">
                {isClientFiltering || isViewFiltered
                  ? "No purchase orders match your filters."
                  : "No purchase orders in this view."}
              </p>
              {isClientFiltering || isViewFiltered ? (
                <Button variant="outline" size="sm" onClick={handleClearFilters}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : (
            <PurchaseOrdersDataTable
              orders={filtered}
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              sortByExpectedDelivery={deliveryFilter !== null}
            />
          )}

          <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
            <span>
              {isClientFiltering
                ? `${filtered.length} of ${orders.length} on this page`
                : `Page ${page + 1} · ${total.toLocaleString("en-IN")} matching`}
            </span>
            {selectedVendorId ? (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleVendorFilter(null)}
              >
                Clear vendor filter
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {!isClientFiltering && total > orders.length ? (
        <Pagination
          total={total}
          page={page}
          basePath="/admin/purchase-orders"
          extraParams={listParams}
        />
      ) : null}
    </div>
  );
}
