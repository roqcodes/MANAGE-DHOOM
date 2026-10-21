"use client";

import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Ban, Columns3, Plus, Search } from "lucide-react";

import type { DBUser } from "@/common/admin/types";
import { Pagination } from "@/modules/admin/components/pagination";
import {
  ErpSalesmenDataTable,
  exportPortalUsersCsv,
  PortalStaffDataTable,
} from "@/modules/users/components/users-data-table";
import { UsersChangeSalesmanPinModal } from "@/modules/users/components/users-change-salesman-pin-modal";
import { UsersCreateSalesmanModal } from "@/modules/users/components/users-create-salesman-modal";
import { UsersCreateStaffModal } from "@/modules/users/components/users-create-staff-modal";
import { UsersEditSalesmanModal } from "@/modules/users/components/users-edit-salesman-modal";
import type { ErpSalesmanRow } from "@/modules/users/services/erp-salesmen.service";
import { UsersPurgeModal } from "@/modules/users/components/users-purge-modal";
import { useAdminSession } from "@/modules/admin/providers/admin-session-provider";
import { UsersStaffAccessModal } from "@/modules/users/components/users-staff-access-modal";
import {
  matchesErpSalesmanSearch,
  matchesUserSearch,
} from "@/modules/users/components/users-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";

type UsersContent = { kind: "team"; data: DBUser[]; total: number };

export type TeamDirectoryTab = "all" | "portal" | "salesmen";

type UsersListPanelProps = {
  content: UsersContent;
  salesmen?: ErpSalesmanRow[];
  page: number;
  initialLoading?: boolean;
};

