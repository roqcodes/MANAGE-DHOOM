"use client";

import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Ban, Columns3, Search } from "lucide-react";

import type { DBUser } from "@/common/admin/types";
import { Pagination } from "@/modules/admin/components/pagination";
import {
  AccessRequestsDataTable,
  exportPendingUsersCsv,
  exportPortalUsersCsv,
  PortalStaffDataTable,
} from "@/modules/users/components/users-data-table";
import { UsersRoleModal } from "@/modules/users/components/users-role-modal";
import { matchesUserSearch } from "@/modules/users/components/users-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

type UsersContent =
  | { kind: "requests"; pending: DBUser[] }
  | { kind: "vendor"; data: DBUser[]; total: number }
  | { kind: "delivery"; data: DBUser[]; total: number }
  | { kind: "admin"; data: DBUser[]; total: number };

const SEGMENT_LABELS: Record<string, string> = {
  vendor: "Vendor",
  delivery: "Delivery",
  admin: "Admin",
};

export function UsersListPanel({
  content,
  segment,
  page,
}: {
  content: UsersContent;
  segment: string;
  page: number;
}) {
  const [search, setSearch] = useState("");
  const [roleUser, setRoleUser] = useState<DBUser | null>(null);

  const isRequests = content.kind === "requests";

  const filtered = useMemo(() => {
    if (isRequests) {
      return content.pending.filter((user) => matchesUserSearch(user, search));
    }

    return content.data.filter((user) => matchesUserSearch(user, search));
  }, [content, isRequests, search]);

  const isFiltering = search.trim().length > 0;

  const total =
    content.kind === "requests" ? content.pending.length : content.total;
  const pageCount =
    content.kind === "requests" ? content.pending.length : content.data.length;

  function handleExport() {
    if (content.kind === "requests") {
      exportPendingUsersCsv(filtered as DBUser[]);
      return;
    }
    exportPortalUsersCsv(filtered as DBUser[], content.kind);
  }

  const listParams: Record<string, string> = {
    tab: isRequests ? "requests" : "users",
  };
  if (!isRequests) listParams.segment = segment;

  const sectionTitle = isRequests
    ? "Access requests"
    : `${SEGMENT_LABELS[segment] ?? "Users"} directory`;

  const sectionDescription = isRequests
    ? "Staff accounts waiting for verification before they can sign in to the portal."
    : segment === "delivery"
      ? "Verified delivery operators."
      : segment === "vendor"
        ? "Verified vendor portal accounts."
        : "Verified admin accounts.";

  return (
    <>
      <AnimatePresence>
        {roleUser ? (
          <UsersRoleModal
            key={roleUser.id}
            user={roleUser}
            title={isRequests ? "Change requested role" : "Change role"}
            description={
              isRequests
                ? "Update the role before approving this request."
                : undefined
            }
            onClose={() => setRoleUser(null)}
            onUpdated={() => setRoleUser(null)}
          />
        ) : null}
      </AnimatePresence>

      <Card className="overflow-hidden border border-border py-0 ring-0">
        <CardContent className="flex flex-col gap-0 p-0">
          <div className="border-b px-3 py-3">
            <h2 className="text-sm font-medium">{sectionTitle}</h2>
            <p className="text-xs text-muted-foreground">{sectionDescription}</p>
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

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <Ban className="size-12 text-muted-foreground/30" aria-hidden />
              <p className="text-sm text-muted-foreground">
                {isFiltering
                  ? "No users match your filters on this page."
                  : "No users in this view."}
              </p>
              {isFiltering ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSearch("")}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : isRequests ? (
            <AccessRequestsDataTable
              users={filtered as DBUser[]}
              onEditRole={setRoleUser}
            />
          ) : (
            <PortalStaffDataTable
              users={filtered as DBUser[]}
              onEditRole={setRoleUser}
            />
          )}

          <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
            <span>
              {isFiltering
                ? `${filtered.length} of ${pageCount} on this page`
                : `${Math.min(pageCount, total)} of ${total.toLocaleString("en-IN")} users`}
            </span>
          </div>

          {!isRequests && !isFiltering && total > pageCount ? (
            <Pagination
              total={total}
              page={page}
              basePath="/admin/users"
              extraParams={listParams}
            />
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
