"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Layers, Lock, Plus, Trash2 } from "lucide-react";

import {
  ACCOUNT_CATEGORIES,
  type AccountTypeRow,
} from "@/common/erp/finance-types";
import {
  ModalFormFooter,
  Modal,
  PrimaryBtn,
  SecondaryBtn,
  fieldControlCls,
  inputCls,
  selectCls,
} from "@/modules/admin/components/modal";
import {
  validateBeforeFormSave,
  formErrorsListAdapter,
  clearFormSubmitFeedback,
  FormValidationScope,
  useFormFieldValidation,
} from "@/modules/admin/ui";
import { adminDelete, adminGet, adminPatch, adminPost } from "@/modules/admin/lib/admin-api-client";
import { actionErrorMessage } from "@/modules/admin/lib/form-submit-errors";
import { useAdminAlert } from "@/modules/admin/components/admin-alert-provider";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TableHead } from "@/components/ui/table";
import {
  AdminDataTable,
  AdminDataTableRowsSkeleton,
  AdminListCard,
  AdminPageHeader,
  AdminPrimaryAction,
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

type ModalState = { mode: "create" } | { mode: "edit"; row: AccountTypeRow } | null;

function AccountTypeFormModal({
  mode,
  row,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  row?: AccountTypeRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Modal
      title={mode === "create" ? "Add account type" : "Edit account type"}
      subtitle="Classify ledger accounts by category and type name."
      onClose={onClose}
      size="md"
    >
      <FormValidationScope resetKey={`${mode}-${row?.id ?? "new"}`}>
        <AccountTypeFormModalBody mode={mode} row={row} onClose={onClose} onSaved={onSaved} />
      </FormValidationScope>
    </Modal>
  );
}

function AccountTypeFormModalBody({
  mode,
  row,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  row?: AccountTypeRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<string[]>([]);
  const fieldValidation = useFormFieldValidation();
  const [accountCategory, setAccountCategory] = useState(row?.account_category ?? "Assets");
  const [name, setName] = useState(row?.name ?? "");
  const [description, setDescription] = useState(row?.description ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !validateBeforeFormSave(
        [
        { key: "name", ok: Boolean(name.trim()), message: "Name is required." },
        { key: "description", ok: Boolean(description.trim()), message: "Description is required." },
      ],
        {
          markFieldValidationFailed: fieldValidation.markFieldValidationFailed,
          clearFieldValidation: fieldValidation.clearFieldValidation,
          setFormErrors: formErrorsListAdapter(setErrors),
        },
      )
    ) {
      return;
    }

const payload = {
      accountCategory,
      name: name.trim(),
      description: description.trim(),
    };

    startTransition(async () => {
      try {
        if (mode === "create") {
          await adminPost("erp/account-types", payload);
        } else if (row) {
          await adminPatch(`erp/account-types/${row.id}`, payload);
        }
        clearFormSubmitFeedback({
          setFormErrors: formErrorsListAdapter(setErrors),
          clearFieldValidation: fieldValidation.clearFieldValidation,
        });
        onSaved();
        onClose();
      } catch (err) {
        setErrors([actionErrorMessage(err, "Failed to save.")]);
      }
    });
  }

  return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            Account category *
          </span>
          <select
            className={selectCls}
            value={accountCategory}
            onChange={(e) => setAccountCategory(e.target.value)}
            required
          >
            {ACCOUNT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            Name *
          </span>
          <input
            className={fieldControlCls(inputCls, fieldValidation.isFieldInvalid("name"))}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            required
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            Description *
          </span>
          <input
            className={fieldControlCls(inputCls, fieldValidation.isFieldInvalid("description"))}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            required
          />
        </label>

        <ModalFormFooter errors={errors}>
          <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
          <PrimaryBtn type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </PrimaryBtn>
        </ModalFormFooter>
      </form>
  );
}

export function AccountTypesListView() {
  const [rows, setRows] = useState<AccountTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 350);
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    rows,
    "account_category",
    "asc",
  );

  function loadRows(term = debouncedSearch) {
    setLoading(true);
    const q = term.trim() ? `?search=${encodeURIComponent(term.trim())}` : "";
    adminGet<{ data: AccountTypeRow[] }>(`erp/account-types${q}`)
      .then((res) => setRows(res.data))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRows();
  }, [debouncedSearch]);
  const initialLoading = loading && rows.length === 0;

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.account_category.toLowerCase().includes(q),
    );
  }, [sorted, debouncedSearch]);

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.account_category, (map.get(row.account_category) ?? 0) + 1);
    }
    return map;
  }, [rows]);

  const { confirm, showError } = useAdminAlert();

  async function handleDelete(row: AccountTypeRow) {
    if (row.is_system) return;
    const ok = await confirm({
      title: "Delete account type?",
      message: `Delete "${row.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(row.id);
    try {
      await adminDelete(`erp/account-types/${row.id}`);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      showError(err, "Couldn't delete account type");
    } finally {
      setDeletingId(null);
    }
  }
  return (
    <>
      {modal ? (
        <AccountTypeFormModal
          mode={modal.mode}
          row={modal.mode === "edit" ? modal.row : undefined}
          onClose={() => setModal(null)}
          onSaved={() => loadRows()}
        />
      ) : null}

      <AdminPageLayout>
        <AdminPageHeader
          title="Account types"
          breadcrumb={[{ label: "Account types", href: "/admin/erp/account-types" }]}
          description="Categories and types for your chart of accounts. System types are locked."
          actions={
            <AdminPrimaryAction onClick={() => setModal({ mode: "create" })}>
              <Plus data-icon="inline-start" />
              Add account type
            </AdminPrimaryAction>
          }
        />

        <Card className="overflow-hidden border border-border py-0 ring-0">
          <CardContent className="flex flex-wrap items-center divide-y divide-border p-0 sm:divide-x sm:divide-y-0">
            <div className="min-w-0 flex-1 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Total types</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{rows.length}</p>
            </div>
            <div className="min-w-0 flex-1 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Categories</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{categoryCounts.size}</p>
            </div>
            <div className="min-w-0 flex-1 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">System</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {rows.filter((r) => r.is_system).length}
              </p>
            </div>
          </CardContent>
        </Card>

        <AdminListCard isLoading={initialLoading}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search category, name, or description…"
          isEmpty={!initialLoading && (filtered.length === 0)}
          emptyMessage={
            debouncedSearch.trim() ? "No account types match your search." : "No account types yet."
          }
          isFiltering={Boolean(debouncedSearch.trim())}
          onClearFilters={() => setSearch("")}
          footer={
            <span>
              {debouncedSearch.trim()
                ? `${filtered.length} of ${rows.length} types`
                : `${rows.length} types`}
            </span>
          }
        >
          <AdminDataTable>
            <AdminTableHeader>
              <SortableTableHead
                label="Account category"
                sortKey="account_category"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
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
              <TableHead className="w-28 text-right" />
            </AdminTableHeader>
            {initialLoading ? (
            <AdminDataTableRowsSkeleton rows={8} columns={6} />
          ) : (
          <AdminTableBody>
              {filtered.map((row) => {
                const locked = row.is_system;
                return (
                  <AdminTableRow key={row.id}>
                    <AdminTableCell>
                      <Badge variant="outline">{row.account_category}</Badge>
                    </AdminTableCell>
                    <AdminTableCell className="font-medium">{row.name}</AdminTableCell>
                    <AdminTableCell className="text-muted-foreground">{row.description}</AdminTableCell>
                    <AdminTableCell align="right">
                      {locked ? (
                        <Lock
                          className="ml-auto size-4 text-muted-foreground/60"
                          aria-label="System account type"
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
          )}
          </AdminDataTable>
        </AdminListCard>
      </AdminPageLayout>
    </>
  );
}
