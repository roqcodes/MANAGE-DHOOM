"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import type { ErpLandedCostItem } from "@/common/erp/purchasing-types";
import { adminGet, adminPatch, adminPost } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableHead } from "@/components/ui/table";
import {
  AdminDataTable,
  AdminDataTableRowsSkeleton,
  AdminListCard,
  AdminPageHeader,
  AdminPageLayout,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableRow,
  ErpListRowActions,
  SortableTableHead,
  useDebouncedValue,
  useSortableData,
} from "@/modules/admin/ui";

export function LandedCostsListView() {
  const [rows, setRows] = useState<ErpLandedCostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [tax, setTax] = useState("0");
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 350);
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(rows, "name", "asc");

  function reload() {
    setError(null);
    return adminGet<{ data: ErpLandedCostItem[] }>("erp/landed-costs")
      .then((res) => setRows(res.data))
      .catch((err: Error) => {
        setRows([]);
        setError(err.message || "Failed to load landed cost items");
      });
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);
  const initialLoading = loading && rows.length === 0;


  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return sorted;
    const q = debouncedSearch.trim().toLowerCase();
    return sorted.filter((r) => r.name.toLowerCase().includes(q));
  }, [sorted, debouncedSearch]);

  function saveItem(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    const rateValue = rate.trim() === "" ? 0 : parseFloat(rate);
    const taxValue = tax.trim() === "" ? 0 : parseFloat(tax);
    if (!Number.isFinite(rateValue) || rateValue < 0) {
      setError("Default rate must be zero or a positive number.");
      return;
    }
    if (!Number.isFinite(taxValue) || taxValue < 0) {
      setError("Tax % must be zero or a positive number.");
      return;
    }
    startTransition(async () => {
      try {
        setError(null);
        if (editId) {
          await adminPatch("erp/landed-costs", {
            id: editId,
            name: name.trim(),
            rate: rateValue,
            taxRatePercent: taxValue,
          });
        } else {
          await adminPost("erp/landed-costs", {
            name: name.trim(),
            rate: rateValue,
            taxRatePercent: taxValue,
          });
        }
        setName("");
        setRate("");
        setTax("0");
        setEditId(null);
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }
  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Landed cost item master"
        breadcrumb={[{ label: "Landed costs", href: "/admin/erp/landed-costs" }]}
        description="Reusable landed cost templates applied when recording purchase bills."
      />

      {error ? (
        <Card className="border-rose-200 bg-rose-50/50 ring-0">
          <CardContent className="py-3 text-sm text-rose-800">{error}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={saveItem} className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="Freight, customs…"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Default rate</Label>
              <Input
                placeholder="0.00"
                type="number"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Tax %</Label>
              <Input type="number" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={isPending}>
                {editId ? "Update" : "Add item"}
              </Button>
              {editId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditId(null);
                    setName("");
                    setRate("");
                    setTax("0");
                  }}
                >
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <AdminListCard isLoading={initialLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search item name…"
        isEmpty={!initialLoading && (filtered.length === 0)}
        emptyMessage="No landed cost items yet."
        isFiltering={Boolean(debouncedSearch.trim())}
        onClearFilters={() => setSearch("")}
        footer={<span>{filtered.length} items</span>}
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="Name"
              sortKey="name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Rate"
              sortKey="rate"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
            <SortableTableHead
              label="Tax %"
              sortKey="tax_rate_percent"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
            <SortableTableHead
              label="Active"
              sortKey="is_active"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <TableHead className="w-28 text-right" />
          </AdminTableHeader>
          {initialLoading ? (
            <AdminDataTableRowsSkeleton rows={8} columns={6} />
          ) : (
          <AdminTableBody>
            {filtered.map((r) => (
              <AdminTableRow key={r.id}>
                <AdminTableCell className="font-medium">{r.name}</AdminTableCell>
                <AdminTableCell align="right">{formatCurrencyAmount(r.rate)}</AdminTableCell>
                <AdminTableCell align="right">{r.tax_rate_percent}</AdminTableCell>
                <AdminTableCell>{r.is_active ? "Yes" : "No"}</AdminTableCell>
                <AdminTableCell align="right">
                  <ErpListRowActions
                    menuItems={[
                      {
                        label: "Edit",
                        onClick: () => {
                          setEditId(r.id);
                          setName(r.name);
                          setRate(String(r.rate));
                          setTax(String(r.tax_rate_percent));
                        },
                      },
                      {
                        label: r.is_active ? "Deactivate" : "Activate",
                        onClick: () => {
                          startTransition(async () => {
                            try {
                              setError(null);
                              await adminPatch("erp/landed-costs", {
                                id: r.id,
                                isActive: !r.is_active,
                              });
                              await reload();
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Update failed");
                            }
                          });
                        },
                      },
                    ]}
                  />
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
          )}
        </AdminDataTable>
      </AdminListCard>
    </AdminPageLayout>
  );
}
