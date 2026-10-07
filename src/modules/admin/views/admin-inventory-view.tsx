"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, ArrowRightLeft } from "lucide-react";

import type { InventoryCatalogStats, InventoryWithVariant } from "@/common/admin/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { CreateOnlineTransferDialog } from "@/modules/inventory/components/create-online-transfer-dialog";
import { CreateOnlineToPhysicalTransferDialog } from "@/modules/inventory/components/create-online-to-physical-transfer-dialog";
import { InventoryPanel } from "@/modules/inventory/components/inventory-panel";
import { InventoryRecentTransfersList } from "@/modules/inventory/components/inventory-recent-transfers-list";
import { OnlineTransfersList } from "@/modules/inventory/components/online-transfers-list";
import { InventoryMetricsBar } from "@/modules/inventory/components/inventory-metrics-bar";
import { useActiveStoreFormField } from "@/modules/erp/components/use-active-store-form-field";

type InventoryPayload = {
  data: InventoryWithVariant[];
  total: number;
  page: number;
  stats: InventoryCatalogStats;
};

export function AdminInventoryView() {
  const searchParams = useSearchParams();
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const initialTab = searchParams.get("tab") ?? "products";
  const { effectiveStoreId, storeLabel } = useActiveStoreFormField({ mode: "create" });
  const [transferOpen, setTransferOpen] = useState(false);
  const [reverseTransferOpen, setReverseTransferOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab);

  const { data, isPending, isError, error } = useQuery({
    queryKey: adminQueryKeys.inventory(page, effectiveStoreId),
    queryFn: () =>
      adminGet<InventoryPayload>(
        `inventory?page=${page}&storeId=${effectiveStoreId ?? ""}`,
      ),
    placeholderData: keepPreviousData,
    enabled: Boolean(effectiveStoreId),
  });

  if (!effectiveStoreId) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-4">
        <Alert>
          <AlertTriangle />
          <AlertTitle>Store required</AlertTitle>
          <AlertDescription>
            Select a store using the header switcher to manage online inventory.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isPending && !data) return <AdminPageSkeleton />;
  if (isError) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-4">
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Failed to load inventory</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Unknown error."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!data) return <AdminPageSkeleton />;

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
      <div className="mb-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Online inventory</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Variant-level stock for DHOOM Trading and manual online sales at{" "}
              <strong>{storeLabel}</strong>. Move stock between physical store
              inventory and the online pool using transfers below — no direct edits.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setReverseTransferOpen(true)}>
              <ArrowRightLeft data-icon="inline-start" />
              Online → Store
            </Button>
            <Button onClick={() => setTransferOpen(true)}>
              <ArrowRightLeft data-icon="inline-start" />
              Store → Online
            </Button>
          </div>
        </div>

        <InventoryMetricsBar stats={data.stats} storeLabel={storeLabel} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
        <TabsList>
          <TabsTrigger value="products">All products</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="recent">Recent transfers</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <InventoryPanel
            inventory={data.data}
            total={data.total}
            page={data.page}
            stats={data.stats}
            hideMetrics
          />
        </TabsContent>

        <TabsContent value="pending">
          <OnlineTransfersList storeId={effectiveStoreId} mode="pending" />
        </TabsContent>

        <TabsContent value="recent">
          <InventoryRecentTransfersList storeId={effectiveStoreId} />
        </TabsContent>
      </Tabs>

      <CreateOnlineTransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        storeId={effectiveStoreId}
        storeLabel={storeLabel}
        onSuccess={() => setActiveTab("pending")}
      />

      <CreateOnlineToPhysicalTransferDialog
        open={reverseTransferOpen}
        onOpenChange={setReverseTransferOpen}
        storeId={effectiveStoreId}
        storeLabel={storeLabel}
        onSuccess={() => setActiveTab("recent")}
      />
    </div>
  );
}
