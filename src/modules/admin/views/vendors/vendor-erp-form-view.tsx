"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import type { VendorErpProfile } from "@/common/erp/purchasing-types";
import { VENDOR_TYPE_OPTIONS } from "@/common/erp/purchasing-types";
import { adminGet, adminPost, adminPut } from "@/modules/admin/lib/admin-api-client";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import {
  AdminFormActions,
  AdminFormColumns,
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  AdminFormShell,
  type ErpFormViewBaseProps,
} from "@/modules/admin/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type VendorErpFormViewProps = ErpFormViewBaseProps & {
  mode: "create" | "edit";
  vendorId?: string;
};

export function VendorErpFormView({
  mode,
  vendorId: vendorIdProp,
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: VendorErpFormViewProps) {
  const router = useRouter();
  const params = useParams();
  const formId = useId();
  const id = vendorIdProp ?? (mode === "edit" ? (params.id as string) : "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<VendorErpProfile | null>(null);
  const [loading, setLoading] = useState(mode === "edit");
  const isModal = variant === "modal";

  useEffect(() => {
    if (mode !== "edit" || !id) return;
    adminGet<VendorErpProfile>(`vendors/${id}/erp?view=profile`)
      .then(setProfile)
      .finally(() => setLoading(false));
  }, [mode, id]);

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/vendors");
    }
  }

  function handleSuccessNavigate(savedId?: string) {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(savedId);
      return;
    }
    const targetId = savedId ?? id;
    router.push(`/admin/vendors/${targetId}/erp`);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const address = (fd.get("address") as string).trim();
    const vendorType = fd.get("vendorType") as string;
    if (!name) return setError("Name is required.");
    if (!address) return setError("Address is required.");
    if (!vendorType) return setError("Vendor type is required.");

    const payload = {
      name,
      address,
      vendorType,
      trn: (fd.get("trn") as string).trim() || undefined,
      phone: (fd.get("phone") as string).trim() || undefined,
      fax: (fd.get("fax") as string).trim() || undefined,
      email: (fd.get("email") as string).trim() || undefined,
      poBox: (fd.get("poBox") as string).trim() || undefined,
      notes: (fd.get("notes") as string).trim() || undefined,
      openingBalance: parseFloat((fd.get("openingBalance") as string) || "0"),
      openingBalanceDate: (fd.get("openingBalanceDate") as string) || null,
      isActive: fd.get("isActive") === "on",
    };

    startTransition(async () => {
      try {
        if (mode === "create") {
          const res = await adminPost<{ id: string }>("vendors", payload);
          handleSuccessNavigate(res.id);
        } else {
          await adminPut(`vendors/${id}/erp`, payload);
          handleSuccessNavigate(id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save vendor.");
      }
    });
  }

  if (isModal && !open) return null;
  if (loading) {
    return (
      <AdminFormShell
        variant={variant}
        open={open}
        onOpenChange={onOpenChange}
        title={mode === "create" ? "Add vendor" : "Edit vendor"}
        size="lg"
        loading
        loadingFallback={<AdminPageSkeleton />}
      >
        {null}
      </AdminFormShell>
    );
  }

  const title = mode === "create" ? "Add vendor" : "Edit vendor";
  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel="Save"
      pending={isPending}
    />
  ) : undefined;

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Manage supplier contact details, tax info, and opening balance."
      backHref="/admin/vendors"
      breadcrumb={[
        { label: "Vendors", href: "/admin/vendors" },
        { label: title },
      ]}
      size="lg"
      formId={formId}
      footer={footer}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <AdminFormSection title="Vendor details">
          <AdminFormColumns cols={2}>
            <AdminFormGrid cols={2}>
              <AdminFormField label="Name" required className="sm:col-span-2">
                <Input name="name" defaultValue={profile?.name ?? ""} required />
              </AdminFormField>
              <AdminFormField label="PO box">
                <Input name="poBox" defaultValue={profile?.po_box ?? ""} />
              </AdminFormField>
              <AdminFormField label="TRN">
                <Input name="trn" defaultValue={profile?.trn ?? ""} />
              </AdminFormField>
              <AdminFormField label="Address" required className="sm:col-span-2">
                <Input name="address" defaultValue={profile?.address ?? ""} required />
              </AdminFormField>
              <AdminFormField label="Email">
                <Input name="email" type="email" defaultValue={profile?.email ?? ""} />
              </AdminFormField>
              <AdminFormField label="Phone">
                <Input name="phone" defaultValue={profile?.phone ?? ""} />
              </AdminFormField>
            </AdminFormGrid>
            <AdminFormGrid cols={2}>
              <AdminFormField label="Fax">
                <Input name="fax" defaultValue={profile?.fax ?? ""} />
              </AdminFormField>
              <AdminFormField label="Vendor type" required>
                <select
                  name="vendorType"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={profile?.vendor_type ?? ""}
                  required
                >
                  <option value="">Select</option>
                  {VENDOR_TYPE_OPTIONS.filter((t) => t !== "Select").map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </AdminFormField>
              <AdminFormField label="Opening balance">
                <Input
                  name="openingBalance"
                  type="number"
                  step="0.01"
                  defaultValue={profile?.opening_balance ?? 0}
                />
              </AdminFormField>
              <AdminFormField label="Opening balance date">
                <Input
                  name="openingBalanceDate"
                  type="date"
                  defaultValue={profile?.opening_balance_date ?? ""}
                />
              </AdminFormField>
              <AdminFormField label="Notes" className="sm:col-span-2">
                <Textarea name="notes" rows={3} defaultValue={profile?.notes ?? ""} />
              </AdminFormField>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="isActive" defaultChecked={profile?.is_active ?? true} />
                Active
              </label>
            </AdminFormGrid>
          </AdminFormColumns>
        </AdminFormSection>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {!isModal ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Link href="/admin/vendors" className={buttonVariants({ variant: "outline" })}>
              Cancel
            </Link>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : null}
      </form>
    </AdminFormShell>
  );
}
