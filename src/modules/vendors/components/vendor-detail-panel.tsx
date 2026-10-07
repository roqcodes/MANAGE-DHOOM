"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  Package,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import type { Vendor, VendorProductWithVariant, VariantWithProduct } from "@/common/admin/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  assignVariantToVendorAction,
  updateVendorProductAction,
  removeVendorProductAction,
} from "@/modules/vendors/actions/vendor-products.actions";
import {
  updateVendorAction,
  toggleVendorAction,
} from "@/modules/vendors/actions/vendors.actions";
import {
  Modal,
  FieldLabel,
  FormError,
  PrimaryBtn,
  SecondaryBtn,
  inputCls,
  selectCls,
} from "@/modules/admin/components/modal";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { currencyLabel, formatInr } from "@/lib/format-currency";

function GlanceMetricCard({
  title,
  value,
  description,
}: {
  title: string;
  value: ReactNode;
  description?: ReactNode;
}) {
  return (
    <Card size="sm" className="border border-border ring-0">
      <CardHeader className="border-b border-border pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 pt-3">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {description ? (
          <CardDescription className="text-xs">{description}</CardDescription>
        ) : null}
      </CardContent>
    </Card>
  );
}

function VendorEditForm({
  vendor,
  onClose,
}: {
  vendor: Vendor;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const contact = (fd.get("contact") as string).trim();
    if (!name) return setError("Name is required.");
    setError(null);
    startTransition(async () => {
      try {
        await updateVendorAction(vendor.id, { name, contact });
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.vendorDetail(vendor.id),
        });
        await queryClient.invalidateQueries({ queryKey: ["admin", "vendors"] });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FieldLabel label="Vendor Name">
        <input
          className={inputCls}
          name="name"
          defaultValue={vendor.name ?? ""}
          required
        />
      </FieldLabel>
      <FieldLabel label="Contact">
        <input
          className={inputCls}
          name="contact"
          defaultValue={vendor.contact ?? ""}
        />
      </FieldLabel>
      <FormError message={error} />
      <div className="flex justify-end gap-2 pt-1">
        <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
        <PrimaryBtn type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </PrimaryBtn>
      </div>
    </form>
  );
}

function AssignForm({
  vendorId,
  availableVariants,
  onClose,
}: {
  vendorId: string;
  availableVariants: VariantWithProduct[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const variantId = fd.get("variantId") as string;
    const basePrice = parseFloat(fd.get("basePrice") as string);
    const stock = parseInt(fd.get("stock") as string, 10);
    if (!variantId || Number.isNaN(basePrice) || Number.isNaN(stock)) {
      return setError("All fields are required.");
    }
    setError(null);
    startTransition(async () => {
      try {
        await assignVariantToVendorAction({ vendorId, variantId, basePrice, stock });
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.vendorDetail(vendorId),
        });
        await queryClient.invalidateQueries({ queryKey: ["admin", "vendors"] });
        await queryClient.invalidateQueries({ queryKey: ["admin", "inventory"] });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FieldLabel label="Product Variant">
        <select name="variantId" className={selectCls} required>
          <option value="">Select variant…</option>
          {availableVariants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.products?.name ?? "—"} · {v.name}
            </option>
          ))}
        </select>
      </FieldLabel>
      <div className="grid grid-cols-2 gap-3">
        <FieldLabel label={currencyLabel("Base Price")}>
          <input
            className={inputCls}
            name="basePrice"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            required
          />
        </FieldLabel>
        <FieldLabel label="Stock (units)">
          <input
            className={inputCls}
            name="stock"
            type="number"
            min="0"
            placeholder="0"
            required
          />
        </FieldLabel>
      </div>
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
        <PrimaryBtn type="submit" disabled={isPending}>
          {isPending ? "Assigning…" : "Assign Variant"}
        </PrimaryBtn>
      </div>
    </form>
  );
}

