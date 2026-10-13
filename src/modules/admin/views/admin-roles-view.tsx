"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronRight,
  KeyRound,
  Plus,
  RotateCcw,
  Save,
  Search,
  Shield,
  Trash2,
  X,
} from "lucide-react";

import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { useAdminSession } from "@/modules/admin/providers/admin-session-provider";
import {
  permissionGroups,
  permissionKeyForHref,
  permissionMatrixEntries,
  type RbacAccess,
} from "@/modules/rbac/lib/permission-catalog";
import type {
  RbacPermissionRow,
  RbacRoleRow,
} from "@/modules/rbac/services/rbac-admin.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type StoreRow = { id: string; name: string };

type RbacApiResponse = {
  roles: RbacRoleRow[];
  permissions?: RbacPermissionRow[];
  roleId?: string;
};

type RoleKindFilter = "all" | "preset" | "custom";
type AccessFilter = "all" | "read" | "write" | "none";

function permMap(
  rows: RbacPermissionRow[],
  storeId: string | null,
): Record<string, RbacAccess> {
  const map: Record<string, RbacAccess> = {};
  for (const row of rows) {
    const scoped = storeId ? row.store_id === storeId : !row.store_id;
    if (!scoped) continue;
    map[row.permission_key] = {
      read: row.can_read,
      write: row.can_write,
    };
  }
  return map;
}

function mergedPermMap(
  rows: RbacPermissionRow[],
  storeId: string | null,
): Record<string, RbacAccess> {
  if (!storeId) return permMap(rows, null);
  return { ...permMap(rows, null), ...permMap(rows, storeId) };
}

function matchesAccessFilter(access: RbacAccess, filter: AccessFilter): boolean {
  if (filter === "all") return true;
  if (filter === "read") return access.read;
  if (filter === "write") return access.write;
  return !access.read && !access.write;
}

function filterGroups({
  pageSearch,
  moduleFilter,
  accessFilter,
  localPerms,
}: {
  pageSearch: string;
  moduleFilter: string;
  accessFilter: AccessFilter;
  localPerms: Record<string, RbacAccess>;
}) {
  const q = pageSearch.trim().toLowerCase();
  const base = permissionGroups();

  return base
    .filter((g) => moduleFilter === "all" || g.label === moduleFilter)
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        const key = permissionKeyForHref(item.href);
        const access = localPerms[key] ?? { read: false, write: false };

        if (!matchesAccessFilter(access, accessFilter)) return false;
        if (!q) return true;

        return (
          item.name.toLowerCase().includes(q) ||
          g.label.toLowerCase().includes(q) ||
          key.toLowerCase().includes(q)
        );
      }),
    }))
    .filter((g) => g.items.length > 0);
}

function countAccess(localPerms: Record<string, RbacAccess>) {
  const entries = permissionMatrixEntries();
  let read = 0;
  let write = 0;
  for (const { key } of entries) {
    const a = localPerms[key] ?? { read: false, write: false };
    if (a.read) read += 1;
    if (a.write) write += 1;
  }
  return { read, write, total: entries.length };
}

