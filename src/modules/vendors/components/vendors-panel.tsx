"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Ban, ChevronDown, Columns3, Search } from "lucide-react";

import type { Vendor, VendorCatalogStats } from "@/common/admin/types";
import { Pagination } from "@/modules/admin/components/pagination";
import { VendorManageModal } from "@/modules/vendors/components/vendor-manage-modal";
import {
  exportVendorsCsv,
  VendorsBulkActionBar,
  VendorsDataTable,
} from "@/modules/vendors/components/vendors-data-table";
import { VendorsMetricsBar } from "@/modules/vendors/components/vendors-metrics-bar";
import {
  matchesVendorStatusFilter,
  VENDOR_STATUS_FILTERS,
  type VendorStatusFilter,
} from "@/modules/vendors/components/vendors-ui";
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

type ManageModalState =
  | { mode: "create" }
  | { mode: "edit"; vendor: Vendor }
  | null;

export function VendorsPanel({
  vendors,
  total,
  page,
  stats,
}: {
  vendors: Vendor[];
  total: number;
  page: number;
  stats: VendorCatalogStats;
}) {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<ManageModalState>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<VendorStatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return vendors.filter((v) => {
      if (!matchesVendorStatusFilter(v, statusFilter)) return false;
      if (!q) return true;

      const name = (v.name ?? "").toLowerCase();
      const contact = (v.contact ?? "").toLowerCase();
      const idShort = v.id.slice(0, 8).toLowerCase();
      return name.includes(q) || contact.includes(q) || idShort.includes(q);
    });
  }, [vendors, search, statusFilter]);

  const isFiltering = search.trim().length > 0 || statusFilter !== "all";

  const activeStatusLabel =
    VENDOR_STATUS_FILTERS.find((f) => f.id === statusFilter)?.label ??
    "All Statuses";

  return (
    <>
      <AnimatePresence>
        {modal ? (
          <VendorManageModal
            key={modal.mode === "create" ? "create" : modal.vendor.id}
            mode={modal.mode}
            vendor={modal.mode === "edit" ? modal.vendor : undefined}
            onClose={() => {
              setModal(null);
              void queryClient.invalidateQueries({ queryKey: ["admin", "vendors"] });
            }}
          />
        ) : null}
      </AnimatePresence>

      <div className="flex flex-col gap-4">
        <VendorsMetricsBar
          stats={stats}
          onExport={() => exportVendorsCsv(filtered)}
          onImport={() => exportVendorsCsv(vendors)}
          onCreate={() => setModal({ mode: "create" })}
        />

        <Card className="overflow-hidden border border-border py-0 ring-0">
          <CardContent className="flex flex-col gap-0 p-0">
            <div className="border-b p-2">
              <InputGroup className="h-9">
                <InputGroupAddon align="inline-start" className="pl-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <InputGroupButton
                          variant="ghost"
                          size="sm"
                          className="gap-1 px-2"
                        />
                      }
                    >
                      {activeStatusLabel}
                      <ChevronDown />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuGroup>
                        {VENDOR_STATUS_FILTERS.map((option) => (
                          <DropdownMenuItem
                            key={option.id}
                            onClick={() => setStatusFilter(option.id)}
                          >
                            {option.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                  placeholder="Search vendors, contact..."
                />
                <InputGroupAddon align="inline-end" className="gap-1 pr-1">
                  <InputGroupButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Column view"
                  >
                    <Columns3 />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </div>

            <div className="px-2 pt-2">
              <VendorsBulkActionBar
                selectedIds={selectedIds}
                onClearSelection={() => setSelectedIds(new Set())}
              />
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <Ban className="size-12 text-muted-foreground/30" aria-hidden />
                <p className="text-sm text-muted-foreground">
                  {isFiltering
                    ? "No vendors match your filters on this page."
                    : "No vendors yet."}
                </p>
                {isFiltering ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setStatusFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setModal({ mode: "create" })}>
                    Add your first vendor
                  </Button>
                )}
              </div>
            ) : (
              <VendorsDataTable
                vendors={filtered}
                selectedIds={selectedIds}
                onSelectedIdsChange={setSelectedIds}
                onEdit={(vendor) => setModal({ mode: "edit", vendor })}
              />
            )}

            <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
              <span>
                {isFiltering
                  ? `${filtered.length} of ${vendors.length} on this page`
                  : `${Math.min(vendors.length, total)} of ${total.toLocaleString("en-IN")} vendors`}
              </span>
            </div>

            {!isFiltering && total > vendors.length ? (
              <Pagination total={total} page={page} basePath="/admin/vendors" />
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
