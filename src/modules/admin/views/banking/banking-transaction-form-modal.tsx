"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Coins,
  type LucideIcon,
} from "lucide-react";

import type {
  BankingAccountRow,
  BankingLedgerCounterRow,
} from "@/common/erp/finance-types";
import { PAYMENT_MODE_OPTIONS } from "@/common/erp/finance-types";
import type { BankingTxKind } from "@/modules/admin/lib/admin-quick-create-config";
import {
  AdminFormActions,
  AdminFormField,
  AdminFormModal,
} from "@/modules/admin/ui";
import { formatCurrencyAmount, resolveCurrencySymbol } from "@/lib/format-currency";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  BalanceBadge,
  bankingTxModalAccentClass,
  bankingTxModalAsideClass,
} from "@/modules/admin/views/banking/banking-ui";

const TX_META: Record<
  BankingTxKind,
  {
    title: string;
    description: string;
    submitLabel: string;
    icon: LucideIcon;
    accent: "in" | "out" | "neutral";
    flowLabel: string;
  }
> = {
  owner_contribution: {
    title: "Owner's contribution",
    description: "Capital into this account; offset credits equity.",
    submitLabel: "Record contribution",
    icon: ArrowDownLeft,
    accent: "in",
    flowLabel: "Money in",
  },
  generic: {
    title: "Other income",
    description: "Miscellaneous receipt; credits Other Income on P&L.",
    submitLabel: "Record income",
    icon: Coins,
    accent: "in",
    flowLabel: "Money in",
  },
  owner_drawing: {
    title: "Owner's drawings",
    description: "Owner withdrawal; offset debits drawings.",
    submitLabel: "Record drawing",
    icon: ArrowUpRight,
    accent: "out",
    flowLabel: "Money out",
  },
  account_transfer: {
    title: "Transfer to account",
    description: "Move funds to another cash or bank account.",
    submitLabel: "Record transfer",
    icon: ArrowLeftRight,
    accent: "out",
    flowLabel: "Money out",
  },
};

const FIELD_SELECT =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export type BankingTransactionFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: BankingAccountRow;
  accountId: string;
  txKind: BankingTxKind;
  genericDirection: "in" | "out";
  onGenericDirectionChange: (direction: "in" | "out") => void;
  hideGenericDirection?: boolean;
  activeStoreName?: string | null;
  /** Cash/bank accounts — transfer destination only. */
  transferDestinations: BankingAccountRow[];
  /** Income / expense / equity COA lines (Zoho-style offsets). */
  ledgerCounters: BankingLedgerCounterRow[];
  pending: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
};

function isMoneyIn(kind: BankingTxKind, direction: "in" | "out"): boolean {
  if (kind === "owner_contribution") return true;
  if (kind === "owner_drawing" || kind === "account_transfer") return false;
  return direction === "in";
}

