"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Coins,
  type LucideIcon,
} from "lucide-react";

import type {
  BankingAccountRow,
} from "@/common/erp/finance-types";
import { PAYMENT_MODE_OPTIONS } from "@/common/erp/finance-types";
import type { BankingTxKind } from "@/modules/admin/lib/admin-quick-create-config";
import {
  AdminFormActions,
  AdminFormColumns,
  AdminFormField,
  AdminFormGrid,
  AdminFormModal,
  AdminFormSection,
} from "@/modules/admin/ui";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BalanceBadge,
  bankingTxModalAccentClass,
} from "@/modules/admin/views/banking/banking-ui";

const TX_META: Record<
  BankingTxKind,
  {
    title: string;
    description: string;
    submitLabel: string;
    icon: LucideIcon;
    accent: "in" | "out" | "neutral";
  }
> = {
  owner_contribution: {
    title: "Owner's contribution",
    description:
      "Record capital the owner puts into this cash account. Cash increases; the offset posts to the selected equity source account.",
    submitLabel: "Record contribution",
    icon: ArrowDownLeft,
    accent: "in",
  },
  generic: {
    title: "Other income",
    description:
      "Miscellaneous cash movement. Choose money in for income or money out for other payments not tied to bills or invoices.",
    submitLabel: "Record transaction",
    icon: Coins,
    accent: "neutral",
  },
  owner_drawing: {
    title: "Owner's drawings",
    description:
      "Money taken out for the owner. Cash decreases; the offset posts to drawings or another account you select.",
    submitLabel: "Record drawing",
    icon: ArrowUpRight,
    accent: "out",
  },
  account_transfer: {
    title: "Transfer to account",
    description:
      "Move cash from this account to another cash or bank account in your books.",
    submitLabel: "Record transfer",
    icon: ArrowLeftRight,
    accent: "out",
  },
};

const SELECT_CLS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs";

export type BankingTransactionFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: BankingAccountRow;
  accountId: string;
  txKind: BankingTxKind;
  genericDirection: "in" | "out";
  onGenericDirectionChange: (direction: "in" | "out") => void;
  stores: { id: string; name: string }[];
  defaultStoreId: string;
  allAccounts: BankingAccountRow[];
  pending: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
};

function isMoneyIn(
  kind: BankingTxKind,
  direction: "in" | "out",
): boolean {
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
  stores,
  defaultStoreId,
  allAccounts,
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
      description:
        "Miscellaneous cash paid out — not tied to a purchase bill, expense voucher, or owner drawing.",
      submitLabel: "Record payment",
      accent: "out" as const,
    };
  }, [txKind, genericDirection]);
  const Icon = meta.icon;
  const [amountPreview, setAmountPreview] = useState(0);

  const moneyIn = isMoneyIn(txKind, genericDirection);
  const projectedBalance = useMemo(
    () =>
      account.current_balance +
      (moneyIn ? amountPreview : -amountPreview),
    [account.current_balance, amountPreview, moneyIn],
  );

  const counterAccounts = allAccounts.filter((a) => a.id !== accountId);
  const formId = `banking-tx-${txKind}`;

  const counterField = txKind === "owner_drawing" ? (
    <AdminFormField
      label="Offset account"
      hint="Leave as default to post against the standard drawings account."
    >
      <select
        id={`${formId}-counter`}
        name="counterAccountId"
        className={SELECT_CLS}
        defaultValue=""
      >
        <option value="">Drawings (default)</option>
        {counterAccounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.code})
          </option>
        ))}
      </select>
    </AdminFormField>
  ) : (
    <AdminFormField
      label={
        txKind === "account_transfer"
          ? "Transfer to account"
          : txKind === "owner_contribution"
            ? "From account"
            : "Counter account"
      }
      required={txKind === "account_transfer"}
      hint={
        txKind === "owner_contribution"
          ? "Usually owner's equity or capital — credited when cash is received."
          : undefined
      }
    >
      <select
        id={`${formId}-counter`}
        name="counterAccountId"
        className={SELECT_CLS}
        defaultValue=""
        required={txKind === "account_transfer"}
      >
        <option value="">
          {txKind === "owner_contribution"
            ? "Equity / source (optional)"
            : "Select account"}
        </option>
        {counterAccounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.code})
          </option>
        ))}
      </select>
    </AdminFormField>
  );

  return (
    <AdminFormModal
      open={open}
      onOpenChange={onOpenChange}
      title={meta.title}
      description={meta.description}
      size="landscape"
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
      <form id={formId} onSubmit={onSubmit} key={`${txKind}-${genericDirection}-${open}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={bankingTxModalAccentClass(meta.accent)}>
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {account.code}
              </p>
              <p className="truncate text-sm font-semibold">{account.name}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-6 text-right">
            <div>
              <p className="text-xs text-muted-foreground">Current balance</p>
              <BalanceBadge amount={account.current_balance} />
            </div>
            {amountPreview > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground">
                  {moneyIn ? "After deposit" : "After withdrawal"}
                </p>
                <p className="text-sm font-semibold tabular-nums">
                  {formatCurrencyAmount(projectedBalance)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {moneyIn ? "+" : "−"}
                  {formatCurrencyAmount(amountPreview)}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <AdminFormSection title="Transaction">
          <AdminFormColumns cols={2}>
            <AdminFormGrid cols={2}>
              <AdminFormField label="Store" required className="sm:col-span-2">
                <select
                  id={`${formId}-store`}
                  name="storeId"
                  className={SELECT_CLS}
                  required
                  defaultValue={defaultStoreId}
                >
                  <option value="">Select store</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </AdminFormField>
              {counterField}
              <AdminFormField label="Date" required>
                <Input
                  id={`${formId}-date`}
                  name="transactionDate"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </AdminFormField>
              <AdminFormField label="Amount" required>
                <Input
                  id={`${formId}-amount`}
                  name="amount"
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="0.00"
                  required
                  onChange={(e) =>
                    setAmountPreview(Math.max(0, parseFloat(e.target.value) || 0))
                  }
                />
              </AdminFormField>
              {txKind === "generic" ? (
                <AdminFormField label="Direction" className="sm:col-span-2">
                  <select
                    id={`${formId}-direction`}
                    name="direction"
                    className={SELECT_CLS}
                    value={genericDirection}
                    onChange={(e) =>
                      onGenericDirectionChange(e.target.value as "in" | "out")
                    }
                  >
                    <option value="in">Money in (deposit)</option>
                    <option value="out">Money out (withdrawal)</option>
                  </select>
                </AdminFormField>
              ) : null}
            </AdminFormGrid>

            <AdminFormGrid cols={2}>
              <AdminFormField
                label={moneyIn ? "Received via" : "Paid via"}
                className="sm:col-span-2"
              >
                <select
                  id={`${formId}-payment`}
                  name="paymentType"
                  className={SELECT_CLS}
                  defaultValue="Cash"
                >
                  {PAYMENT_MODE_OPTIONS.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </AdminFormField>
              <AdminFormField label="Reference #" optional className="sm:col-span-2">
                <Input
                  id={`${formId}-reference`}
                  name="reference"
                  placeholder="Cheque / UTR / receipt no."
                />
              </AdminFormField>
              <AdminFormField label="Description" optional className="sm:col-span-2">
                <Textarea
                  id={`${formId}-description`}
                  name="description"
                  rows={3}
                  placeholder="Short note for auditors and your team"
                  className="min-h-[5rem] resize-y"
                />
              </AdminFormField>
            </AdminFormGrid>
          </AdminFormColumns>
        </AdminFormSection>
      </form>
    </AdminFormModal>
  );
}
