"use client";

import { useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Layers,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import type { ItemUnit } from "@/common/erp/types";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { useAdminAlert } from "@/modules/admin/components/admin-alert-provider";
import {
  FormError,
  Modal,
  PrimaryBtn,
  SecondaryBtn,
} from "@/modules/admin/components/modal";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import {
  createItemUnitAction,
  deleteItemUnitAction,
  updateItemUnitAction,
} from "@/modules/items/actions/item-units.actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead, useSortableData } from "@/modules/admin/ui";
import { cn } from "@/lib/utils";

type ModalState =
  | { mode: "create" }
  | { mode: "edit"; unit: ItemUnit }
  | null;

const inputCls =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-900 outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10";

function UnitFormModal({
  mode,
  unit,
  onClose,
}: {
  mode: "create" | "edit";
  unit?: ItemUnit;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const abbreviation = (fd.get("abbreviation") as string).trim();
    const sortOrder = parseInt((fd.get("sortOrder") as string) || "0", 10);
    const isActive = fd.get("isActive") === "on";

    if (!name) {
      setError("Name is required.");
      return;
    }
    if (!abbreviation) {
      setError("Abbreviation is required.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const payload = {
          name,
          abbreviation,
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
          isActive,
        };

        if (mode === "create") {
          await createItemUnitAction(payload);
        } else if (unit) {
          await updateItemUnitAction(unit.id, payload);
        }

        await queryClient.invalidateQueries({ queryKey: adminQueryKeys.itemUnits() });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save.");
      }
    });
  }

  return (
    <Modal
      title={mode === "create" ? "Add item unit" : "Edit item unit"}
      subtitle="Units of measure used on inventory items, invoices, and purchase lines."
      onClose={onClose}
      size="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            Name
          </span>
          <input
            className={inputCls}
            name="name"
            defaultValue={unit?.name ?? ""}
            required
            placeholder="e.g. Piece"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            Abbreviation
          </span>
          <input
            className={cn(inputCls, "uppercase")}
            name="abbreviation"
            defaultValue={unit?.abbreviation ?? ""}
            required
            placeholder="e.g. PCS"
            maxLength={12}
          />
          <span className="text-[11px] text-slate-400">
            Short code shown on documents (saved uppercase).
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            Sort order
          </span>
          <input
            className={inputCls}
            name="sortOrder"
            type="number"
            defaultValue={unit?.sort_order ?? 0}
            min={0}
          />
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={unit?.is_active !== false}
            className="size-4 rounded border-slate-300"
          />
          <span className="text-[13px] font-medium text-slate-700">
            Active (available when adding items)
          </span>
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

export function AdminItemUnitsView() {
  const queryClient = useQueryClient();
  const { showError } = useAdminAlert();
  const [modal, setModal] = useState<ModalState>(null);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: adminQueryKeys.itemUnits(),
    queryFn: () => adminGet<{ data: ItemUnit[] }>("item-units"),
    staleTime: 5 * 60_000,
  });

  const units = data?.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return units;
    return units.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.abbreviation.toLowerCase().includes(q),
    );
  }, [units, search]);

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    filtered,
    "sort_order",
    "asc",
    (row, key) => {
      if (key === "status") return row.is_active ? 1 : 0;
      return (row as unknown as Record<string, unknown>)[key];
    },
  );

  if (isPending && !data) return <AdminPageSkeleton />;
  if (isError) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-4">
        <div className="flex items-start gap-3 rounded-xl border border-rose-200/60 bg-rose-50/40 p-5">
          <AlertTriangle className="size-5 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-semibold text-rose-900">
              Failed to load item units.
            </p>
            <p className="mt-1 text-sm text-rose-700">
              {error instanceof Error ? error.message : "Unknown error."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  async function handleDelete(unit: ItemUnit) {
    if (!confirm(`Delete "${unit.name}" (${unit.abbreviation})? This cannot be undone.`)) {
      return;
    }
    setDeletingId(unit.id);
    try {
      await deleteItemUnitAction(unit.id);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.itemUnits() });
    } catch (err) {
      showError(err, "Couldn't delete item unit");
    } finally {
      setDeletingId(null);
    }
  }

  const activeCount = units.filter((u) => u.is_active).length;

  return (
    <>
      {modal ? (
        <UnitFormModal
          mode={modal.mode}
          unit={modal.mode === "edit" ? modal.unit : undefined}
          onClose={() => setModal(null)}
        />
      ) : null}

      <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Item Units</h1>
            <p className="text-sm text-muted-foreground">
              Manage units of measure for inventory items, sales, and purchases.
            </p>
          </div>
          <Button onClick={() => setModal({ mode: "create" })} size="sm">
            <Plus className="size-4" />
            Add unit
          </Button>
        </div>

        <Card className="mb-4 overflow-hidden border border-border py-0 ring-0">
          <CardContent className="flex flex-wrap items-center divide-y divide-border p-0 sm:divide-x sm:divide-y-0">
            <div className="min-w-0 flex-1 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Total units</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{units.length}</p>
            </div>
            <div className="min-w-0 flex-1 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Active</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{activeCount}</p>
            </div>
            <div className="min-w-0 flex-1 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Inactive</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {units.length - activeCount}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border border-border py-0 ring-0">
          <CardContent className="flex flex-col gap-0 p-0">
            <div className="border-b p-2">
              <InputGroup className="h-9">
                <InputGroupAddon align="inline-start">
                  <Search aria-hidden />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name or abbreviation…"
                />
              </InputGroup>
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <Layers className="size-10 text-muted-foreground/40" aria-hidden />
                <p className="text-sm text-muted-foreground">
                  {search.trim()
                    ? "No units match your search."
                    : "No item units yet."}
                </p>
                {!search.trim() ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setModal({ mode: "create" })}
                  >
                    <Plus className="size-4" />
                    Create your first unit
                  </Button>
                ) : null}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <SortableTableHead
                      label="Name"
                      sortKey="name"
                      activeKey={sortKey}
                      direction={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTableHead
                      label="Abbreviation"
                      sortKey="abbreviation"
                      activeKey={sortKey}
                      direction={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTableHead
                      label="Sort"
                      sortKey="sort_order"
                      activeKey={sortKey}
                      direction={sortDirection}
                      onSort={toggleSort}
                      align="right"
                    />
                    <SortableTableHead
                      label="Status"
                      sortKey="status"
                      activeKey={sortKey}
                      direction={sortDirection}
                      onSort={toggleSort}
                    />
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((unit) => (
                    <TableRow key={unit.id}>
                      <TableCell className="font-medium">{unit.name}</TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[12px] font-medium text-foreground">
                          {unit.abbreviation}
                        </code>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {unit.sort_order}
                      </TableCell>
                      <TableCell>
                        {unit.is_active === false ? (
                          <Badge variant="secondary">Inactive</Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-emerald-200 bg-emerald-50 text-emerald-700"
                          >
                            Active
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setModal({ mode: "edit", unit })}
                            aria-label={`Edit ${unit.name}`}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => void handleDelete(unit)}
                            disabled={deletingId === unit.id}
                            aria-label={`Delete ${unit.name}`}
                            className="text-rose-600 hover:text-rose-700"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="border-t px-3 py-2 text-xs text-muted-foreground">
              {search.trim()
                ? `${filtered.length} of ${units.length} units`
                : `${units.length} units`}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
