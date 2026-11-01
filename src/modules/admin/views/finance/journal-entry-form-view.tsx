"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Info,
  Plus,
  Trash2,
} from "lucide-react";

import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import {
  validateBeforeFormSave,
  formErrorsAdapter,
  AdminFormActions,
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  AdminFormShell,
  ErpDocumentNumberField,
  type ErpFormViewBaseProps,
  clearFormSubmitFeedback,
  useFormFieldValidation,
} from "@/modules/admin/ui";
import {
  ActiveStoreFormField,
  useActiveStoreFormField,
} from "@/modules/erp/components/use-active-store-form-field";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { coalesceNumber } from "@/lib/numeric-input";
import { resolveCurrencySymbol } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";

type LineRow = {
  key: string;
  accountId: string;
  debit: number;
  credit: number;
  description: string;
};

type AccountOption = {
  id: string;
  code: string;
  name: string;
  account_category?: string;
  account_type_name?: string;
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
  const [error, setError] = useState<string | string[] | null>(null);
  const fieldValidation = useFormFieldValidation();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [showGuide, setShowGuide] = useState(false);
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<LineRow[]>([emptyLine(), emptyLine()]);
  const operationIdRef = useRef(crypto.randomUUID());
  const submitInFlightRef = useRef(false);
  const isModal = variant === "modal";
  const currencySymbol = resolveCurrencySymbol();

  useEffect(() => {
    const q = new URLSearchParams({ page: "0", limit: "500" });
    if (effectiveStoreId) q.set("storeId", effectiveStoreId);
    adminGet<{ data: AccountOption[] }>(`erp/accounts?${q.toString()}`)
      .then((res) => setAccounts(res.data ?? []));
  }, [effectiveStoreId]);

  const groupedAccounts = useMemo(() => {
    const standardCategories = ["Assets", "Liability", "Equity", "Income", "Expense"];
    const groups = new Map<string, AccountOption[]>();

    for (const acc of accounts) {
      const cat = acc.account_category || "Other";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(acc);
    }

    const result: { category: string; items: AccountOption[] }[] = [];
    for (const cat of standardCategories) {
      if (groups.has(cat)) {
        result.push({ category: cat, items: groups.get(cat)! });
        groups.delete(cat);
      }
    }
    for (const [cat, items] of groups.entries()) {
      result.push({ category: cat, items });
    }
    return result;
  }, [accounts]);

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const line of lines) {
      debit += coalesceNumber(line.debit);
      credit += coalesceNumber(line.credit);
    }
    return { debit: Math.round(debit * 100) / 100, credit: Math.round(credit * 100) / 100 };
  }, [lines]);

  const diff = useMemo(() => {
    return Math.round(Math.abs(totals.debit - totals.credit) * 100) / 100;
  }, [totals]);

  const isBalanced = totals.debit === totals.credit && totals.debit > 0;
  const hasAmounts = totals.debit > 0 || totals.credit > 0;

  function handleAutoBalance() {
    if (diff <= 0) return;
    const needsCredit = totals.debit > totals.credit;
    const balancingAmount = diff;

    // Check if any existing line has 0 debit and 0 credit
    const emptyIndex = lines.findIndex(
      (l) => coalesceNumber(l.debit) === 0 && coalesceNumber(l.credit) === 0,
    );

    if (emptyIndex !== -1) {
      setLines((prev) =>
        prev.map((l, i) =>
          i === emptyIndex
            ? {
                ...l,
                debit: needsCredit ? 0 : balancingAmount,
                credit: needsCredit ? balancingAmount : 0,
              }
            : l,
        ),
      );
      return;
    }

    // Otherwise add a new line with balancing amount
    setLines((prev) => [
      ...prev,
      {
        ...emptyLine(),
        debit: needsCredit ? 0 : balancingAmount,
        credit: needsCredit ? balancingAmount : 0,
      },
    ]);
  }

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/erp/journal-entries");
    }
  }

  function handleSuccessNavigate(id?: string) {
    clearFormSubmitFeedback({
      setFormErrors: formErrorsAdapter(setError),
      clearFieldValidation: fieldValidation.clearFieldValidation,
    });
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
    if (
      !validateBeforeFormSave(
        [
        {
          key: "store",
          ok: Boolean(effectiveStoreId),
          message: storeRequiredMessage ?? "Store is required.",
        },
        {
          key: "lines",
          ok: totals.debit === totals.credit && totals.debit > 0,
          message: "Journal must balance with non-zero totals.",
        },
        { key: "lines", ok: apiLines.length >= 2, message: "At least two lines required." },
      ],
        {
          markFieldValidationFailed: fieldValidation.markFieldValidationFailed,
          clearFieldValidation: fieldValidation.clearFieldValidation,
          setFormErrors: formErrorsAdapter(setError),
        },
      )
    ) {
      return;
    }

if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    startTransition(async () => {
      try {
        const res = await adminPost<{ id: string }>("erp/journal-entries", {
          operationId: operationIdRef.current,
          transactionDate,
          description,
          storeId: effectiveStoreId,
          lines: apiLines,
        });
        handleSuccessNavigate(res.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to post journal");
      } finally {
        submitInFlightRef.current = false;
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
            <AdminFormField label="Store" required fieldKey="store">
              <ActiveStoreFormField
                mode="create"
                stores={stores}
                activeStoreId={activeStoreId}
                storeId={storeId}
                onStoreIdChange={setStoreId}
                label=""
                invalid={fieldValidation.isFieldInvalid("store")}
              />
            </AdminFormField>
            <AdminFormField
              label="Description / Purpose"
              required
              className="sm:col-span-2 lg:col-span-3"
            >
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Borrowed amount from party, partner capital, or adjustment"
                required
              />
            </AdminFormField>
          </AdminFormGrid>
        </AdminFormSection>

        {showGuide ? (
          <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3.5 text-xs text-foreground space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-primary">
                <HelpCircle className="size-4" />
                <span>Double-Entry Quick Rules</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setShowGuide(false)}
                className="h-5 px-1.5 text-muted-foreground hover:text-foreground"
              >
                Dismiss
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 pt-1 text-muted-foreground">
              <div className="rounded-lg border bg-background/80 p-2.5 space-y-1">
                <span className="font-semibold text-foreground block">Borrowing Money (Loan)</span>
                <p>• <strong>Debit:</strong> Bank / Cash (Money received)</p>
                <p>• <strong>Credit:</strong> Loan / Liability (Debt owed)</p>
              </div>
              <div className="rounded-lg border bg-background/80 p-2.5 space-y-1">
                <span className="font-semibold text-foreground block">Repaying Loan</span>
                <p>• <strong>Debit:</strong> Loan / Liability (Debt cleared)</p>
                <p>• <strong>Credit:</strong> Bank / Cash (Money paid out)</p>
              </div>
              <div className="rounded-lg border bg-background/80 p-2.5 space-y-1">
                <span className="font-semibold text-foreground block">Key Principle</span>
                <p>Total Debits <strong>must equal</strong> Total Credits.</p>
                <p>Each line is either Debit or Credit, not both.</p>
              </div>
            </div>
          </div>
        ) : null}

        <Card
          className={
            fieldValidation.isFieldInvalid("lines") ? "ring-2 ring-destructive/60" : undefined
          }
        >
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold">Lines</CardTitle>
              <Badge variant="secondary" className="font-mono text-[11px] px-2 py-0.5">
                {lines.length} {lines.length === 1 ? "line" : "lines"}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowGuide((prev) => !prev)}
              >
                <HelpCircle className="size-3.5 mr-1" />
                {showGuide ? "Hide guide" : "Debit / Credit guide"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
              >
                <Plus data-icon="inline-start" className="size-3.5" />
                Add line
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Table Header on Desktop */}
            <div className="hidden sm:grid sm:grid-cols-[36px_minmax(220px,1.4fr)_135px_135px_minmax(180px,1.2fr)_40px] items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b bg-muted/30 rounded-t-md">
              <div className="text-center">#</div>
              <div>Account *</div>
              <div className="text-right">Debit ({currencySymbol})</div>
              <div className="text-right">Credit ({currencySymbol})</div>
              <div>Line note</div>
              <div className="text-center" />
            </div>

            {/* Line rows */}
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div
                  key={line.key}
                  className="rounded-lg border bg-card/60 p-2.5 transition-colors hover:bg-muted/10 space-y-2 sm:space-y-0 sm:grid sm:grid-cols-[36px_minmax(220px,1.4fr)_135px_135px_minmax(180px,1.2fr)_40px] sm:items-center sm:gap-2 sm:p-2"
                >
                  {/* Line Index */}
                  <div className="flex items-center justify-between sm:justify-center">
                    <span className="text-xs font-mono font-medium text-muted-foreground">
                      #{idx + 1}
                    </span>
                    {/* Mobile-only trash button */}
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive sm:hidden"
                      disabled={lines.length <= 2}
                      onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                      aria-label={`Remove line ${idx + 1}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>

                  {/* Account select with grouped categories */}
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground sm:hidden mb-1 block">
                      Account
                    </label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={line.accountId}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l) =>
                            l.key === line.key ? { ...l, accountId: e.target.value } : l,
                          ),
                        )
                      }
                    >
                      <option value="">Select account…</option>
                      {groupedAccounts.map((group) => (
                        <optgroup key={group.category} label={group.category}>
                          {group.items.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} — {a.name} {a.account_type_name ? `(${a.account_type_name})` : ""}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {/* Debit */}
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground sm:hidden mb-1 block">
                      Debit ({currencySymbol})
                    </label>
                    <NumericInput
                      min={0}
                      step="0.01"
                      fractionDigits={2}
                      placeholder="0.00"
                      className="h-9 text-right font-mono text-sm"
                      value={line.debit}
                      onValueChange={(debit) =>
                        setLines((prev) =>
                          prev.map((l) =>
                            l.key === line.key ? { ...l, debit, credit: 0 } : l,
                          ),
                        )
                      }
                    />
                  </div>

                  {/* Credit */}
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground sm:hidden mb-1 block">
                      Credit ({currencySymbol})
                    </label>
                    <NumericInput
                      min={0}
                      step="0.01"
                      fractionDigits={2}
                      placeholder="0.00"
                      className="h-9 text-right font-mono text-sm"
                      value={line.credit}
                      onValueChange={(credit) =>
                        setLines((prev) =>
                          prev.map((l) =>
                            l.key === line.key ? { ...l, credit, debit: 0 } : l,
                          ),
                        )
                      }
                    />
                  </div>

                  {/* Line note */}
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground sm:hidden mb-1 block">
                      Line note
                    </label>
                    <Input
                      placeholder="Line note (optional)"
                      className="h-9 text-xs"
                      value={line.description}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l) =>
                            l.key === line.key ? { ...l, description: e.target.value } : l,
                          ),
                        )
                      }
                    />
                  </div>

                  {/* Desktop trash button */}
                  <div className="hidden sm:flex justify-center">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      disabled={lines.length <= 2}
                      onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                      aria-label={`Remove line ${idx + 1}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Reconciliation summary bar */}
            <div className="mt-4 rounded-xl border bg-muted/20 p-3.5 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {/* Left: Balance status badge */}
                <div>
                  {isBalanced ? (
                    <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-3 py-1.5 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-xs font-semibold">Entry is balanced</span>
                      <span className="text-xs opacity-80">
                        ({currencySymbol}{totals.debit.toFixed(2)})
                      </span>
                    </div>
                  ) : hasAmounts ? (
                    <div className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-1.5 text-amber-800 dark:text-amber-300">
                      <AlertCircle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span className="text-xs font-semibold">Out of balance:</span>
                      <span className="text-xs font-mono">
                        Difference of {currencySymbol}{diff.toFixed(2)} ({totals.debit > totals.credit ? "Credit needed" : "Debit needed"})
                      </span>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={handleAutoBalance}
                        className="h-6 text-[11px] px-2 font-medium bg-background text-foreground shadow-2xs hover:bg-accent"
                      >
                        Auto-balance
                      </Button>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Info className="size-3.5 text-muted-foreground" />
                      <span>Enter debit and credit amounts. Journal must balance before posting.</span>
                    </div>
                  )}
                </div>

                {/* Right: Totals summary */}
                <div className="flex items-center gap-5 justify-end">
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      Total Debit
                    </div>
                    <div className="text-sm font-semibold font-mono tabular-nums text-foreground">
                      {currencySymbol}{totals.debit.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      Total Credit
                    </div>
                    <div className="text-sm font-semibold font-mono tabular-nums text-foreground">
                      {currencySymbol}{totals.credit.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right border-l pl-4 border-border/80">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      Difference
                    </div>
                    <div
                      className={cn(
                        "text-sm font-semibold font-mono tabular-nums",
                        isBalanced
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {currencySymbol}{diff.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <ErrorsFeedbackBridge errors={error} />

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

