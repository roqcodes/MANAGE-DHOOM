"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import type { CustomerErpProfile } from "@/common/erp/sales-types";
import { adminGet, adminPatch, adminPost } from "@/modules/admin/lib/admin-api-client";
import {
  AdminFormActions,
  AdminFormColumns,
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  AdminFormShell,
  type ErpFormViewBaseProps,
} from "@/modules/admin/ui";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function splitName(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export type CustomerFormViewProps = ErpFormViewBaseProps & {
  mode: "create" | "edit";
  customerId?: string;
  /** When nested inside another ERP modal (invoice, etc.). */
  modalStacked?: boolean;
};

export function CustomerFormView({
  mode,
  customerId: customerIdProp,
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
  modalStacked = false,
}: CustomerFormViewProps) {
  const router = useRouter();
  const params = useParams();
  const formId = useId();
  const slug = (params.slug as string[] | undefined) ?? [];
  const idFromRoute =
    mode === "edit" && slug[0] === "customers" && typeof slug[1] === "string"
      ? slug[1]
      : "";
  const customerId = customerIdProp ?? idFromRoute;
  const isModal = variant === "modal";

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<CustomerErpProfile | null>(null);
  const [loading, setLoading] = useState(mode === "edit");

  useEffect(() => {
    if (mode !== "edit" || !customerId) return;
    adminGet<{ profile: CustomerErpProfile }>(`customers/${customerId}/erp`)
      .then((res) => setProfile(res.profile))
      .finally(() => setLoading(false));
  }, [mode, customerId]);

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/customers");
    }
  }

  function handleSuccessNavigate(savedId?: string) {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(savedId);
      return;
    }
    router.push(savedId ? `/admin/customers/${savedId}` : "/admin/customers");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const companyName = (fd.get("companyName") as string).trim();
    if (!companyName) {
      setError("Company name is required");
      return;
    }

    const payload = {
      firstName: (fd.get("firstName") as string).trim() || undefined,
      lastName: (fd.get("lastName") as string).trim() || undefined,
      companyName,
      address: (fd.get("address") as string).trim() || undefined,
      trn: (fd.get("trn") as string).trim() || undefined,
      contactDisplayName: (fd.get("contactDisplayName") as string).trim() || undefined,
      location: (fd.get("location") as string).trim() || undefined,
      email: (fd.get("email") as string).trim() || undefined,
      phone: (fd.get("mobile") as string).trim() || undefined,
      landline: (fd.get("phone") as string).trim() || undefined,
      poBox: (fd.get("poBox") as string).trim() || undefined,
      customerNotes: (fd.get("notes") as string).trim() || undefined,
      creditLimit: parseFloat((fd.get("creditLimit") as string) || "0") || null,
      openingBalance: parseFloat((fd.get("openingBalance") as string) || "0"),
      openingBalanceDate: (fd.get("openingBalanceDate") as string) || null,
    };

    startTransition(async () => {
      try {
        if (mode === "create") {
          const res = await adminPost<{ id: string }>("customers", payload);
          handleSuccessNavigate(res.id);
        } else if (customerId) {
          await adminPatch(`customers/${customerId}/erp`, payload);
          handleSuccessNavigate(customerId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save customer");
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
        title={mode === "create" ? "Add customer" : "Edit customer"}
        size="xl"
        stacked={modalStacked}
        loading
        loadingFallback={<AdminPageSkeleton />}
      >
        {null}
      </AdminFormShell>
    );
  }

  if (mode === "edit" && !profile) {
    if (isModal) {
      return (
        <AdminFormShell
          variant={variant}
          open={open}
          onOpenChange={onOpenChange}
          title="Edit customer"
          size="xl"
          stacked={modalStacked}
        >
          <p className="text-sm text-destructive">Customer not found.</p>
        </AdminFormShell>
      );
    }
    return (
      <div className="mx-auto max-w-4xl px-3 py-4">
        <p className="text-sm text-destructive">Customer not found.</p>
      </div>
    );
  }

  const nameParts = splitName(profile?.name);
  const title = mode === "create" ? "Add customer" : "Edit customer";
  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel="Save"
      pending={pending}
    />
  ) : undefined;

  const sections = (
    <AdminFormColumns cols={2}>
      <AdminFormSection title="Contact">
        <AdminFormGrid cols={2}>
          <AdminFormField label="First name">
            <Input name="firstName" placeholder="First name" defaultValue={nameParts.firstName} />
          </AdminFormField>
          <AdminFormField label="Last name">
            <Input name="lastName" placeholder="Last name" defaultValue={nameParts.lastName} />
          </AdminFormField>
          <AdminFormField label="Company name" required className="sm:col-span-2">
            <Input
              name="companyName"
              placeholder="Company name"
              defaultValue={profile?.companyName ?? ""}
              required
            />
          </AdminFormField>
          <AdminFormField label="Contact display name">
            <Input
              name="contactDisplayName"
              placeholder="Contact display name"
              defaultValue={profile?.contactDisplayName ?? ""}
            />
          </AdminFormField>
          <AdminFormField label="Location">
            <Input name="location" placeholder="Location" defaultValue={profile?.location ?? ""} />
          </AdminFormField>
          <AdminFormField label="Email">
            <Input name="email" type="email" placeholder="Email" defaultValue={profile?.email ?? ""} />
          </AdminFormField>
          <AdminFormField label="Mobile">
            <Input name="mobile" placeholder="Mobile" defaultValue={profile?.phone ?? ""} />
          </AdminFormField>
          <AdminFormField label="Phone">
            <Input name="phone" placeholder="Phone" />
          </AdminFormField>
          <AdminFormField label="PO box">
            <Input name="poBox" placeholder="PO box" defaultValue={profile?.poBox ?? ""} />
          </AdminFormField>
        </AdminFormGrid>
      </AdminFormSection>

      <AdminFormSection title="Billing & notes">
        <AdminFormGrid cols={2}>
          <AdminFormField label="Address" className="sm:col-span-2">
            <Textarea
              name="address"
              placeholder="Address"
              defaultValue={profile?.address ?? ""}
              rows={3}
            />
          </AdminFormField>
          <AdminFormField label="TRN">
            <Input name="trn" placeholder="TRN" defaultValue={profile?.trn ?? ""} />
          </AdminFormField>
          <AdminFormField label="Credit limit">
            <Input
              name="creditLimit"
              type="number"
              step="0.01"
              min={0}
              defaultValue={profile?.creditLimit ?? 0}
            />
          </AdminFormField>
          <AdminFormField label="Opening balance">
            <Input
              name="openingBalance"
              type="number"
              step="0.01"
              defaultValue={profile?.openingBalance ?? 0}
            />
          </AdminFormField>
          <AdminFormField label="Opening balance date">
            <Input
              name="openingBalanceDate"
              type="date"
              defaultValue={profile?.openingBalanceDate ?? new Date().toISOString().slice(0, 10)}
            />
          </AdminFormField>
          <AdminFormField label="Notes" className="sm:col-span-2">
            <Textarea
              name="notes"
              placeholder="Notes"
              defaultValue={profile?.customerNotes ?? ""}
              rows={3}
            />
          </AdminFormField>
        </AdminFormGrid>
      </AdminFormSection>
    </AdminFormColumns>
  );

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Customer account, billing, and receivables settings."
      backHref="/admin/customers"
      breadcrumb={[
        { label: "Customers", href: "/admin/customers" },
        { label: title },
      ]}
      size="xl"
      stacked={modalStacked}
      formId={formId}
      footer={footer}
    >
      <form id={formId} key={profile?.id ?? "new"} onSubmit={handleSubmit} className="space-y-4">
        {sections}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!isModal ? (
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/customers" className={buttonVariants({ variant: "outline" })}>
              Cancel
            </Link>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : null}
      </form>
    </AdminFormShell>
  );
}
