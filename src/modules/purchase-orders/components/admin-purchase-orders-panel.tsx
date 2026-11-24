"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import type { ErpPurchaseOrderDetail } from "@/common/erp/purchasing-types";
import { adminGet, adminPatch } from "@/modules/admin/lib/admin-api-client";
import { useAdminAlert } from "@/modules/admin/components/admin-alert-provider";
import { PurchaseBillFormView } from "@/modules/admin/views/purchasing/purchase-bill-form-view";
import {
  PurchaseOrderTransitModal,
  type PurchaseOrderTransitMode,
} from "@/modules/purchase-orders/components/purchase-order-transit-modal";
import { resolvePurchaseOrderNextAction } from "@/modules/purchase-orders/lib/purchase-order-next-action";
import { Ban, ChevronDown, Columns3, Search } from "lucide-react";

import type {
  AdminPurchaseOrderListRow,
  PurchaseOrderCatalogStats,
  PurchaseOrderStatusFilter,
} from "@/common/admin/types";
import { deliveryMonthFilterLabel } from "@/modules/purchase-orders/lib/delivery-month-filter";
import { Pagination } from "@/modules/admin/components/pagination";
import { VendorSearchSelect } from "@/modules/admin/ui";
import { resolveVendorPickerOption } from "@/modules/erp/lib/entity-live-search.client";
import {
  getPurchaseOrdersExportTabular,
  PurchaseOrdersBulkActionBar,
  PurchaseOrdersDataTable,
} from "@/modules/purchase-orders/components/purchase-orders-data-table";
import { buildCatalogExportSource, catalogFilterSubtitle } from "@/lib/export/catalog-export";
import { PurchaseOrdersMetricsBar } from "@/modules/purchase-orders/components/purchase-orders-metrics-bar";
import { PurchaseOrderPhaseProgress } from "@/modules/purchase-orders/components/purchase-order-phase-progress";
import {
  buildPurchaseOrderDeliveryMonthTabs,
  buildPurchaseOrdersListParams,
  PO_ACCENT,
  PURCHASE_ORDER_STATUS_FILTER_OPTIONS,
  shortPoRef,
  type PurchaseOrderDeliveryMonthFilter,
} from "@/modules/purchase-orders/components/purchase-orders-ui";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";
import {
  purchaseOrdersListQueryOptions,
} from "@/modules/purchase-orders/lib/purchase-orders-list-query";

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
  deliveryMonthFilter,
  selectedVendorId,
  stats,
  initialLoading = false,
  listRefetching = false,
  onOrdersMutated,
}: {
  orders: AdminPurchaseOrderListRow[];
  total: number;
  page: number;
  statusFilter: PurchaseOrderStatusFilter;
  deliveryMonthFilter: PurchaseOrderDeliveryMonthFilter;
  selectedVendorId: string | null;
  stats: PurchaseOrderCatalogStats;
  initialLoading?: boolean;
  listRefetching?: boolean;
  onOrdersMutated?: () => void;
}) {
  const deliveryMonthTabs = useMemo(() => buildPurchaseOrderDeliveryMonthTabs(), []);
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { confirm } = useAdminAlert();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [vendorFilterLabel, setVendorFilterLabel] = useState("");
  const [nextActionLoadingId, setNextActionLoadingId] = useState<string | null>(
    null,
  );
  const [nextActionLabelsByPoId, setNextActionLabelsByPoId] = useState<
    Record<string, string>
  >({});
  const [noNextActionPoIds, setNoNextActionPoIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [transitModal, setTransitModal] = useState<{
    poId: string;
    expectedDate: string | null;
  } | null>(null);
  const [invoiceModal, setInvoiceModal] = useState<{
    poId: string;
    mode: "create" | "edit";
    billId?: string;
  } | null>(null);

  useEffect(() => {
    if (!selectedVendorId) {
      setVendorFilterLabel("");
      return;
    }
    void resolveVendorPickerOption(selectedVendorId)
      .then((option) => setVendorFilterLabel(option.label))
      .catch(() => setVendorFilterLabel(""));
  }, [selectedVendorId]);

  useEffect(() => {
    const received = orders.filter((o) => o.status === "received");
    if (received.length === 0) return;
    let cancelled = false;
    void Promise.all(
      received.map(async (row) => {
        try {
          const res = await adminGet<{ po: ErpPurchaseOrderDetail }>(
            `erp/purchase-orders/${row.id}`,
          );
          if (res.po.delivery.deliverySubmitted) {
            return { id: row.id, label: null as null };
          }
          const draftId =
            res.po.linked_bill?.status === "draft" ? res.po.linked_bill.id : null;
          return {
            id: row.id,
            label: draftId ? "Edit invoice" : "Generate invoice",
          };
        } catch {
          return null;
        }
      }),
    ).then((rows) => {
      if (cancelled) return;
      const nextLabels: Record<string, string> = {};
      const completed = new Set<string>();
      for (const row of rows) {
        if (!row) continue;
        if (row.label === null) {
          completed.add(row.id);
        } else {
          nextLabels[row.id] = row.label;
        }
      }
      setNoNextActionPoIds((prev) => new Set([...prev, ...completed]));
      setNextActionLabelsByPoId((prev) => ({ ...prev, ...nextLabels }));
    });
    return () => {
      cancelled = true;
    };
  }, [orders]);

  const listParams: Record<string, string> = {};
  if (statusFilter !== "all") listParams.status = statusFilter;
  if (deliveryMonthFilter !== "all") listParams.deliveryMonth = deliveryMonthFilter;
  if (selectedVendorId) listParams.vendorId = selectedVendorId;

  function pushFilters(next: {
    status?: PurchaseOrderStatusFilter;
    deliveryMonth?: PurchaseOrderDeliveryMonthFilter;
  }) {
    const params = buildPurchaseOrdersListParams({
      status: next.status ?? statusFilter,
      deliveryMonth:
        next.deliveryMonth !== undefined ? next.deliveryMonth : deliveryMonthFilter,
      vendorId: searchParams.get("vendorId"),
    });
    router.push(`/admin/purchase-orders?${params.toString()}`);
  }

  function handleStatusFilter(nextStatus: PurchaseOrderStatusFilter) {
    pushFilters({ status: nextStatus });
  }

  const prefetchDeliveryMonth = useCallback(
    (nextMonth: PurchaseOrderDeliveryMonthFilter) => {
      void queryClient.prefetchQuery(
        purchaseOrdersListQueryOptions(
          statusFilter,
          nextMonth,
          selectedVendorId,
          0,
        ),
      );
    },
    [queryClient, selectedVendorId, statusFilter],
  );

  function handleDeliveryMonthFilter(nextMonth: string) {
    startTransition(() => {
      pushFilters({
        deliveryMonth: nextMonth as PurchaseOrderDeliveryMonthFilter,
      });
    });
  }

  function handleClearFilters() {
    setSearch("");
    handleVendorFilter(null);
    pushFilters({ status: "all", deliveryMonth: "all" });
  }

  function refreshOrders() {
    onOrdersMutated?.();
  }

  async function handleTransitSave(
    poId: string,
    mode: PurchaseOrderTransitMode,
    date: string,
  ) {
    await adminPatch<{ ok: boolean }>(`erp/purchase-orders/${poId}/status`, {
      status: mode,
      expectedDate: date,
    });
    refreshOrders();
  }

  async function handleNextAction(row: AdminPurchaseOrderListRow) {
    const { kind } = resolvePurchaseOrderNextAction(row.status);

    if (kind === "ready_for_pickup") {
      setTransitModal({
        poId: row.id,
        expectedDate: row.expected_delivery_date ?? null,
      });
      return;
    }

    if (kind === "mark_received") {
      const ok = await confirm({
        title: "Mark as received?",
        message:
          "Confirm goods have been received in the warehouse. You can then generate the purchase invoice.",
        confirmLabel: "Mark received",
      });
      if (!ok) return;
      startTransition(async () => {
        setNextActionLoadingId(row.id);
        try {
          await adminPatch<{ ok: boolean }>(`erp/purchase-orders/${row.id}/status`, {
            status: "received",
          });
          refreshOrders();
        } finally {
          setNextActionLoadingId(null);
        }
      });
      return;
    }

    if (kind === "generate_invoice") {
      setNextActionLoadingId(row.id);
      try {
        const res = await adminGet<{ po: ErpPurchaseOrderDetail }>(
          `erp/purchase-orders/${row.id}`,
        );
        if (res.po.delivery.deliverySubmitted) {
          setNoNextActionPoIds((prev) => new Set(prev).add(row.id));
          return;
        }
        const draftBillId =
          res.po.linked_bill?.status === "draft" ? res.po.linked_bill.id : undefined;
        const label = draftBillId ? "Edit invoice" : "Generate invoice";
        setNextActionLabelsByPoId((prev) => ({ ...prev, [row.id]: label }));
        setInvoiceModal({
          poId: row.id,
          mode: draftBillId ? "edit" : "create",
          billId: draftBillId,
        });
      } finally {
        setNextActionLoadingId(null);
      }
    }
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
    statusFilter !== "all" ||
    deliveryMonthFilter !== "all" ||
    selectedVendorId !== null;

  const exportSource = useMemo(
    () =>
      buildCatalogExportSource({
        baseFilename: "purchase-orders-export",
        title: "Purchase orders",
        getSubtitle: () =>
          catalogFilterSubtitle({
            search,
            status: statusFilter,
            extra: [
              deliveryMonthFilterLabel(deliveryMonthFilter)
                ? `Expected: ${deliveryMonthFilterLabel(deliveryMonthFilter)}`
                : "",
              selectedVendorId ? "Vendor filter applied" : "",
            ].filter(Boolean),
          }),
        getTabular: () => {
          const tabular = getPurchaseOrdersExportTabular(filtered);
          return tabular.rows.length > 0 ? tabular : null;
        },
      }),
    [filtered, search, statusFilter, deliveryMonthFilter, selectedVendorId],
  );

  return (
    <div className="flex flex-col gap-4">
      <PurchaseOrdersMetricsBar
        stats={stats}
        allFiltersClear={
          statusFilter === "all" &&
          deliveryMonthFilter === "all" &&
          !selectedVendorId
        }
        onClearFilters={handleClearFilters}
        exportSource={exportSource}
      />

      <PurchaseOrderPhaseProgress
        stats={stats}
        activeStatus={statusFilter}
        onSelect={(status) => pushFilters({ status, deliveryMonth: "all" })}
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

          <div className="border-b px-2 py-2">
            <Tabs
              value={deliveryMonthFilter}
              onValueChange={handleDeliveryMonthFilter}
            >
              <TabsList
                variant="line"
                className="h-auto w-full max-w-full justify-start gap-0 overflow-x-auto rounded-none bg-transparent p-0"
              >
                {deliveryMonthTabs.map((tab) => {
                  const count =
                    stats.deliveryMonthCounts[tab.id] ??
                    (tab.id === "all" ? stats.totalPurchaseOrders : 0);
                  return (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className="inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm"
                      onMouseEnter={() => prefetchDeliveryMonth(tab.id)}
                      onFocus={() => prefetchDeliveryMonth(tab.id)}
                    >
                      <span>{tab.label}</span>
                      <span className="font-semibold tabular-nums tracking-tight">
                        {count.toLocaleString("en-IN")}
                      </span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
          </div>

          <div className="px-2 pt-2">
            <PurchaseOrdersBulkActionBar
              selectedIds={selectedIds}
              orders={filtered}
              onClearSelection={() => setSelectedIds(new Set())}
            />
          </div>

          {initialLoading ? (
            <AdminTableBodySkeleton rows={8} />
          ) : filtered.length === 0 ? (
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
            <div
              className={cn(
                "transition-opacity duration-150",
                listRefetching && "pointer-events-none opacity-60",
              )}
            >
            <PurchaseOrdersDataTable
              orders={filtered}
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              sortByExpectedDelivery={deliveryMonthFilter !== "all"}
              onNextAction={handleNextAction}
              nextActionLoadingId={nextActionLoadingId}
              nextActionLabelsByPoId={nextActionLabelsByPoId}
              suppressNextActionPoIds={noNextActionPoIds}
            />
            </div>
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

      <PurchaseOrderTransitModal
        open={transitModal !== null}
        variant="pickup"
        initialDate={transitModal?.expectedDate}
        onClose={() => setTransitModal(null)}
        onSave={async (mode, date) => {
          if (!transitModal) return;
          await handleTransitSave(transitModal.poId, mode, date);
        }}
      />

      {invoiceModal ? (
        <PurchaseBillFormView
          key={`${invoiceModal.poId}-${invoiceModal.billId ?? "new"}`}
          variant="modal"
          mode={invoiceModal.mode}
          billId={invoiceModal.billId}
          poIdFromQuery={invoiceModal.poId}
          formTitle={
            invoiceModal.mode === "edit" ? "Edit invoice" : "Generate invoice"
          }
          formDescription="Record vendor invoice lines, landed costs, and totals for this purchase order."
          open
          onOpenChange={(open) => {
            if (!open) setInvoiceModal(null);
          }}
          onSuccess={() => {
            setInvoiceModal(null);
            refreshOrders();
          }}
        />
      ) : null}
    </div>
  );
}
