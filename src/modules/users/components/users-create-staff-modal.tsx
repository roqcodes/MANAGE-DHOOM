"use client";

import { useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { useAdminSession } from "@/modules/admin/providers/admin-session-provider";
import type { RbacRoleRow } from "@/modules/rbac/services/rbac-admin.service";
import { Modal, SecondaryBtn } from "@/modules/admin/components/modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";

type StoreRow = { id: string; name: string };

export function UsersCreateStaffModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: () => void;
}) {
  const profile = useAdminSession();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [defaultStoreId, setDefaultStoreId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { data: rolesData } = useQuery({
    queryKey: adminQueryKeys.rbac("assign"),
    queryFn: () => adminGet<{ roles: RbacRoleRow[] }>("rbac"),
    enabled: Boolean(profile?.rbac?.canManageRoles),
  });

  const { data: storesData } = useQuery({
    queryKey: ["admin", "erp-context-stores"],
    queryFn: () => adminGet<{ stores: StoreRow[] }>("erp/context"),
    enabled: Boolean(profile?.rbac?.canManageRoles),
  });

  const roles = rolesData?.roles ?? [];
  const stores = storesData?.stores ?? [];

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === roleId) ?? null,
    [roles, roleId],
  );

  function toggleStore(id: string) {
    setStoreIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
    if (defaultStoreId === id) setDefaultStoreId(null);
  }

  function handleCreate() {
    startTransition(async () => {
      setError(null);
      try {
        await adminPost("users", {
          action: "create_staff",
          name,
          email,
          phone: phone.trim() || undefined,
          password,
          roleId,
          storeIds: storeIds.length > 0 ? storeIds : undefined,
          defaultStoreId,
        });
        void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
        onCreated?.();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create user.");
      }
    });
  }

  const canSubmit =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    Boolean(roleId);

  return (
    <Modal title="Create staff user" onClose={onClose} size="md">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Creates a verified portal account with email and password. The user can sign in
          immediately.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="create-staff-name">Full name</Label>
            <Input
              id="create-staff-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Priya Sharma"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-staff-email">Email</Label>
            <Input
              id="create-staff-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              placeholder="staff@company.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-staff-phone">Phone (optional)</Label>
            <Input
              id="create-staff-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91…"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="create-staff-password">Password</Label>
            <Input
              id="create-staff-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Role</Label>
          <Select value={selectedRole ? roleId : null} onValueChange={(v) => setRoleId(v ?? "")}>
            <SelectTrigger className="w-full min-w-0">
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-left",
                  !selectedRole && "text-muted-foreground",
                )}
              >
                {selectedRole?.name ?? "Select role"}
              </span>
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role.id} value={role.id} label={role.name}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {stores.length > 0 ? (
          <div className="space-y-2">
            <Label>Store access (optional)</Label>
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
              {stores.map((store) => (
                <label
                  key={store.id}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={storeIds.includes(store.id)}
                    onCheckedChange={() => toggleStore(store.id)}
                  />
                  <span>{store.name}</span>
                  {storeIds.includes(store.id) ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={defaultStoreId === store.id ? "default" : "outline"}
                      className="ml-auto h-7 text-xs"
                      onClick={(e) => {
                        e.preventDefault();
                        setDefaultStoreId(store.id);
                      }}
                    >
                      Default
                    </Button>
                  ) : null}
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <ErrorsFeedbackBridge errors={error} />

        <div className="flex justify-end gap-2">
          <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
          <Button disabled={isPending || !canSubmit} onClick={handleCreate}>
            Create user
          </Button>
        </div>
      </div>
    </Modal>
  );
}
