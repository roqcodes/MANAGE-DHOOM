"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Lock, Plus, Trash2 } from "lucide-react";

import type { AccountListRow, AccountTypeRow } from "@/common/erp/finance-types";
import {
  FormError,
  Modal,
  PrimaryBtn,
  SecondaryBtn,
  inputCls,
  selectCls,
} from "@/modules/admin/components/modal";
import { Pagination } from "@/modules/admin/components/pagination";
import { adminDelete, adminGet, adminPatch, adminPost } from "@/modules/admin/lib/admin-api-client";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TableHead } from "@/components/ui/table";
import {
  AdminDataTable,
  AdminListCard,
  AdminListFooter,
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
import { useErpStores } from "@/modules/erp/components/use-erp-stores";

type ModalState = { mode: "create" } | { mode: "edit"; row: AccountListRow } | null;

function AccountFormModal({
  mode,
  row,
  accountTypes,
  storeId,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  row?: AccountListRow;
  accountTypes: AccountTypeRow[];
  storeId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accountTypeId, setAccountTypeId] = useState(row?.account_type_id ?? "");
  const [code, setCode] = useState(row?.code ?? "");
  const [name, setName] = useState(row?.name ?? "");
  const [description, setDescription] = useState(row?.description ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountTypeId) return setError("Account type is required.");
    if (!code.trim()) return setError("Code is required.");
    if (!name.trim()) return setError("Name is required.");

    const payload = {
      accountTypeId,
      code: code.trim(),
      name: name.trim(),
      description: description.trim(),
      storeId: row?.store_id ?? storeId ?? undefined,
    };

    startTransition(async () => {
      try {
        if (mode === "create") {
          await adminPost("erp/accounts", payload);
        } else if (row) {
          await adminPatch(`erp/accounts/${row.id}`, payload);
        }
        onSaved();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save.");
      }
    });
  }

  return (
    <Modal
      title={mode === "create" ? "Add account" : "Edit account"}
      subtitle="Ledger accounts used across expenses, banking, and journals."
      onClose={onClose}
      size="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            Account type *
          </span>
          <select
            className={selectCls}
            value={accountTypeId}
            onChange={(e) => setAccountTypeId(e.target.value)}
            required
            disabled={mode === "edit"}
          >
            <option value="">Select account type</option>
            {accountTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.account_category})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            Code *
          </span>
          <input
            className={inputCls}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code"
            required
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            Name *
          </span>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            required
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            Description
          </span>
          <input
            className={inputCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
          />
        </label>

        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
          <PrimaryBtn type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </PrimaryBtn>
        </div>
      </form>
    </Modal>
  );
}