export function UsersListPanel({
  content,
  salesmen = [],
  page,
  initialLoading = false,
}: UsersListPanelProps) {
  const profile = useAdminSession();
  const canManageRoles = Boolean(profile?.rbac?.canManageRoles);
  const [tab, setTab] = useState<TeamDirectoryTab>("all");
  const [search, setSearch] = useState("");
  const [roleUser, setRoleUser] = useState<DBUser | null>(null);
  const [purgeUser, setPurgeUser] = useState<DBUser | null>(null);
  const [editSalesman, setEditSalesman] = useState<ErpSalesmanRow | null>(null);
  const [changePinSalesman, setChangePinSalesman] = useState<ErpSalesmanRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSalesmanOpen, setCreateSalesmanOpen] = useState(false);

  const isFiltering = search.trim().length > 0;

  const filteredPortal = useMemo(
    () => content.data.filter((user) => matchesUserSearch(user, search)),
    [content.data, search],
  );

  const filteredSalesmen = useMemo(
    () => salesmen.filter((s) => matchesErpSalesmanSearch(s, search)),
    [salesmen, search],
  );

  const total = content.total;
  const pageCount = content.data.length;

  const showPortal = tab === "all" || tab === "portal";
  const showSalesmen = tab === "all" || tab === "salesmen";
  const portalRows = showPortal ? filteredPortal : [];
  const salesmenRows = showSalesmen ? filteredSalesmen : [];

  const isEmpty =
    (showPortal ? portalRows.length === 0 : true) &&
    (showSalesmen ? salesmenRows.length === 0 : true);

  function handleExport() {
    if (tab === "salesmen") return;
    exportPortalUsersCsv(portalRows as DBUser[], "team");
  }

  const footerLabel = useMemo(() => {
    if (isFiltering) {
      const n = (showPortal ? portalRows.length : 0) + (showSalesmen ? salesmenRows.length : 0);
      return `${n} match${n === 1 ? "" : "es"}`;
    }
    if (tab === "salesmen") {
      return `${salesmenRows.length} salesman${salesmenRows.length === 1 ? "" : "en"}`;
    }
    if (tab === "portal") {
      return `${Math.min(pageCount, total)} of ${total.toLocaleString("en-IN")} portal users`;
    }
    const parts = [`${Math.min(pageCount, total)} of ${total.toLocaleString("en-IN")} portal users`];
    if (salesmenRows.length > 0) {
      parts.push(`${salesmenRows.length} salesman${salesmenRows.length === 1 ? "" : "en"}`);
    }
    return parts.join(" · ");
  }, [
    isFiltering,
    tab,
    portalRows.length,
    salesmenRows.length,
    pageCount,
    total,
    showPortal,
    showSalesmen,
  ]);

  return (
    <>
      <AnimatePresence>
        {roleUser && canManageRoles ? (
          <UsersStaffAccessModal
            key={roleUser.id}
            user={roleUser}
            onClose={() => setRoleUser(null)}
            onUpdated={() => setRoleUser(null)}
          />
        ) : null}
        {createOpen && canManageRoles ? (
          <UsersCreateStaffModal
            key="create-staff"
            onClose={() => setCreateOpen(false)}
            onCreated={() => setCreateOpen(false)}
          />
        ) : null}
        {createSalesmanOpen && canManageRoles ? (
          <UsersCreateSalesmanModal
            key="create-salesman"
            onClose={() => setCreateSalesmanOpen(false)}
            onCreated={() => setCreateSalesmanOpen(false)}
          />
        ) : null}
        {editSalesman && canManageRoles ? (
          <UsersEditSalesmanModal
            key={editSalesman.id}
            salesman={editSalesman}
            onClose={() => setEditSalesman(null)}
          />
        ) : null}
        {changePinSalesman && canManageRoles ? (
          <UsersChangeSalesmanPinModal
            key={`pin-${changePinSalesman.id}`}
            salesman={changePinSalesman}
            onClose={() => setChangePinSalesman(null)}
          />
        ) : null}
        {purgeUser && canManageRoles ? (
          <UsersPurgeModal
            key={purgeUser.id}
            user={purgeUser}
            onClose={() => setPurgeUser(null)}
            onPurged={() => setPurgeUser(null)}
          />
        ) : null}
      </AnimatePresence>

      <Card className="overflow-hidden border border-border py-0 ring-0">
        <CardContent className="flex flex-col gap-0 p-0">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b px-3 py-3">
            <div>
              <h2 className="text-sm font-medium">Team directory</h2>
              <p className="text-xs text-muted-foreground">
                Portal logins and PIN-based salesmen. Super admins can create users, edit salesmen,
                and change PINs.
              </p>
            </div>
            {canManageRoles ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setCreateSalesmanOpen(true)}>
                  <Plus className="size-4" />
                  Create salesman
                </Button>
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="size-4" />
                  Create user
                </Button>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 border-b p-2 sm:flex-row sm:items-center">
            <Tabs
              value={tab}
              onValueChange={(v) => setTab((v as TeamDirectoryTab) ?? "all")}
              className="shrink-0"
            >
              <TabsList className="h-9">
                <TabsTrigger value="all">All users</TabsTrigger>
                <TabsTrigger value="portal">Portal users</TabsTrigger>
                <TabsTrigger value="salesmen">Salesmen</TabsTrigger>
              </TabsList>
            </Tabs>
            <InputGroup className="h-9 min-w-0 flex-1">
              <InputGroupAddon align="inline-start">
                <Search aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  tab === "salesmen"
                    ? "Search name, phone, email, PIN..."
                    : "Search name, email, phone..."
                }
              />
              <InputGroupAddon align="inline-end" className="gap-1 pr-1">
                <InputGroupButton
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Export list"
                  onClick={handleExport}
                  disabled={tab === "salesmen"}
                >
                  <Columns3 />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </div>

          {initialLoading ? (
            <AdminTableBodySkeleton rows={8} />
          ) : isEmpty ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <Ban className="size-12 text-muted-foreground/30" aria-hidden />
              <p className="text-sm text-muted-foreground">
                {isFiltering ? "No matches in this tab." : "Nothing in this tab yet."}
              </p>
              {isFiltering ? (
                <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              ) : canManageRoles && tab !== "portal" ? (
                <Button size="sm" variant="outline" onClick={() => setCreateSalesmanOpen(true)}>
                  <Plus className="size-4" />
                  Create salesman
                </Button>
              ) : canManageRoles ? (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="size-4" />
                  Create user
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              {showPortal && portalRows.length > 0 ? (
                <PortalStaffDataTable
                  users={portalRows as DBUser[]}
                  currentUserId={profile?.id}
                  onEditRole={canManageRoles ? setRoleUser : undefined}
                  onPurgeUser={canManageRoles ? setPurgeUser : undefined}
                />
              ) : null}
              {showSalesmen && salesmenRows.length > 0 ? (
                <div className={showPortal && portalRows.length > 0 ? "border-t" : undefined}>
                  {tab === "all" && portalRows.length > 0 ? (
                    <p className="px-3 py-2 text-xs font-medium text-muted-foreground">Salesmen</p>
                  ) : null}
                  <ErpSalesmenDataTable
                    salesmen={salesmenRows}
                    showPin={canManageRoles}
                    showHeader={tab !== "all" || portalRows.length === 0}
                    onEditSalesman={canManageRoles ? setEditSalesman : undefined}
                    onChangePin={canManageRoles ? setChangePinSalesman : undefined}
                  />
                </div>
              ) : null}
            </>
          )}

          <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
            <span>{footerLabel}</span>
          </div>

          {!isFiltering && tab !== "salesmen" && total > pageCount ? (
            <Pagination total={total} page={page} basePath="/admin/users" />
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