function EditVPForm({
  vp,
  vendorId,
  onClose,
}: {
  vp: VendorProductWithVariant;
  vendorId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const basePrice = parseFloat(fd.get("basePrice") as string);
    const stock = parseInt(fd.get("stock") as string, 10);
    if (Number.isNaN(basePrice) || Number.isNaN(stock)) {
      return setError("Valid numbers required.");
    }
    setError(null);
    startTransition(async () => {
      try {
        await updateVendorProductAction(vp.id, vendorId, { basePrice, stock });
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.vendorDetail(vendorId),
        });
        await queryClient.invalidateQueries({ queryKey: ["admin", "vendors"] });
        await queryClient.invalidateQueries({ queryKey: ["admin", "inventory"] });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="rounded-lg bg-muted px-3 py-2 text-sm font-medium">
        {vp.product_variants?.products?.name ?? "—"} · {vp.product_variants?.name ?? "—"}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <FieldLabel label={currencyLabel("Base Price")}>
          <input
            className={inputCls}
            name="basePrice"
            type="number"
            step="0.01"
            min="0"
            defaultValue={vp.base_price}
            required
          />
        </FieldLabel>
        <FieldLabel label="Stock (units)">
          <input
            className={inputCls}
            name="stock"
            type="number"
            min="0"
            defaultValue={vp.stock ?? 0}
            required
          />
        </FieldLabel>
      </div>
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
        <PrimaryBtn type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </PrimaryBtn>
      </div>
    </form>
  );
}

function SupplyLineTableRow({
  vp,
  disabled,
  onEdit,
  onRemove,
}: {
  vp: VendorProductWithVariant;
  disabled: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const stock = Math.max(0, Math.floor(Number(vp.stock ?? 0)));
  const low = stock < 10;
  const productName = vp.product_variants?.products?.name ?? "—";
  const variantName = vp.product_variants?.name ?? "—";

  return (
    <TableRow>
      <TableCell className="font-medium">{productName}</TableCell>
      <TableCell>{variantName}</TableCell>
      <TableCell className="tabular-nums">{formatInr(vp.base_price)}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className={`tabular-nums ${low ? "font-medium text-amber-700" : ""}`}>
            {stock.toLocaleString("en-IN")}
          </span>
          {low ? (
            <Badge
              variant="outline"
              className="border-amber-200 bg-amber-50 text-amber-800"
            >
              <AlertTriangle data-icon="inline-start" />
              Low
            </Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={onEdit}
            aria-label={`Edit ${variantName}`}
          >
            <Pencil />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={disabled}
            onClick={onRemove}
            aria-label={`Remove ${variantName}`}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

type DetailModal =
  | { kind: "assign" }
  | { kind: "editVendor" }
  | { kind: "editSupplyLine"; vp: VendorProductWithVariant }
  | null;

export function VendorDetailPanel({
  vendor,
  vendorProducts,
  availableVariants,
}: {
  vendor: Vendor;
  vendorProducts: VendorProductWithVariant[];
  availableVariants: VariantWithProduct[];
}) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [modal, setModal] = useState<DetailModal>(null);

  const metrics = useMemo(() => {
    let totalStock = 0;
    let lowStockLines = 0;
    for (const vp of vendorProducts) {
      const s = Math.max(0, Math.floor(Number(vp.stock ?? 0)));
      totalStock += s;
      if (s < 10) lowStockLines += 1;
    }
    return {
      lines: vendorProducts.length,
      totalStock,
      lowStockLines,
      assignable: availableVariants.length,
    };
  }, [vendorProducts, availableVariants]);

  function handleRemove(id: string) {
    if (!confirm("Remove this supply entry?")) return;
    startTransition(async () => {
      await removeVendorProductAction(id, vendor.id);
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.vendorDetail(vendor.id),
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "vendors"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "inventory"] });
    });
  }

  function handleToggle() {
    startTransition(async () => {
      await toggleVendorAction(vendor.id, !vendor.is_active);
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.vendorDetail(vendor.id),
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "vendors"] });
    });
  }

  const isActive = vendor.is_active ?? false;
  const shortId = vendor.id.slice(0, 8).toUpperCase();

  return (
    <>
      {modal?.kind === "assign" && (
        <Modal title="Assign Variant" onClose={() => setModal(null)}>
          <AssignForm
            vendorId={vendor.id}
            availableVariants={availableVariants}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
      {modal?.kind === "editVendor" && (
        <Modal title="Edit Vendor" onClose={() => setModal(null)} size="sm">
          <VendorEditForm vendor={vendor} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.kind === "editSupplyLine" && (
        <Modal title="Edit Supply Entry" onClose={() => setModal(null)} size="sm">
          <EditVPForm
            vp={modal.vp}
            vendorId={vendor.id}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}

      <div className="flex flex-col gap-3">
        <Card className="border border-border ring-0">
          <CardContent className="flex flex-col gap-3 py-3 lg:flex-row lg:items-start">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
              <Building2 aria-hidden />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {isActive ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-200 bg-emerald-50 text-emerald-700"
                  >
                    Active
                  </Badge>
                ) : (
                  <Badge variant="secondary">Inactive</Badge>
                )}
              </div>
              <h1 className="mt-2 text-2xl font-semibold">
                {vendor.name ?? "Unnamed vendor"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {vendor.contact?.trim() || "No contact on file."}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">ID · {shortId}…</p>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button variant="outline" disabled={isPending} onClick={handleToggle}>
                {isActive ? "Deactivate" : "Activate"}
              </Button>
              <Button variant="outline" onClick={() => setModal({ kind: "editVendor" })}>
                <Pencil data-icon="inline-start" />
                Edit details
              </Button>
              {availableVariants.length > 0 ? (
                <Button onClick={() => setModal({ kind: "assign" })}>
                  <Plus data-icon="inline-start" />
                  Assign variant
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <section aria-label="Vendor summary">
          <p className="mb-3 text-sm font-medium">At a glance</p>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <GlanceMetricCard
              title="Supply lines"
              value={metrics.lines.toLocaleString("en-IN")}
              description={
                metrics.lines > 0
                  ? "Variants linked to this vendor"
                  : "No supply lines yet"
              }
            />
            <GlanceMetricCard
              title="Listed stock"
              value={metrics.totalStock.toLocaleString("en-IN")}
              description={
                metrics.totalStock > 0
                  ? "Units across supply lines"
                  : "No stock listed"
              }
            />
            <GlanceMetricCard
              title="Low stock lines"
              value={metrics.lowStockLines.toLocaleString("en-IN")}
              description={
                metrics.lowStockLines > 0
                  ? "Under 10 units on a line"
                  : "All lines adequately stocked"
              }
            />
            <GlanceMetricCard
              title="Assignable variants"
              value={metrics.assignable.toLocaleString("en-IN")}
              description={
                metrics.assignable > 0
                  ? "Catalog SKUs not yet linked here"
                  : "All variants assigned"
              }
            />
          </div>
        </section>

        <Card className="border border-border ring-0">
          <CardHeader className="border-b border-border">
            <CardTitle>Supply lines</CardTitle>
            <CardDescription>
              {vendorProducts.length} line{vendorProducts.length !== 1 ? "s" : ""}. Manage base
              price and stock for each variant this vendor supplies.
            </CardDescription>
            {availableVariants.length > 0 ? (
              <CardAction>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setModal({ kind: "assign" })}
                >
                  <Plus data-icon="inline-start" />
                  Assign variant
                </Button>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent>
            {vendorProducts.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 py-8 text-center">
                <Package className="text-muted-foreground" aria-hidden />
                <p className="max-w-sm text-sm text-muted-foreground">
                  No variants assigned yet. Link catalog SKUs with base price and stock.
                </p>
                {availableVariants.length > 0 ? (
                  <Button onClick={() => setModal({ kind: "assign" })}>
                    <Plus data-icon="inline-start" />
                    Assign first variant
                  </Button>
                ) : null}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Product</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>Base price</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendorProducts.map((vp) => (
                    <SupplyLineTableRow
                      key={vp.id}
                      vp={vp}
                      disabled={isPending}
                      onEdit={() => setModal({ kind: "editSupplyLine", vp })}
                      onRemove={() => handleRemove(vp.id)}
                    />
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
