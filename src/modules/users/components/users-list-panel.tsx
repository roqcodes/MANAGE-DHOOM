"use client";

import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Ban, Columns3, Plus, Search } from "lucide-react";

import type { DBUser } from "@/common/admin/types";
import { Pagination } from "@/modules/admin/components/pagination";
import {
  exportPortalUsersCsv,
  PortalStaffDataTable,
} from "@/modules/users/components/users-data-table";
import { UsersCreateSalesmanModal } from "@/modules/users/components/users-create-salesman-modal";
import { UsersCreateStaffModal } from "@/modules/users/components/users-create-staff-modal";
import { UsersSalesmenPanel } from "@/modules/users/components/users-salesmen-panel";
import { UsersPurgeModal } from "@/modules/users/components/users-purge-modal";
import { useAdminSession } from "@/modules/admin/providers/admin-session-provider";
import { UsersStaffAccessModal } from "@/modules/users/components/users-staff-access-modal";
import { matchesUserSearch } from "@/modules/users/components/users-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";

type UsersContent = { kind: "team"; data: DBUser[]; total: number };

export function UsersListPanel({
  content,
  page,
  initialLoading = false,
}: {
  content: UsersContent;
  page: number;
  initialLoading?: boolean;
}) {
  const profile = useAdminSession();
  const canManageRoles = Boolean(profile?.rbac?.canManageRoles);
  const [search, setSearch] = useState("");
  const [roleUser, setRoleUser] = useState<DBUser | null>(null);
  const [purgeUser, setPurgeUser] = useState<DBUser | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSalesmanOpen, setCreateSalesmanOpen] = useState(false);

  const filtered = useMemo(
    () => content.data.filter((user) => matchesUserSearch(user, search)),
    [content.data, search],
  );

  const isFiltering = search.trim().length > 0;
  const total = content.total;
  const pageCount = content.data.length;

  function handleExport() {
    exportPortalUsersCsv(filtered as DBUser[], "team");
  }

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
                ERP staff and vendor portal accounts. Super admins can create users with
                email, password, and role.
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

          <div className="border-b p-2">
            <InputGroup className="h-9">
              <InputGroupAddon align="inline-start">
                <Search aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, phone..."
              />
              <InputGroupAddon align="inline-end" className="gap-1 pr-1">
                <InputGroupButton
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Export list"
                  onClick={handleExport}
                >
                  <Columns3 />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </div>

          {initialLoading ? (
            <AdminTableBodySkeleton rows={8} />
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <Ban className="size-12 text-muted-foreground/30" aria-hidden />
              <p className="text-sm text-muted-foreground">
                {isFiltering
                  ? "No users match your filters on this page."
                  : "No users in this view."}
              </p>
              {isFiltering ? (
                <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                  Clear filters
                </Button>
              ) : canManageRoles ? (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="size-4" />
                  Create user
                </Button>
              ) : null}
            </div>
          ) : (
            <PortalStaffDataTable
              users={filtered as DBUser[]}
              currentUserId={profile?.id}
              onEditRole={canManageRoles ? setRoleUser : undefined}
              onPurgeUser={canManageRoles ? setPurgeUser : undefined}
            />
          )}

          <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
            <span>
              {isFiltering
                ? `${filtered.length} of ${pageCount} on this page`
                : `${Math.min(pageCount, total)} of ${total.toLocaleString("en-IN")} users`}
            </span>
          </div>

          {!isFiltering && total > pageCount ? (
            <Pagination total={total} page={page} basePath="/admin/users" />
          ) : null}
        </CardContent>
      </Card>

      {canManageRoles ? (
        <div className="mt-4">
          <UsersSalesmenPanel />
        </div>
      ) : null}
    </>
  );
}
