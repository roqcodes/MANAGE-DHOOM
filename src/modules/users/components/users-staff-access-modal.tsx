"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { DBUser } from "@/common/admin/types";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { useAdminSession } from "@/modules/admin/providers/admin-session-provider";
import type { RbacRoleRow } from "@/modules/rbac/services/rbac-admin.service";
import {
  Modal,
  SecondaryBtn,
} from "@/modules/admin/components/modal";
import {
  validateBeforeFormSave,
  formErrorsAdapter,

  FormValidationScope,
  clearFormSubmitFeedback,
  useFormFieldValidation,
} from "@/modules/admin/ui";
import { UserRoleBadge } from "@/modules/users/components/users-ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

export function UsersStaffAccessModal(props: {
  user: DBUser;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  return (
    <Modal title="Assign role & store access" onClose={props.onClose} size="md">
      <FormValidationScope resetKey={props.user.id}>
        <UsersStaffAccessModalForm {...props} />
      </FormValidationScope>
    </Modal>
  );
}

function UsersStaffAccessModalForm({
  user,
  onClose,
  onUpdated,
}: {
  user: DBUser;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const profile = useAdminSession();
  const fieldValidation = useFormFieldValidation();
  const queryClient = useQueryClient();
  const [roleId, setRoleId] = useState("");
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [defaultStoreId, setDefaultStoreId] = useState<string | null>(null);
  const [error, setError] = useState<string | string[] | null>(null);
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

  useEffect(() => {
    if (!roles.length) return;
    const roleKey = user.role?.toLowerCase() ?? "";
    const match =
      roles.find((r) => r.slug === roleKey) ??
      roles.find((r) => r.portal_role === roleKey);
    if (match) setRoleId(match.id);
  }, [roles, user.role]);

  useEffect(() => {
    if (!profile?.rbac?.canManageRoles) return;
    void adminGet<{ storeIds: string[] }>(
      `rbac?userId=${encodeURIComponent(user.id)}`,
    ).then((res) => {
      if (res.storeIds?.length) {
        setStoreIds(res.storeIds);
        setDefaultStoreId(res.storeIds[0] ?? null);
      }
    });
  }, [user.id, profile?.rbac?.canManageRoles]);

  function toggleStore(id: string) {
    setStoreIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
    if (defaultStoreId === id) setDefaultStoreId(null);
  }

  function handleSave() {
    if (
      !validateBeforeFormSave(
        [{ key: "roleId", ok: Boolean(roleId), message: "Role is required." }],
        {
          markFieldValidationFailed: fieldValidation.markFieldValidationFailed,
          clearFieldValidation: fieldValidation.clearFieldValidation,
          setFormErrors: formErrorsAdapter(setError),
        },
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        await adminPost("rbac/mutate", {
          action: "assign_user",
          userId: user.id,
          roleId,
          storeIds: storeIds.length > 0 ? storeIds : null,
          defaultStoreId,
        });
        void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
        void queryClient.invalidateQueries({ queryKey: adminQueryKeys.session() });
        clearFormSubmitFeedback({
          setFormErrors: formErrorsAdapter(setError),
          clearFieldValidation: fieldValidation.clearFieldValidation,
        });
        onUpdated?.();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not assign access.");
      }
    });
  }

  return (
      <div className="space-y-4">
        <div className="rounded-lg bg-muted px-3 py-2 text-sm">
          <p className="font-medium">{user.name ?? "Unknown user"}</p>
          <p className="text-muted-foreground">{user.email ?? "No email"}</p>
          <div className="mt-2">
            <UserRoleBadge role={user.role} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Role</Label>
          <Select
            value={selectedRole ? roleId : null}
            onValueChange={(value) => setRoleId(value ?? "")}
          >
            <SelectTrigger
              className="w-full min-w-0"
              aria-invalid={fieldValidation.isFieldInvalid("roleId")}
            >
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
            <Label>Store access</Label>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
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
          <Button disabled={isPending || !roleId} onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>
  );
}
