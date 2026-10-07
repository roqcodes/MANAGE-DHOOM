"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import type { JournalEntryListRow } from "@/common/erp/finance-types";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatErpDocRef } from "@/lib/erp-document-ref";
import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import {
  AdminDataTable,
  AdminListCard,
  AdminPageHeader,
  AdminPageLayout,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableLink,
  AdminTableRow,
  ErpListRowActions,
  SortableTableHead,
  useDebouncedValue,
  useErpFormModal,
  useSortableData,
} from "@/modules/admin/ui";

import { useErpStores } from "@/modules/erp/components/use-erp-stores";
import { JournalEntryFormView } from "@/modules/admin/views/finance/journal-entry-form-view";

export function JournalEntriesListView() {
  const { activeStoreId } = useErpStores();
  const { isOpen, modalProps, openNew } = useErpFormModal("/admin/erp/journal-entries");
  const [reloadToken, setReloadToken] = useState(0);
  const [rows, setRows] = useState<JournalEntryListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "transaction_date",
    "desc",
  );

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams({ page: "0" });
    if (activeStoreId) q.set("storeId", activeStoreId);
    adminGet<{ data: JournalEntryListRow[] }>(`erp/journal-entries?${q.toString()}`)
      .then((res) => setRows(res.data))
      .finally(() => setLoading(false));
  }, [activeStoreId, reloadToken]);

  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return sorted;
    const q = debouncedSearch.trim().toLowerCase();
    return sorted.filter(
      (r) =>
        r.journal_number.toLowerCase().includes(q) ||
        formatErpDocRef("JE", r.id).toLowerCase().includes(q) ||
        (r.description?.toLowerCase().includes(q) ?? false) ||
        (r.store_name?.toLowerCase().includes(q) ?? false) ||
        (r.source_entity_type?.toLowerCase().includes(q) ?? false),
    );
  }, [sorted, debouncedSearch]);

  if (loading && rows.length === 0) return <AdminPageSkeleton />;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Journal entries"
        breadcrumb={[{ label: "Journal entries", href: "/admin/erp/journal-entries" }]}
        description="Posted journals from invoices, payments, bills, and manual entries."
        actions={
          <Button size="sm" onClick={() => openNew()}>
            <Plus data-icon="inline-start" />
            Manual journal
          </Button>
        }
      />

      <AdminListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search journal number, description…"
        isEmpty={filtered.length === 0}
        emptyMessage="No journal entries yet."
        isFiltering={Boolean(debouncedSearch.trim())}
        onClearFilters={() => setSearch("")}
        footer={<span>{filtered.length} entries</span>}
      >
        <AdminDataTable>
          <AdminTableHeader>
            <SortableTableHead
              label="Number"
              sortKey="journal_number"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Date"
              sortKey="transaction_date"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Description"
              sortKey="description"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Source"
              sortKey="source_entity_type"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Store"
              sortKey="store_name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Debit"
              sortKey="total_debit"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
            <SortableTableHead
              label="Credit"
              sortKey="total_credit"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
            <TableHead className="w-28 text-right" />
          </AdminTableHeader>
          <AdminTableBody>
            {filtered.map((row) => (
              <AdminTableRow key={row.id}>
                <AdminTableCell>
                  <AdminTableLink
                    href={`/admin/erp/journal-entries/${row.id}`}
                    title={row.journal_number}
                  >
                    {formatErpDocRef("JE", row.id)}
                  </AdminTableLink>
                </AdminTableCell>
                <AdminTableCell>{row.transaction_date}</AdminTableCell>
                <AdminTableCell className="max-w-xs truncate">{row.description}</AdminTableCell>
                <AdminTableCell className="text-muted-foreground">
                  {row.source_entity_type ?? "manual"}
                </AdminTableCell>
                <AdminTableCell>{row.store_name ?? "—"}</AdminTableCell>
                <AdminTableCell align="right" className="tabular-nums">
                  {formatCurrencyAmount(row.total_debit)}
                </AdminTableCell>
                <AdminTableCell align="right" className="tabular-nums">
                  {formatCurrencyAmount(row.total_credit)}
                </AdminTableCell>
                <AdminTableCell align="right">
                  <ErpListRowActions viewHref={`/admin/erp/journal-entries/${row.id}`} />
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      </AdminListCard>

      {isOpen ? (
        <JournalEntryFormView
          variant="modal"
          open={modalProps.open}
          onOpenChange={modalProps.onOpenChange}
          onSuccess={() => setReloadToken((t) => t + 1)}
        />
      ) : null}
    </AdminPageLayout>
  );
}
