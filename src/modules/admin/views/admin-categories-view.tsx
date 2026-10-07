"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useTransition } from "react";
import {
  AlertTriangle,
  FolderTree,
  ImageIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import type { Category } from "@/common/admin/types";
import { getCategoryThumbnail } from "@/modules/products/lib/categories.utils";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { useAdminAlert } from "@/modules/admin/components/admin-alert-provider";
import {
  FormError,
  Modal,
  PrimaryBtn,
  SecondaryBtn,
} from "@/modules/admin/components/modal";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "@/modules/products/actions/categories.actions";
import { ProductImageField } from "@/modules/products/components/product-image-field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead, useSortableData } from "@/modules/admin/ui";
import { Card, CardContent } from "@/components/ui/card";

interface CategoriesPayload {
  categories: Category[];
}

type ModalState =
  | { mode: "create" }
  | { mode: "edit"; category: Category }
  | null;

const inputCls =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-900 outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10";

const selectCls = `${inputCls} cursor-pointer`;

function CategoryThumbnail({ category }: { category: Category }) {
  const url = getCategoryThumbnail(category);
  return (
    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200/80">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <ImageIcon className="size-4 text-slate-400" aria-hidden />
      )}
    </div>
  );
}

function CategoryFormModal({
  mode,
  category,
  categories,
  onClose,
}: {
  mode: "create" | "edit";
  category?: Category;
  categories: Category[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState(
    category?.image_url?.trim() || category?.thumbnail_url?.trim() || "",
  );
  const [uploading, setUploading] = useState(false);

  const parentOptions = categories.filter(
    (c) => c.id !== category?.id && !c.parent_id,
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const parentId = (fd.get("parentId") as string) || null;
    const sortOrder = parseInt((fd.get("sortOrder") as string) || "0", 10);
    const isActive = fd.get("isActive") === "on";
    const slug = (fd.get("slug") as string).trim() || null;
    const description = (fd.get("description") as string).trim() || null;

    if (!name) {
      setError("Name is required.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const payload = {
          name,
          parentId,
          imageUrl: imageUrl.trim() || null,
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
          isActive,
          slug,
          description,
        };

        if (mode === "create") {
          await createCategoryAction(payload);
        } else if (category) {
          await updateCategoryAction(category.id, payload);
        }

        await queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save.");
      }
    });
  }

  return (
    <Modal
      title={mode === "create" ? "Add category" : "Edit category"}
      onClose={onClose}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            Name
          </span>
          <input
            className={inputCls}
            name="name"
            defaultValue={category?.name ?? ""}
            required
            placeholder="e.g. Cookware"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            Parent category
          </span>
          <select
            name="parentId"
            className={selectCls}
            defaultValue={category?.parent_id ?? ""}
          >
            <option value="">None (top-level)</option>
            {parentOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
              Sort order
            </span>
            <input
              className={inputCls}
              name="sortOrder"
              type="number"
              defaultValue={category?.sort_order ?? 0}
              min={0}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
              Slug
            </span>
            <input
              className={inputCls}
              name="slug"
              defaultValue={category?.slug ?? ""}
              placeholder="auto-generated if empty"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            Description
          </span>
          <textarea
            className="min-h-[52px] w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] text-slate-900 outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10"
            name="description"
            defaultValue={category?.description ?? ""}
            rows={2}
            placeholder="Optional description for storefront"
          />
        </label>

        <div>
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            Banner image
          </span>
          <ProductImageField
            value={imageUrl}
            onChange={setImageUrl}
            onUploadingChange={setUploading}
          />
          <p className="mt-1 text-[11px] text-slate-400">
            One image for icons, grids, sidebars, and promo cards in the app.
          </p>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={category?.is_active !== false}
            className="size-4 rounded border-slate-300"
          />
          <span className="text-[13px] font-medium text-slate-700">
            Active (visible in storefront)
          </span>
        </label>

        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
          <PrimaryBtn type="submit" disabled={isPending || uploading}>
            {uploading ? "Uploading…" : isPending ? "Saving…" : "Save"}
          </PrimaryBtn>
        </div>
      </form>
    </Modal>
  );
}

export function AdminCategoriesView() {
  const queryClient = useQueryClient();
  const { showError } = useAdminAlert();
  const [modal, setModal] = useState<ModalState>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: () => adminGet<CategoriesPayload>("categories"),
  });

  const categories = data?.categories ?? [];

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    categories,
    "sort_order",
    "asc",
    (row, key) => {
      if (key === "parent") {
        const parent = categories.find((c) => c.id === row.parent_id);
        return parent?.name ?? "";
      }
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
              Failed to load categories.
            </p>
            <p className="mt-1 text-sm text-rose-700">
              {error instanceof Error ? error.message : "Unknown error."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  async function handleDelete(category: Category) {
    if (
      !confirm(
        `Delete "${category.name}"? This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingId(category.id);
    try {
      await deleteCategoryAction(category.id);
      await queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
    } catch (err) {
      showError(err, "Couldn't delete category");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {modal ? (
        <CategoryFormModal
          mode={modal.mode}
          category={modal.mode === "edit" ? modal.category : undefined}
          categories={categories}
          onClose={() => setModal(null)}
        />
      ) : null}

      <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Categories</h1>
            <p className="text-sm text-muted-foreground">
              Organize products into catalog categories with a banner image.
            </p>
          </div>
          <Button onClick={() => setModal({ mode: "create" })} size="sm">
            <Plus className="size-4" />
            Add category
          </Button>
        </div>

        <Card className="overflow-hidden border border-border py-0 ring-0">
          <CardContent className="p-0">
            {categories.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <FolderTree className="size-10 text-muted-foreground/40" aria-hidden />
                <p className="text-sm text-muted-foreground">No categories yet.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setModal({ mode: "create" })}
                >
                  <Plus className="size-4" />
                  Create your first category
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-14" />
                    <SortableTableHead
                      label="Name"
                      sortKey="name"
                      activeKey={sortKey}
                      direction={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTableHead
                      label="Parent"
                      sortKey="parent"
                      activeKey={sortKey}
                      direction={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTableHead
                      label="Order"
                      sortKey="sort_order"
                      activeKey={sortKey}
                      direction={sortDirection}
                      onSort={toggleSort}
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
                  {sorted.map((category) => {
                    const parent = categories.find(
                      (c) => c.id === category.parent_id,
                    );
                    return (
                      <TableRow key={category.id}>
                        <TableCell>
                          <CategoryThumbnail category={category} />
                        </TableCell>
                        <TableCell className="font-medium">
                          {category.parent_id ? (
                            <span className="text-muted-foreground">
                              └{" "}
                            </span>
                          ) : null}
                          {category.name ?? "Unnamed"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {parent?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {category.sort_order ?? 0}
                        </TableCell>
                        <TableCell>
                          {category.is_active === false ? (
                            <Badge variant="secondary">Hidden</Badge>
                          ) : (
                            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                              Active
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() =>
                                setModal({ mode: "edit", category })
                              }
                              aria-label={`Edit ${category.name}`}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => void handleDelete(category)}
                              disabled={deletingId === category.id}
                              aria-label={`Delete ${category.name}`}
                              className="text-rose-600 hover:text-rose-700"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
