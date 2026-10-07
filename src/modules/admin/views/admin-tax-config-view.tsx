"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useTransition } from "react";
import { AlertTriangle, Check, Pencil, Percent, Plus } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminBreadcrumb } from "@/modules/admin/components/admin-breadcrumb";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { useAdminAlert } from "@/modules/admin/components/admin-alert-provider";
import { formatActionError } from "@/modules/admin/lib/format-action-error";
import {
  FormError,
  inputCls,
  Modal,
  PrimaryBtn,
  SecondaryBtn,
  textareaCls,
} from "@/modules/admin/components/modal";
import { SortableTableHead, useSortableData } from "@/modules/admin/ui";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";

interface TaxRate {
  id: string;
  name: string;
  rate_percent: number;
  description: string | null;
  is_default: boolean;
  created_at: string;
}

interface TaxResponse {
  rates: TaxRate[];
  defaultRate: TaxRate | null;
}

async function fetchTaxRates(): Promise<TaxResponse> {
  const res = await fetch("/api/tax/rates");
  if (!res.ok) throw new Error("Failed to fetch tax rates");
  return res.json();
}

function AddTaxRateModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const ratePercent = parseFloat((fd.get("ratePercent") as string) || "");
    const description = (fd.get("description") as string).trim() || null;
    const isDefault = fd.get("isDefault") === "on";

    if (!name) {
      setError("Name is required.");
      return;
    }
    if (Number.isNaN(ratePercent) || ratePercent < 0 || ratePercent > 100) {
      setError("Rate must be between 0 and 100.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/tax/rates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            ratePercent,
            description,
            isDefault,
          }),
        });
        const result = await res.json();
        if (!res.ok) {
          setError(result.error || "Failed to create tax rate.");
          return;
        }
        await queryClient.invalidateQueries({ queryKey: adminQueryKeys.taxRates() });
        onClose();
      } catch {
        setError("Failed to create tax rate.");
      }
    });
  }

  return (
    <Modal title="Add tax rate" subtitle="Create a new GST or tax rate." onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Name
          </label>
          <input
            name="name"
            type="text"
            placeholder="e.g. GST 18%"
            className={inputCls}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Rate (%)
          </label>
          <input
            name="ratePercent"
            type="number"
            placeholder="18"
            min={0}
            max={100}
            step={0.1}
            className={inputCls}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Description
          </label>
          <textarea
            name="description"
            placeholder="Optional description"
            rows={3}
            className={textareaCls}
          />
        </div>
        <label className="flex items-center gap-2">
          <input
            name="isDefault"
            type="checkbox"
            className="size-4 rounded border-input"
          />
          <span className="text-sm text-muted-foreground">Set as default rate</span>
        </label>
        <FormError message={error} />
        <div className="flex justify-end gap-2 pt-1">
          <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
          <PrimaryBtn type="submit" disabled={isPending}>
            {isPending ? "Creating…" : "Create rate"}
          </PrimaryBtn>
        </div>
      </form>
    </Modal>
  );
}

function EditTaxRateModal({
  rate,
  onClose,
}: {
  rate: TaxRate;
  onClose: () => void;
}) {
  return (
    <Modal title="Tax rate details" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Name</p>
          <p className="font-medium">{rate.name}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Rate</p>
          <p className="font-medium">{rate.rate_percent}%</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Description</p>
          <p>{rate.description || "—"}</p>
        </div>
        <div className="flex justify-end pt-1">
          <SecondaryBtn onClick={onClose}>Close</SecondaryBtn>
        </div>
      </div>
    </Modal>
  );
}

export function AdminTaxConfigView() {
  const queryClient = useQueryClient();
  const { showError } = useAdminAlert();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRate, setEditingRate] = useState<TaxRate | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: adminQueryKeys.taxRates(),
    queryFn: fetchTaxRates,
  });

  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(
    data?.rates ?? [],
    "name",
    "asc",
    (row, key) => {
      if (key === "default") return row.is_default ? 1 : 0;
      return (row as unknown as Record<string, unknown>)[key];
    },
  );

  async function handleSetDefault(taxRateId: string) {
    setSettingDefaultId(taxRateId);
    try {
      const res = await fetch(`/api/tax/rates/${taxRateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        showError(body?.error ?? "Failed to set default rate.", "Couldn't update tax rate");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.taxRates() });
    } catch (err) {
      showError(err, "Couldn't update tax rate");
    } finally {
      setSettingDefaultId(null);
    }
  }

  if (isPending && !data) return <AdminPageSkeleton />;
  if (isError) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-4">
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Failed to load tax rates</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Unknown error."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!data) return <AdminPageSkeleton />;

  return (
    <>
      {showAddModal ? (
        <AddTaxRateModal onClose={() => setShowAddModal(false)} />
      ) : null}
      {editingRate ? (
        <EditTaxRateModal rate={editingRate} onClose={() => setEditingRate(null)} />
      ) : null}

      <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
        <AdminBreadcrumb
          items={[
            { label: "Business", href: "/admin/business" },
            { label: "Tax rates" },
          ]}
          className="mb-4"
        />

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Tax rates</h1>
            <p className="text-sm text-muted-foreground">
              Manage GST rates and tax rules.
            </p>
          </div>
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="size-4" />
            Add tax rate
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          {data.defaultRate ? (
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
              <Check className="text-emerald-600" />
              <AlertTitle className="text-emerald-900">Default tax rate</AlertTitle>
              <AlertDescription className="text-emerald-800">
                {data.defaultRate.name} — {data.defaultRate.rate_percent}%
                {data.defaultRate.description
                  ? ` · ${data.defaultRate.description}`
                  : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <Card className="overflow-hidden border border-border py-0 ring-0">
            <CardContent className="p-0">
              {data.rates.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                  <Percent
                    className="size-10 text-muted-foreground/40"
                    aria-hidden
                  />
                  <p className="text-sm text-muted-foreground">
                    No tax rates configured.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddModal(true)}
                  >
                    <Plus className="size-4" />
                    Add your first rate
                  </Button>
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
                        label="Rate"
                        sortKey="rate_percent"
                        activeKey={sortKey}
                        direction={sortDirection}
                        onSort={toggleSort}
                        align="right"
                      />
                      <SortableTableHead
                        label="Description"
                        sortKey="description"
                        activeKey={sortKey}
                        direction={sortDirection}
                        onSort={toggleSort}
                      />
                      <SortableTableHead
                        label="Default"
                        sortKey="default"
                        activeKey={sortKey}
                        direction={sortDirection}
                        onSort={toggleSort}
                        align="center"
                      />
                      <TableHead className="w-16" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((rate) => (
                      <TableRow key={rate.id}>
                        <TableCell className="font-medium">{rate.name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Badge variant="secondary">{rate.rate_percent}%</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {rate.description || "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {rate.is_default ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-200 bg-emerald-50 text-emerald-700"
                            >
                              <Check className="size-3" />
                              Default
                            </Badge>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={settingDefaultId === rate.id}
                              onClick={() => void handleSetDefault(rate.id)}
                            >
                              {settingDefaultId === rate.id
                                ? "Setting…"
                                : "Set default"}
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setEditingRate(rate)}
                            aria-label={`View ${rate.name}`}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
