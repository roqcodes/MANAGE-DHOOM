"use client";

import { useMemo, useState } from "react";
import { Ban, ChevronDown, Columns3, Search } from "lucide-react";

import type { AdminUser } from "@/common/admin/types";
import type { CustomerStats } from "@/modules/customers/services/customers.service";
import { Pagination } from "@/modules/admin/components/pagination";
import {
  CustomersBulkActionBar,
  CustomersDataTable,
  exportCustomersCsv,
} from "@/modules/customers/components/customers-data-table";
import { CustomersMetricsBar } from "@/modules/customers/components/customers-metrics-bar";
import {
  CUSTOMER_STATUS_FILTERS,
  formatCustomerId,
  matchesCustomerStatusFilter,
  type CustomerStatusFilter,
} from "@/modules/customers/components/customers-ui";
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

export function CustomersPanel({
  users,
  total,
  page,
  stats,
  onAddCustomer,
}: {
  users: AdminUser[];
  total: number;
  page: number;
  stats: CustomerStats;
  onAddCustomer?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CustomerStatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return users.filter((u) => {
      if (!matchesCustomerStatusFilter(u, statusFilter)) return false;
      if (!q) return true;

      const name = (u.name ?? "").toLowerCase();
      const email = (u.email ?? "").toLowerCase();
      const phone = (u.phone ?? "").toLowerCase();
      const company = (u.company_name ?? "").toLowerCase();
      const location = (u.location ?? "").toLowerCase();
      const number = formatCustomerId(u).toLowerCase();
      const idShort = u.id.slice(0, 8).toLowerCase();
      return (
        name.includes(q) ||
        email.includes(q) ||
        phone.includes(q) ||
        company.includes(q) ||
        location.includes(q) ||
        number.includes(q) ||
        idShort.includes(q)
      );
    });
  }, [users, search, statusFilter]);

  const isFiltering = search.trim().length > 0 || statusFilter !== "all";

  const activeStatusLabel =
    CUSTOMER_STATUS_FILTERS.find((f) => f.id === statusFilter)?.label ??
    "All Statuses";

  return (
    <div className="flex flex-col gap-4">
      <CustomersMetricsBar
        stats={stats}
        onExport={() => exportCustomersCsv(filtered)}
        onAddCustomer={onAddCustomer}
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
                      {CUSTOMER_STATUS_FILTERS.map((option) => (
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
                placeholder="Search name, company, number, email, mobile..."
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
            <CustomersBulkActionBar
              selectedIds={selectedIds}
              onClearSelection={() => setSelectedIds(new Set())}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <Ban className="size-12 text-muted-foreground/30" aria-hidden />
              <p className="text-sm text-muted-foreground">
                {isFiltering
                  ? "No customers match your filters on this page."
                  : "No customers yet."}
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
              ) : null}
            </div>
          ) : (
            <CustomersDataTable
              users={filtered}
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
            />
          )}

          <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
            <span>
              {isFiltering
                ? `${filtered.length} of ${users.length} on this page`
                : `${Math.min(users.length, total)} of ${total.toLocaleString("en-IN")} customers`}
            </span>
          </div>

          {!isFiltering && total > users.length ? (
            <Pagination total={total} page={page} basePath="/admin/customers" />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
