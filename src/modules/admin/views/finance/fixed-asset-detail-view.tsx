"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { AlertTriangle, Pencil } from "lucide-react";

import {
  parseFixedAssetMaintenance,
  type FixedAssetDetail,
} from "@/common/erp/finance-types";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { ErpDocumentTabsLayout } from "@/modules/erp/components/erp-document-tabs-layout";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { fixedAssetDetailQueryKey } from "@/modules/admin/lib/admin-query-keys";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatDisplayDate(value: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd/MM/yyyy");
  } catch {
    return value;
  }
}

function taxPercentLabel(asset: FixedAssetDetail) {
  const amount = Number(asset.purchase_amount) || 0;
  const tax = Number(asset.tax_amount) || 0;
  if (amount <= 0 || tax <= 0) return "—";
  return `${((tax / amount) * 100).toFixed(2)}%`;
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border border-border py-0 ring-0">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b border-border/60 px-4 py-3 last:border-b-0 sm:grid-cols-[180px_1fr] sm:gap-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

export function FixedAssetDetailView({ assetId }: { assetId: string }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: fixedAssetDetailQueryKey(assetId),
    queryFn: () => adminGet<{ asset: FixedAssetDetail }>(`erp/fixed-assets/${assetId}`),
  });

  if (isPending && !data) return <AdminPageSkeleton />;
  if (isError || !data?.asset) {
    return (
      <AdminPageLayout>
        <div className="flex items-start gap-3 rounded-xl border border-rose-200/60 bg-rose-50/40 p-5">
          <AlertTriangle className="size-5 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-semibold text-rose-900">Fixed asset not found.</p>
            <p className="mt-1 text-sm text-rose-700">
              {error instanceof Error ? error.message : "Unknown error."}
            </p>
          </div>
        </div>
      </AdminPageLayout>
    );
  }

  const asset = data.asset;
  const maintenance = parseFixedAssetMaintenance(asset.maintenance_info);
  const hasWarranty = Boolean(asset.warranty_expiry || asset.warranty_details);

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title={asset.name}
        description={`${asset.asset_number} · ${asset.stores?.name ?? "No store assigned"}`}
        backHref="/admin/erp/fixed-assets"
        breadcrumb={[
          { label: "Fixed assets", href: "/admin/erp/fixed-assets" },
          { label: asset.name },
        ]}
        actions={
          <Button
            nativeButton={false}
            size="sm"
            render={<Link href={`/admin/erp/fixed-assets/${asset.id}/edit`} />}
          >
            <Pencil className="size-4" />
            Edit asset
          </Button>
        }
      />

      <ErpDocumentTabsLayout
        detailsLabel="Asset details"
        entityId={asset.id}
        auditEntityType="asset"
        journalSourceType="fixed_asset"
      >
      <div className="flex flex-col gap-4">
        <DetailSection title="Item details">
          <DetailRow label="Number" value={asset.asset_number} />
          <DetailRow label="Name" value={asset.name} />
          <DetailRow label="Serial number" value={asset.serial_number ?? "—"} />
          <DetailRow label="Reference" value={asset.reference ?? "—"} />
          <DetailRow label="Brand" value={asset.brand ?? "—"} />
          <DetailRow label="Details" value={asset.details?.trim() || "—"} />
        </DetailSection>

        <DetailSection title="Purchase details">
          <DetailRow
            label="Purchase price"
            value={formatCurrencyAmount(asset.purchase_amount)}
          />
          <DetailRow label="Purchase date" value={formatDisplayDate(asset.purchase_date)} />
          <DetailRow label="Tax %" value={taxPercentLabel(asset)} />
          <DetailRow
            label="Tax mode"
            value={
              asset.tax_mode === "inclusive"
                ? "Tax inclusive"
                : asset.tax_mode === "exclusive"
                  ? "Tax exclusive"
                  : "No tax"
            }
          />
          <DetailRow
            label="Paid through"
            value={
              asset.accounts
                ? `${asset.accounts.name} (${asset.accounts.code})`
                : "—"
            }
          />
          <DetailRow label="Vendor" value={asset.vendors?.name ?? "—"} />
        </DetailSection>

        <DetailSection title="Warranty details">
          <DetailRow
            label="Status"
            value={
              hasWarranty ? (
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  Under warranty
                </Badge>
              ) : (
                <Badge variant="secondary">Not applicable</Badge>
              )
            }
          />
          {hasWarranty ? (
            <>
              <DetailRow
                label="Expiry date"
                value={formatDisplayDate(asset.warranty_expiry)}
              />
              <DetailRow label="Details" value={asset.warranty_details?.trim() || "—"} />
            </>
          ) : null}
        </DetailSection>

        <DetailSection title="Service details">
          <DetailRow label="Service person" value={maintenance.servicePerson?.trim() || "—"} />
          <DetailRow
            label="Service contact"
            value={maintenance.serviceContact?.trim() || "—"}
          />
          <DetailRow
            label="Service centre"
            value={maintenance.serviceAddress?.trim() || "—"}
          />
        </DetailSection>
      </div>
      </ErpDocumentTabsLayout>
    </AdminPageLayout>
  );
}