export function BankingTransactionFormModal({
  open,
  onOpenChange,
  account,
  accountId,
  txKind,
  genericDirection,
  onGenericDirectionChange,
  hideGenericDirection = false,
  activeStoreName,
  transferDestinations,
  ledgerCounters,
  pending,
  error,
  onSubmit,
}: BankingTransactionFormModalProps) {
  const meta = useMemo(() => {
    const base = TX_META[txKind];
    if (txKind !== "generic" || genericDirection === "in") return base;
    return {
      ...base,
      title: "Other payment",
      description: "Miscellaneous payment; debits Other Expense on P&L.",
      submitLabel: "Record payment",
      accent: "out" as const,
      flowLabel: "Money out",
    };
  }, [txKind, genericDirection]);

  const Icon = meta.icon;
  const [amountPreview, setAmountPreview] = useState(0);

  const moneyIn = isMoneyIn(txKind, genericDirection);
  const projectedBalance = useMemo(
    () =>
      account.current_balance + (moneyIn ? amountPreview : -amountPreview),
    [account.current_balance, amountPreview, moneyIn],
  );

  const isTransfer = txKind === "account_transfer";
  const formId = `banking-tx-${txKind}`;

  useEffect(() => {
    if (!open) setAmountPreview(0);
  }, [open, txKind, genericDirection]);

  const counterLabel = isTransfer
    ? "Transfer to (cash / bank)"
    : txKind === "owner_contribution" || txKind === "owner_drawing"
      ? "Equity account"
      : genericDirection === "in"
        ? "Income account"
        : "Expense account";

  const counterHint = isTransfer
    ? "Another wallet in your books—not a P&L account."
    : txKind === "owner_contribution" || txKind === "owner_drawing"
      ? "Chart of accounts. Defaults to Owner's Equity if blank."
      : genericDirection === "in"
        ? "Defaults to Other Income. Not a cash or bank account."
        : "Defaults to Other Expense. Not a cash or bank account.";

  const counterPlaceholder =
    txKind === "owner_contribution" || txKind === "owner_drawing"
      ? "Owner's equity (default)"
      : isTransfer
        ? "Select destination account"
        : genericDirection === "in"
          ? "Other income (default)"
          : "Other expense (default)";

  return (
    <AdminFormModal
      open={open}
      onOpenChange={onOpenChange}
      title={meta.title}
      description={undefined}
      size="lg"
      scrollBody={false}
      formId={formId}
      footer={
        <AdminFormActions
          formId={formId}
          onCancel={() => onOpenChange(false)}
          submitLabel={meta.submitLabel}
          pending={pending}
          errors={error}
        />
      }
    >
      <form
        id={formId}
        onSubmit={onSubmit}
        key={`${txKind}-${genericDirection}-${open}`}
        className="-mx-5 -my-4 flex flex-col overflow-hidden md:flex-row md:items-stretch"
      >
        <aside
          className={cn(bankingTxModalAsideClass(meta.accent), "py-4 md:py-5")}
          aria-label="Transaction summary"
        >
          <div className="space-y-3">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] font-semibold uppercase tracking-wider",
                moneyIn
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-background/60 text-muted-foreground",
              )}
            >
              {meta.flowLabel}
            </Badge>
            <div className="flex items-start gap-2.5">
              <span className={bankingTxModalAccentClass(meta.accent)}>
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-base font-semibold leading-tight">{meta.title}</p>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">
                  {meta.description}
                </p>
              </div>
            </div>

            <Separator className="bg-border/70" />

            <div className="space-y-0.5 text-sm">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Account
              </p>
              <p className="font-semibold leading-tight">{account.name}</p>
              <p className="text-xs text-muted-foreground">
                {account.code} · {account.account_type_name}
                {activeStoreName ? ` · ${activeStoreName}` : null}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2 md:mt-5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Balance
            </p>
            <div className="space-y-2 rounded-md border border-border/60 bg-background/50 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Current</span>
                <BalanceBadge amount={account.current_balance} />
              </div>
              {amountPreview > 0 ? (
                <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2 text-sm">
                  <span className="text-muted-foreground">After</span>
                  <span className="flex items-center gap-2 tabular-nums">
                    <span
                      className={cn(
                        "text-xs",
                        moneyIn ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {moneyIn ? "+" : "−"}
                      {formatCurrencyAmount(amountPreview)}
                    </span>
                    <span
                      className={cn(
                        "font-semibold",
                        moneyIn ? "text-primary" : "text-foreground",
                      )}
                    >
                      {formatCurrencyAmount(projectedBalance)}
                    </span>
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-4 md:px-5 md:py-4">
          <div className="space-y-3">
            <div
              className={cn(
                "flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 shadow-xs",
                "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1",
                moneyIn && "focus-within:border-primary/35",
              )}
            >
              <Label htmlFor={`${formId}-amount`} className="sr-only">
                Amount
              </Label>
              <span className="text-base font-medium text-muted-foreground">
                {resolveCurrencySymbol()}
              </span>
              <Input
                id={`${formId}-amount`}
                name="amount"
                type="number"
                step="0.01"
                min={0}
                placeholder="0.00"
                required
                autoFocus
                className="h-8 border-0 bg-transparent px-0 text-xl font-semibold tabular-nums shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                onChange={(e) =>
                  setAmountPreview(Math.max(0, parseFloat(e.target.value) || 0))
                }
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <AdminFormField label="Date" required className="gap-1.5">
                <Input
                  id={`${formId}-date`}
                  name="transactionDate"
                  type="date"
                  className="h-9"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </AdminFormField>
              <AdminFormField
                label={moneyIn ? "Received via" : "Paid via"}
                className="gap-1.5"
              >
                <select
                  id={`${formId}-payment`}
                  name="paymentType"
                  className={FIELD_SELECT}
                  defaultValue="Cash"
                >
                  {PAYMENT_MODE_OPTIONS.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </AdminFormField>
            </div>

            {txKind === "generic" && !hideGenericDirection ? (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Direction</Label>
                <div
                  className="grid h-9 grid-cols-2 gap-1 rounded-md border border-border p-0.5"
                  role="radiogroup"
                  aria-label="Transaction direction"
                >
                  {(["in", "out"] as const).map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      role="radio"
                      aria-checked={genericDirection === dir}
                      className={cn(
                        "rounded px-2 text-xs font-medium transition-colors",
                        genericDirection === dir
                          ? dir === "in"
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-secondary-foreground"
                          : "text-muted-foreground hover:bg-muted/60",
                      )}
                      onClick={() => onGenericDirectionChange(dir)}
                    >
                      {dir === "in" ? "Deposit" : "Withdrawal"}
                    </button>
                  ))}
                </div>
                <input type="hidden" name="direction" value={genericDirection} />
              </div>
            ) : (
              <input type="hidden" name="direction" value={genericDirection} />
            )}

            <AdminFormField
              label={counterLabel}
              required={isTransfer}
              hint={counterHint}
              className="gap-1.5"
            >
              <select
                id={`${formId}-counter`}
                name="counterAccountId"
                className={FIELD_SELECT}
                defaultValue=""
                required={isTransfer}
              >
                <option value="">{counterPlaceholder}</option>
                {isTransfer
                  ? transferDestinations.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.code})
                      </option>
                    ))
                  : ledgerCounters.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.code})
                      </option>
                    ))}
              </select>
            </AdminFormField>

            <div className="grid gap-3 sm:grid-cols-2">
              <AdminFormField label="Reference" optional className="gap-1.5">
                <Input
                  id={`${formId}-reference`}
                  name="reference"
                  className="h-9"
                  placeholder="UTR / receipt no."
                />
              </AdminFormField>
              <AdminFormField label="Description" optional className="gap-1.5">
                <Input
                  id={`${formId}-description`}
                  name="description"
                  className="h-9"
                  placeholder="Short note"
                />
              </AdminFormField>
            </div>
          </div>
        </div>
      </form>
    </AdminFormModal>
  );
}