export function AdminRolesView() {
  const profile = useAdminSession();
  const queryClient = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [localPerms, setLocalPerms] = useState<Record<string, RbacAccess>>({});
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scopeStoreId, setScopeStoreId] = useState<string | null>(null);
  const [roleSearch, setRoleSearch] = useState("");
  const [roleKindFilter, setRoleKindFilter] = useState<RoleKindFilter>("all");
  const [pageSearch, setPageSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [accessFilter, setAccessFilter] = useState<AccessFilter>("all");
  const [isPending, startTransition] = useTransition();

  const canManage = Boolean(profile?.rbac?.canManageRoles);

  const { data: storesData } = useQuery({
    queryKey: ["admin", "erp-context-stores"],
    queryFn: () => adminGet<{ stores: StoreRow[] }>("erp/context"),
    enabled: canManage,
  });
  const stores = storesData?.stores ?? [];

  const { data, isPending: loading, isError } = useQuery({
    queryKey: [...adminQueryKeys.rbac(selectedRoleId), scopeStoreId ?? "global"],
    queryFn: () =>
      adminGet<RbacApiResponse>(
        selectedRoleId ? `rbac?roleId=${encodeURIComponent(selectedRoleId)}` : "rbac",
      ),
    enabled: canManage,
  });

  const roles = data?.roles ?? [];
  const activeRole = roles.find((r) => r.id === selectedRoleId) ?? roles[0] ?? null;

  const moduleOptions = useMemo(
    () => permissionGroups().map((g) => g.label),
    [],
  );

  const filteredRoles = useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    return roles.filter((role) => {
      if (roleKindFilter === "preset" && role.kind === "custom") return false;
      if (roleKindFilter === "custom" && role.kind !== "custom") return false;
      if (!q) return true;
      return (
        role.name.toLowerCase().includes(q) ||
        role.slug.toLowerCase().includes(q) ||
        (role.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [roles, roleSearch, roleKindFilter]);

  const groups = useMemo(
    () =>
      filterGroups({
        pageSearch,
        moduleFilter,
        accessFilter,
        localPerms,
      }),
    [pageSearch, moduleFilter, accessFilter, localPerms],
  );

  const accessStats = useMemo(() => countAccess(localPerms), [localPerms]);

  const scopeStoreLabel =
    scopeStoreId == null
      ? "All stores (default)"
      : stores.find((s) => s.id === scopeStoreId)?.name ?? "Store";

  useEffect(() => {
    if (!selectedRoleId && roles[0]?.id) {
      setSelectedRoleId(roles[0].id);
    }
  }, [roles, selectedRoleId]);

  useEffect(() => {
    if (data?.permissions) {
      setLocalPerms(mergedPermMap(data.permissions, scopeStoreId));
      setDirty(false);
    }
  }, [data?.permissions, selectedRoleId, scopeStoreId]);

  function setPerm(key: string, patch: Partial<RbacAccess>) {
    setLocalPerms((prev) => {
      const cur = prev[key] ?? { read: false, write: false };
      const next = { ...cur, ...patch };
      if (patch.read === false) next.write = false;
      if (patch.write === true) next.read = true;
      return { ...prev, [key]: next };
    });
    setDirty(true);
  }

  function setManyPerms(
    keys: string[],
    patch: Partial<RbacAccess> | "clear",
  ) {
    setLocalPerms((prev) => {
      const next = { ...prev };
      for (const key of keys) {
        const cur = next[key] ?? { read: false, write: false };
        if (patch === "clear") {
          next[key] = { read: false, write: false };
        } else {
          const merged = { ...cur, ...patch };
          if (patch.read === false) merged.write = false;
          if (patch.write === true) merged.read = true;
          next[key] = merged;
        }
      }
      return next;
    });
    setDirty(true);
  }

  function handleDiscard() {
    if (data?.permissions) {
      setLocalPerms(mergedPermMap(data.permissions, scopeStoreId));
      setDirty(false);
      setError(null);
    }
  }

  function handleSaveAll() {
    if (!activeRole) return;
    startTransition(async () => {
      setError(null);
      try {
        const serverMap = data?.permissions
          ? mergedPermMap(data.permissions, scopeStoreId)
          : {};
        const keys = new Set([...Object.keys(serverMap), ...Object.keys(localPerms)]);
        for (const key of keys) {
          const next = localPerms[key] ?? { read: false, write: false };
          const prev = serverMap[key] ?? { read: false, write: false };
          if (next.read === prev.read && next.write === prev.write) continue;
          await adminPost("rbac/mutate", {
            action: "set_permission",
            roleId: activeRole.id,
            permissionKey: key,
            canRead: next.read,
            canWrite: next.write,
            storeId: scopeStoreId,
          });
        }
        setDirty(false);
        void queryClient.invalidateQueries({ queryKey: ["admin", "rbac"] });
        void queryClient.invalidateQueries({ queryKey: adminQueryKeys.session() });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  function handleCreateRole() {
    const name = draftName.trim();
    if (!name) return;
    startTransition(async () => {
      setError(null);
      try {
        const res = await adminPost<{ roleId: string }>("rbac/mutate", {
          action: "upsert_role",
          name,
          description: draftDesc,
        });
        setDraftName("");
        setDraftDesc("");
        setCreateOpen(false);
        setSelectedRoleId(res.roleId);
        setRoleKindFilter("custom");
        void queryClient.invalidateQueries({ queryKey: ["admin", "rbac"] });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create role.");
      }
    });
  }

  function handleDeleteRole() {
    if (!activeRole || activeRole.kind !== "custom") return;
    startTransition(async () => {
      setError(null);
      try {
        await adminPost("rbac/mutate", {
          action: "delete_role",
          roleId: activeRole.id,
        });
        setSelectedRoleId(null);
        void queryClient.invalidateQueries({ queryKey: ["admin", "rbac"] });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete role.");
      }
    });
  }

  if (!profile) {
    return (
      <AdminPageLayout>
        <AdminPageHeader title="Roles & access" description="Loading…" />
        <AdminTableBodySkeleton rows={6} />
      </AdminPageLayout>
    );
  }
  if (!canManage) {
    return (
      <AdminPageLayout>
        <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
          <Shield className="mx-auto size-10 text-muted-foreground/40" aria-hidden />
          <p className="mt-3 text-sm font-medium text-foreground">Restricted</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Only a super admin can manage roles and page permissions.
          </p>
        </div>
      </AdminPageLayout>
    );
  }
  if (loading && !data) {
    return (
      <AdminPageLayout>
        <AdminPageHeader
          title="Roles & access"
          description="Configure who can view and edit each ERP page."
          breadcrumb={[
            { label: "Team", href: "/admin/users" },
            { label: "Roles & access" },
          ]}
        />
        <AdminTableBodySkeleton rows={8} />
      </AdminPageLayout>
    );
  }
  if (isError) {
    return (
      <AdminPageLayout>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-8 text-sm text-destructive">
          Could not load roles. Apply the RBAC Supabase migrations, then refresh.
        </div>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout className="pb-24">
      <AdminPageHeader
        title="Roles & access"
        description="Configure who can view and edit each ERP page. Presets can be tuned; custom roles start from a blank matrix."
        breadcrumb={[
          { label: "Team", href: "/admin/users" },
          { label: "Roles & access" },
        ]}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreateOpen(true)}
              disabled={isPending}
            >
              <Plus className="size-4" />
              New role
            </Button>
            <Button
              size="sm"
              disabled={!dirty || isPending || !activeRole}
              onClick={handleSaveAll}
            >
              <Save className="size-4" />
              Save
            </Button>
          </>
        }
      />

      {error ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2.5 text-sm text-destructive"
        >
          <span>{error}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-destructive hover:text-destructive"
            aria-label="Dismiss error"
            onClick={() => setError(null)}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      <div className="grid min-h-[min(72vh,800px)] gap-4 lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)]">
        <aside className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <div className="space-y-3 border-b border-border p-3">
            <div className="flex items-center gap-2 px-0.5">
              <KeyRound className="size-4 text-muted-foreground" aria-hidden />
              <span className="text-sm font-semibold text-foreground">Roles</span>
              <Badge variant="secondary" className="ml-auto tabular-nums">
                {roles.length}
              </Badge>
            </div>
            <InputGroup className="h-9">
              <InputGroupAddon align="inline-start">
                <Search aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={roleSearch}
                onChange={(e) => setRoleSearch(e.target.value)}
                placeholder="Search roles…"
                aria-label="Search roles"
              />
            </InputGroup>
            <Tabs
              value={roleKindFilter}
              onValueChange={(v) => setRoleKindFilter(v as RoleKindFilter)}
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="preset">Presets</TabsTrigger>
                <TabsTrigger value="custom">Custom</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {filteredRoles.length === 0 ? (
              <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                No roles match your search.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {filteredRoles.map((role) => (
                  <li key={role.id}>
                    <RolePickButton
                      role={role}
                      active={activeRole?.id === role.id}
                      onPick={() => setSelectedRoleId(role.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col gap-3">
          {activeRole ? (
            <>
              <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold tracking-tight">
                        {activeRole.name}
                      </h2>
                      <Badge variant={activeRole.kind === "custom" ? "default" : "secondary"}>
                        {activeRole.kind === "custom" ? "Custom" : "Preset"}
                      </Badge>
                      {scopeStoreId ? (
                        <Badge variant="outline" className="font-normal">
                          Store override
                        </Badge>
                      ) : null}
                    </div>
                    {activeRole.description ? (
                      <p className="max-w-prose text-sm text-muted-foreground">
                        {activeRole.description}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      <span className="tabular-nums font-medium text-foreground">
                        {accessStats.read}
                      </span>{" "}
                      read ·{" "}
                      <span className="tabular-nums font-medium text-foreground">
                        {accessStats.write}
                      </span>{" "}
                      write · {accessStats.total} pages
                    </p>
                  </div>
                  {activeRole.kind === "custom" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={isPending}
                      onClick={handleDeleteRole}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  ) : null}
                </div>

                <Separator className="my-4" />

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <FilterField label="Search pages">
                    <InputGroup className="h-9">
                      <InputGroupAddon align="inline-start">
                        <Search aria-hidden />
                      </InputGroupAddon>
                      <InputGroupInput
                        type="search"
                        value={pageSearch}
                        onChange={(e) => setPageSearch(e.target.value)}
                        placeholder="Name or module…"
                        aria-label="Search pages"
                      />
                    </InputGroup>
                  </FilterField>

                  <FilterField label="Module">
                    <Select
                      value={moduleFilter}
                      onValueChange={(v) => setModuleFilter(v ?? "all")}
                    >
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue placeholder="All modules" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All modules</SelectItem>
                        {moduleOptions.map((label) => (
                          <SelectItem key={label} value={label}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterField>

                  <FilterField label="Access level">
                    <Select
                      value={accessFilter}
                      onValueChange={(v) => setAccessFilter(v as AccessFilter)}
                    >
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue placeholder="Any access" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Any access</SelectItem>
                        <SelectItem value="read">Has read</SelectItem>
                        <SelectItem value="write">Has write</SelectItem>
                        <SelectItem value="none">No access</SelectItem>
                      </SelectContent>
                    </Select>
                  </FilterField>

                  {stores.length > 0 ? (
                    <FilterField label="Store scope">
                      <Select
                        value={scopeStoreId ?? "__global__"}
                        onValueChange={(v) =>
                          setScopeStoreId(v === "__global__" ? null : v)
                        }
                      >
                        <SelectTrigger className="h-9 w-full">
                          <span className="truncate">{scopeStoreLabel}</span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__global__">
                            All stores (default)
                          </SelectItem>
                          {stores.map((store) => (
                            <SelectItem key={store.id} value={store.id}>
                              {store.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FilterField>
                  ) : null}
                </div>

                {(pageSearch || moduleFilter !== "all" || accessFilter !== "all") && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-3 h-8 text-muted-foreground"
                    onClick={() => {
                      setPageSearch("");
                      setModuleFilter("all");
                      setAccessFilter("all");
                    }}
                  >
                    Clear page filters
                  </Button>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs">
                <div className="sticky top-0 z-10 grid grid-cols-[1fr_4.5rem_4.5rem] border-b border-border bg-muted/30 px-4 py-2.5 text-xs font-medium text-muted-foreground backdrop-blur-sm">
                  <span>Page</span>
                  <span className="text-center">Read</span>
                  <span className="text-center">Write</span>
                </div>

                <div className="max-h-[min(58vh,640px)] overflow-y-auto">
                  {groups.length === 0 ? (
                    <p className="px-4 py-16 text-center text-sm text-muted-foreground">
                      No pages match the current filters.
                    </p>
                  ) : (
                    groups.map((group) => {
                      const keys = group.items.map((item) =>
                        permissionKeyForHref(item.href),
                      );
                      return (
                        <div
                          key={group.label}
                          className="border-b border-border last:border-0"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/20 px-4 py-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {group.label}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                disabled={isPending}
                                onClick={() => setManyPerms(keys, { read: true, write: false })}
                              >
                                All read
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                disabled={isPending}
                                onClick={() =>
                                  setManyPerms(keys, { read: true, write: true })
                                }
                              >
                                All write
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-muted-foreground"
                                disabled={isPending}
                                onClick={() => setManyPerms(keys, "clear")}
                              >
                                Clear
                              </Button>
                            </div>
                          </div>
                          <ul>
                            {group.items.map((item) => {
                              const key = permissionKeyForHref(item.href);
                              const access = localPerms[key] ?? {
                                read: false,
                                write: false,
                              };
                              const locked =
                                activeRole.slug === "super_admin" &&
                                key === "page.roles";
                              return (
                                <PermissionRow
                                  key={item.href}
                                  name={item.name}
                                  access={access}
                                  locked={locked}
                                  disabled={isPending}
                                  onRead={(read) => setPerm(key, { read })}
                                  onWrite={(write) => setPerm(key, { write })}
                                />
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-20 text-center">
              <Shield className="size-10 text-muted-foreground/35" aria-hidden />
              <p className="mt-3 text-sm font-medium">Select a role</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Choose a preset or custom role on the left to edit page permissions.
              </p>
            </div>
          )}
        </section>
      </div>

      {dirty && activeRole ? (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-md sm:px-6"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto flex max-w-[min(100%,90rem)] flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Unsaved changes for{" "}
              <span className="font-medium text-foreground">{activeRole.name}</span>
              {scopeStoreId ? ` (${scopeStoreLabel})` : ""}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={handleDiscard}
              >
                <RotateCcw className="size-4" />
                Discard
              </Button>
              <Button type="button" size="sm" disabled={isPending} onClick={handleSaveAll}>
                <Save className="size-4" />
                Save permissions
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create custom role</DialogTitle>
            <DialogDescription>
              New roles start with no page access until you enable read/write in the
              matrix.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="rbac-role-name">Role name</Label>
              <Input
                id="rbac-role-name"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="e.g. Warehouse lead"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rbac-role-desc">Description</Label>
              <Input
                id="rbac-role-desc"
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isPending || !draftName.trim()}
              onClick={handleCreateRole}
            >
              <Check className="size-4" />
              Create role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPageLayout>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function RolePickButton({
  role,
  active,
  onPick,
}: {
  role: RbacRoleRow;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary/10 text-foreground ring-1 ring-primary/20"
          : "hover:bg-muted/70",
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md border",
          active
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border bg-muted/40 text-muted-foreground",
        )}
      >
        <Shield className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{role.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {role.kind === "custom" ? "Custom" : "Preset"} · {role.slug}
        </span>
      </span>
      {active ? (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : null}
    </button>
  );
}

function PermissionRow({
  name,
  access,
  locked,
  disabled,
  onRead,
  onWrite,
}: {
  name: string;
  access: RbacAccess;
  locked: boolean;
  disabled: boolean;
  onRead: (read: boolean) => void;
  onWrite: (write: boolean) => void;
}) {
  return (
    <li
      className={cn(
        "grid grid-cols-[1fr_4.5rem_4.5rem] items-center border-t border-border/50 px-4 py-2.5 transition-colors",
        access.read && "bg-muted/15",
      )}
    >
      <span className="truncate text-sm text-foreground">{name}</span>
      <div className="flex justify-center">
        <Checkbox
          checked={access.read}
          disabled={locked || disabled}
          aria-label={`Read access for ${name}`}
          onCheckedChange={(v) => onRead(v === true)}
        />
      </div>
      <div className="flex justify-center">
        <Checkbox
          checked={access.write}
          disabled={locked || !access.read || disabled}
          aria-label={`Write access for ${name}`}
          onCheckedChange={(v) => onWrite(v === true)}
        />
      </div>
    </li>
  );
}