export function AccountsListView() {
  const searchParams = useSearchParams();
  const { activeStoreId } = useErpStores();
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const [rows, setRows] = useState<AccountListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [accountTypes, setAccountTypes] = useState<AccountTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [modal, setModal] = useState<ModalState>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 350);
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(rows, "name", "asc");

  function loadRows(term = debouncedSearch, pageNum = page) {
    setLoading(true);
    const q = new URLSearchParams();
    q.set("page", String(pageNum));
    if (term.trim()) q.set("search", term.trim());
    if (activeStoreId) q.set("storeId", activeStoreId);
    adminGet<{ data: AccountListRow[]; total: number }>(`erp/accounts?${q.toString()}`)
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    adminGet<{ data: AccountTypeRow[] }>("erp/account-types").then((res) =>
      setAccountTypes(res.data),
    );
  }, []);

  useEffect(() => {
    loadRows();
  }, [page, debouncedSearch, activeStoreId]);

  const listParams: Record<string, string> = {};
  if (debouncedSearch.trim()) listParams.search = debouncedSearch.trim();

  const editableCount = useMemo(
    () => rows.filter((r) => !r.is_system && !r.is_locked).length,
    [rows],
  );

  async function handleDelete(row: AccountListRow) {
    if (row.is_system || row.is_locked) return;
    if (!confirm(`Delete account "${row.name}" (${row.code})?`)) return;
    setDeletingId(row.id);
    try {
      await adminDelete(`erp/accounts/${row.id}`);
      loadRows();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't delete account");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading && rows.length === 0) return <AdminPageSkeleton />;

  return (
    <>
      {modal ? (
        <AccountFormModal
          mode={modal.mode}
          row={modal.mode === "edit" ? modal.row : undefined}
          accountTypes={accountTypes}
          storeId={activeStoreId}
          onClose={() => setModal(null)}
          onSaved={() => loadRows()}
        />
      ) : null}

      <AdminPageLayout>
        <AdminPageHeader
          title="Accounts"
          breadcrumb={[{ label: "Accounts", href: "/admin/erp/accounts" }]}
          description="Chart of accounts for the active store. System and locked accounts cannot be edited or deleted."
          actions={
            <Button size="sm" onClick={() => setModal({ mode: "create" })}>
              <Plus className="size-4" />
              Add account
            </Button>
          }
        />

        <Card className="overflow-hidden border border-border py-0 ring-0">
          <CardContent className="flex flex-wrap items-center divide-y divide-border p-0 sm:divide-x sm:divide-y-0">
            <div className="min-w-0 flex-1 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Total accounts</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{total}</p>
            </div>
            <div className="min-w-0 flex-1 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Editable</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{editableCount}</p>
            </div>
            <div className="min-w-0 flex-1 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Locked / system</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {rows.length - editableCount}
              </p>
            </div>
          </CardContent>
        </Card>

        <AdminListCard
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search name, code, or description…"
          isEmpty={sorted.length === 0}
          emptyMessage={
            debouncedSearch.trim() ? "No accounts match your search." : "No accounts yet."
          }
          isFiltering={Boolean(debouncedSearch.trim())}
          onClearFilters={() => setSearch("")}
          footer={
            total > 50 ? (
              <AdminListFooter total={total} label="accounts" page={page} pageSize={50} />
            ) : (
              <span>{total} accounts</span>
            )
          }
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
                label="Description"
                sortKey="description"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="Account type"
                sortKey="account_type_name"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="Code"
                sortKey="code"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <TableHead className="w-28 text-right" />
            </AdminTableHeader>
            <AdminTableBody>
              {sorted.map((row) => {
                const locked = row.is_system || row.is_locked;
                return (
                  <AdminTableRow key={row.id}>
                    <AdminTableCell className="font-medium">{row.name}</AdminTableCell>
                    <AdminTableCell className="text-muted-foreground">
                      {row.description || "—"}
                    </AdminTableCell>
                    <AdminTableCell>
                      <Badge variant="outline">{row.account_type_name}</Badge>
                    </AdminTableCell>
                    <AdminTableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-[12px] font-medium">
                        {row.code}
                      </code>
                    </AdminTableCell>
                    <AdminTableCell align="right">
                      {locked ? (
                        <Lock
                          className="ml-auto size-4 text-muted-foreground/60"
                          aria-label="Locked account"
                        />
                      ) : (
                        <ErpListRowActions
                          menuItems={[
                            {
                              label: "Edit",
                              onClick: () => setModal({ mode: "edit", row }),
                            },
                            {
                              label: "Delete",
                              destructive: true,
                              separatorBefore: true,
                              disabled: deletingId === row.id,
                              onClick: () => void handleDelete(row),
                            },
                          ]}
                        />
                      )}
                    </AdminTableCell>
                  </AdminTableRow>
                );
              })}
            </AdminTableBody>
          </AdminDataTable>
        </AdminListCard>

        {total > 50 ? (
          <Pagination
            page={page}
            total={total}
            basePath="/admin/erp/accounts"
            listParams={listParams}
            pageSize={50}
          />
        ) : null}
      </AdminPageLayout>
    </>
  );
}
