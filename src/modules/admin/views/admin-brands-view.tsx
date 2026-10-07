"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Award,
  ImageIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import type { Brand } from "@/common/admin/types";
import { getBrandLogo } from "@/modules/products/lib/brands.utils";
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
  createBrandAction,
  deleteBrandAction,
  updateBrandAction,
} from "@/modules/products/actions/brands.actions";
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

interface BrandsPayload {
  brands: Brand[];
}

type ModalState =
  | { mode: "create" }
  | { mode: "edit"; brand: Brand }
  | null;

const inputCls =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-900 outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10";

function BrandLogo({ brand }: { brand: Brand }) {
  const url = getBrandLogo(brand);
  return (
    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200/80">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <Award className="size-4 text-slate-400" aria-hidden />
      )}
    </div>
  );
}

function BrandFormModal({
  mode,
  brand,
  onClose,
}: {
  mode: "create" | "edit";
  brand?: Brand;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState(
    brand?.image_url?.trim() || brand?.logo_url?.trim() || "",
  );
  const [uploading, setUploading] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
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
          imageUrl: imageUrl.trim() || null,
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
          isActive,
          slug,
          description,
        };

        if (mode === "create") {
          await createBrandAction(payload);
        } else if (brand) {
          await updateBrandAction(brand.id, payload);
        }

        await queryClient.invalidateQueries({ queryKey: ["admin", "brands"] });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save.");
      }
    });
  }

  return (
    <Modal
      title={mode === "create" ? "Add brand" : "Edit brand"}
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
            defaultValue={brand?.name ?? ""}
            required
            placeholder="e.g. Prestige"
          />
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
              defaultValue={brand?.sort_order ?? 0}
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
              defaultValue={brand?.slug ?? ""}
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
            defaultValue={brand?.description ?? ""}
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
            One image for logos, product cards, and brand pages in the app.
          </p>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={brand?.is_active !== false}
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

export function AdminBrandsView() {
  const queryClient = useQueryClient();
  const { showError } = useAdminAlert();
  const [modal, setModal] = useState<ModalState>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "brands"],
    queryFn: () => adminGet<BrandsPayload>("brands"),
  });

  const brands = data?.brands ?? [];

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    brands,
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
              Failed to load brands.
            </p>
            <p className="mt-1 text-sm text-rose-700">
              {error instanceof Error ? error.message : "Unknown error."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  async function handleDelete(brand: Brand) {
    if (!confirm(`Delete "${brand.name}"? This cannot be undone.`)) {
      return;
    }
    setDeletingId(brand.id);
    try {
      await deleteBrandAction(brand.id);
      await queryClient.invalidateQueries({ queryKey: ["admin", "brands"] });
    } catch (err) {
      showError(err, "Couldn't delete brand");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {modal ? (
        <BrandFormModal
          mode={modal.mode}
          brand={modal.mode === "edit" ? modal.brand : undefined}
          onClose={() => setModal(null)}
        />
      ) : null}

      <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Brands</h1>
            <p className="text-sm text-muted-foreground">
              Manage product brands and assign them to catalog items.
            </p>
          </div>
          <Button onClick={() => setModal({ mode: "create" })} size="sm">
            <Plus className="size-4" />
            Add brand
          </Button>
        </div>

        <Card className="overflow-hidden border border-border py-0 ring-0">
          <CardContent className="p-0">
            {brands.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <Award className="size-10 text-muted-foreground/40" aria-hidden />
                <p className="text-sm text-muted-foreground">No brands yet.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setModal({ mode: "create" })}
                >
                  <Plus className="size-4" />
                  Create your first brand
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
                      label="Slug"
                      sortKey="slug"
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
                  {sorted.map((brand) => (
                    <TableRow key={brand.id}>
                      <TableCell>
                        <BrandLogo brand={brand} />
                      </TableCell>
                      <TableCell className="font-medium">
                        {brand.name ?? "Unnamed"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {brand.slug ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {brand.sort_order ?? 0}
                      </TableCell>
                      <TableCell>
                        {brand.is_active === false ? (
                          <Badge variant="secondary">Hidden</Badge>
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
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setModal({ mode: "edit", brand })}
                            aria-label={`Edit ${brand.name}`}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => void handleDelete(brand)}
                            disabled={deletingId === brand.id}
                            aria-label={`Delete ${brand.name}`}
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
          </CardContent>
        </Card>
      </div>
    </>
  );
}
