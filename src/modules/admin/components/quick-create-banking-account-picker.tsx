"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { BankingAccountRow } from "@/common/erp/finance-types";
import type { BankingTxKind } from "@/modules/admin/lib/admin-quick-create-config";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export function QuickCreateBankingAccountPicker({
  open,
  onOpenChange,
  txKind,
  direction,
  actionLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  txKind: BankingTxKind;
  direction?: "in" | "out";
  actionLabel: string;
}) {
  const router = useRouter();
  const { activeStoreId } = useErpStores();
  const [accounts, setAccounts] = useState<BankingAccountRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setAccountId("");
      setError(null);
      return;
    }
    setLoading(true);
    const q = activeStoreId ? `?storeId=${encodeURIComponent(activeStoreId)}` : "";
    adminGet<{ data: BankingAccountRow[] }>(`erp/banking${q}`)
      .then((res) => setAccounts(res.data ?? []))
      .catch((err: Error) => setError(err.message || "Failed to load accounts"))
      .finally(() => setLoading(false));
  }, [open, activeStoreId]);

  function handleContinue() {
    if (!accountId) {
      setError("Select a cash account to continue.");
      return;
    }
    const params = new URLSearchParams({ tx: txKind });
    if (direction) params.set("direction", direction);
    onOpenChange(false);
    router.push(`/admin/erp/banking/${accountId}?${params.toString()}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select cash account</DialogTitle>
          <DialogDescription>
            Choose the account for &ldquo;{actionLabel}&rdquo;, then complete the transaction.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="quick-create-banking-account">Cash account</Label>
          <select
            id="quick-create-banking-account"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setError(null);
            }}
            disabled={loading || accounts.length === 0}
          >
            <option value="">
              {loading ? "Loading accounts…" : "Select account"}
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
                {account.code ? ` (${account.code})` : ""}
              </option>
            ))}
          </select>
          {!loading && accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No cash accounts found. Add one from Cash Accounts first.
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleContinue} disabled={loading}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
