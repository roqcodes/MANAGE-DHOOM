"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import {
  AdminFormActions,
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  AdminFormShell,
  ErpDocumentNumberField,
  type ErpFormViewBaseProps,
} from "@/modules/admin/ui";
import {
  ActiveStoreFormField,
  useActiveStoreFormField,
} from "@/modules/erp/components/use-active-store-form-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { coalesceNumber } from "@/lib/numeric-input";

type LineRow = {
  key: string;
  accountId: string;
  debit: number;
  credit: number;
  description: string;
};

function emptyLine(): LineRow {
  return {
    key: `line-${Math.random().toString(36).slice(2, 7)}`,
    accountId: "",
    debit: 0,
    credit: 0,
    description: "",
  };
}

export type JournalEntryFormViewProps = ErpFormViewBaseProps;

export function JournalEntryFormView({
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: JournalEntryFormViewProps) {
  const router = useRouter();
  const formId = useId();
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode: "create" });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<LineRow[]>([emptyLine(), emptyLine()]);
  const isModal = variant === "modal";

  useEffect(() => {
    const q = new URLSearchParams({ page: "0", limit: "500" });
    if (effectiveStoreId) q.set("storeId", effectiveStoreId);
    adminGet<{ data: { id: string; code: string; name: string }[] }>(`erp/accounts?${q.toString()}`)
      .then((res) => setAccounts(res.data ?? []));
  }, [effectiveStoreId]);

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const line of lines) {
      debit += coalesceNumber(line.debit);
      credit += coalesceNumber(line.credit);
    }
    return { debit: Math.round(debit * 100) / 100, credit: Math.round(credit * 100) / 100 };
  }, [lines]);

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/erp/journal-entries");
    }
  }

  function handleSuccessNavigate(id?: string) {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(id);
      return;
    }
    router.push(id ? `/admin/erp/journal-entries/${id}` : "/admin/erp/journal-entries");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!effectiveStoreId) {
      setError(storeRequiredMessage ?? "Store is required");
      return;
    }
    if (totals.debit !== totals.credit || totals.debit === 0) {
      setError("Journal must balance with non-zero totals");
      return;
    }
    const apiLines = lines
      .filter(
        (l) =>
          l.accountId &&
          (coalesceNumber(l.debit) > 0 || coalesceNumber(l.credit) > 0),
      )
      .map((l) => ({
        accountId: l.accountId,
        debit: coalesceNumber(l.debit) > 0 ? coalesceNumber(l.debit) : undefined,
        credit: coalesceNumber(l.credit) > 0 ? coalesceNumber(l.credit) : undefined,
        description: l.description || undefined,
      }));
    if (apiLines.length < 2) {
      setError("At least two lines required");
      return;
    }

    startTransition(async () => {
      try {
        const res = await adminPost<{ id: string }>("erp/journal-entries", {
          transactionDate,
          description,
          storeId: effectiveStoreId,
          lines: apiLines,
        });
        handleSuccessNavigate(res.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to post journal");
      }
    });
  }

  if (isModal && !open) return null;

  const title = "Manual journal";
  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel="Post journal"
      pending={pending}
    />
  ) : undefined;

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Post a balanced manual journal entry."
      backHref="/admin/erp/journal-entries"
      breadcrumb={[
        { label: "Journal entries", href: "/admin/erp/journal-entries" },
        { label: title },
      ]}
      size="landscape"
      formId={formId}
      footer={footer}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <AdminFormSection title="Journal header">
          <AdminFormGrid cols={3}>
            <ErpDocumentNumberField kind="JE" />
            <AdminFormField label="Date">
              <Input
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
              />
            </AdminFormField>
            <AdminFormField label="Store" required>
              <ActiveStoreFormField
                mode="create"
                stores={stores}
                activeStoreId={activeStoreId}
                storeId={storeId}
                onStoreIdChange={setStoreId}
                label=""
              />
            </AdminFormField>
            <AdminFormField label="Description" className="sm:col-span-2 lg:col-span-1">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} required />
            </AdminFormField>
          </AdminFormGrid>
        </AdminFormSection>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Lines</CardTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              <Plus data-icon="inline-start" />
              Add line
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {lines.map((line) => (
              <div
                key={line.key}
                className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_100px_100px_1fr_auto]"
              >
                <select
                  className="h-9 rounded-md border px-2 text-sm"
                  value={line.accountId}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) => (l.key === line.key ? { ...l, accountId: e.target.value } : l)),
                    )
                  }
                >
                  <option value="">Account</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
                <NumericInput
                  min={0}
                  step="0.01"
                  placeholder="Debit"
                  value={line.debit}
                  onValueChange={(debit) =>
                    setLines((prev) =>
                      prev.map((l) =>
                        l.key === line.key ? { ...l, debit, credit: 0 } : l,
                      ),
                    )
                  }
                />
                <NumericInput
                  min={0}
                  step="0.01"
                  placeholder="Credit"
                  value={line.credit}
                  onValueChange={(credit) =>
                    setLines((prev) =>
                      prev.map((l) =>
                        l.key === line.key ? { ...l, credit, debit: 0 } : l,
                      ),
                    )
                  }
                />
                <Input
                  placeholder="Line note"
                  value={line.description}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) => (l.key === line.key ? { ...l, description: e.target.value } : l)),
                    )
                  }
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={lines.length <= 2}
                  onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <p className="text-sm text-muted-foreground">
              Debit {totals.debit.toFixed(2)} · Credit {totals.credit.toFixed(2)}
              {totals.debit === totals.credit && totals.debit > 0 ? " · Balanced" : ""}
            </p>
          </CardContent>
        </Card>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {!isModal ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Link href="/admin/erp/journal-entries" className={buttonVariants({ variant: "outline" })}>
              Cancel
            </Link>
            <Button type="submit" disabled={pending}>
              {pending ? "Posting…" : "Post journal"}
            </Button>
          </div>
        ) : null}
      </form>
    </AdminFormShell>
  );
}
