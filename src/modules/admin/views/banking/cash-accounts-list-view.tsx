"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus } from "lucide-react";

import type { BankingAccountRow } from "@/common/erp/finance-types";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TableHead } from "@/components/ui/table";
import {
  AdminDataTable,
  AdminListCard,
  AdminPageHeader,
  AdminPageLayout,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableLink,
  AdminTableRow,
  ErpListRowActions,
  SortableTableHead,
  useDebouncedValue,
  useSortableData,
} from "@/modules/admin/ui";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";
import {
  AccountTypeBadge,
  BalanceBadge,
} from "@/modules/admin/views/banking/banking-ui";

export function CashAccountsListView() {
  const { activeStoreId } = useErpStores();
  const [accounts, setAccounts] = useState<BankingAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accountKind, setAccountKind] = useState<"cash" | "loan">("cash");
  const debouncedSearch = useDebouncedValue(search, 350);
  const { sorted, sortKey, sortDirection, toggleSort } = useSortableData(accounts, "name", "asc");

  function reload() {
    const q = activeStoreId ? `?storeId=${encodeURIComponent(activeStoreId)}` : "";
    return adminGet<{ data: BankingAccountRow[] }>(`erp/banking${q}`).then((res) =>
      setAccounts(res.data ?? []),
    );
  }

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [activeStoreId]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        a.account_type_name.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q),
    );
  }, [sorted, debouncedSearch]);

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const code = (fd.get("code") as string).trim();
    if (!name || !code) {
      setError("Account name and code are required");
      return;
    }

    startTransition(async () => {
      try {
        await adminPost("erp/banking", {
          kind: "account",
          accountKind,
          name,
          code,
          description: (fd.get("description") as string).trim() || undefined,
          openingBalance: parseFloat((fd.get("openingBalance") as string) || "0"),
          storeId: activeStoreId || undefined,
        });
        setCreateOpen(false);
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create account");
      }
    });
  }

  if (loading) return <AdminPageSkeleton />;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Cash accounts"
        breadcrumb={[{ label: "Banking", href: "/admin/erp/banking" }]}
        description="Bank, cash, and loan accounts with live balances."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus data-icon="inline-start" />
            Add account
          </Button>
        }
      />

      <AdminListCard
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search account name, code, type…"
        isEmpty={filtered.length === 0}
        emptyMessage="No cash accounts found."
        isFiltering={Boolean(debouncedSearch.trim())}
        onClearFilters={() => setSearch("")}
        footer={<span>{filtered.length} accounts</span>}
      >
        <AdminDataTable>
          <AdminTableHeader>
            <TableHead className="w-12 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              #
            </TableHead>
            <SortableTableHead
              label="Account name"
              sortKey="name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Code"
              sortKey="code"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Type"
              sortKey="account_type_name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Description"
              sortKey="description"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              className="hidden md:table-cell"
            />
            <SortableTableHead
              label="Balance"
              sortKey="current_balance"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
              align="right"
            />
            <TableHead className="w-28 text-right" />
          </AdminTableHeader>
          <AdminTableBody>
            {filtered.map((account, index) => (
              <AdminTableRow key={account.id}>
                <AdminTableCell className="text-muted-foreground">{index + 1}</AdminTableCell>
                <AdminTableCell>
                  <AdminTableLink href={`/admin/erp/banking/${account.id}`}>
                    {account.name}
                  </AdminTableLink>
                </AdminTableCell>
                <AdminTableCell className="font-mono text-sm text-muted-foreground">
                  {account.code}
                </AdminTableCell>
                <AdminTableCell>
                  <AccountTypeBadge
                    typeName={account.account_type_name}
                    category={account.account_category}
                  />
                </AdminTableCell>
                <AdminTableCell className="hidden max-w-[220px] truncate text-sm text-muted-foreground md:table-cell">
                  {account.description?.trim() ? account.description : "—"}
                </AdminTableCell>
                <AdminTableCell align="right">
                  <BalanceBadge amount={account.current_balance} />
                </AdminTableCell>
                <AdminTableCell align="right">
                  <ErpListRowActions viewHref={`/admin/erp/banking/${account.id}`} />
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      </AdminListCard>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create account</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="accountKind"
                  checked={accountKind === "cash"}
                  onChange={() => setAccountKind("cash")}
                />
                Cash
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="accountKind"
                  checked={accountKind === "loan"}
                  onChange={() => setAccountKind("loan")}
                />
                Loan
              </label>
            </div>
            <div className="space-y-2">
              <Label>Account name *</Label>
              <Input name="name" placeholder="Account name" required />
            </div>
            <div className="space-y-2">
              <Label>Code *</Label>
              <Input name="code" placeholder="Code" required />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea name="description" placeholder="Description" rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Opening balance</Label>
              <Input name="openingBalance" type="number" step="0.01" defaultValue={0} />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminPageLayout>
  );
}
