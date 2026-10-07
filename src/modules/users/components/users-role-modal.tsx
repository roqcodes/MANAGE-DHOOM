"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";

import type { DBUser } from "@/common/admin/types";
import { UserRole } from "@/common/auth/types";
import { updateUserRoleAction } from "@/modules/admin/actions/admin-users.actions";
import {
  Modal,
  SecondaryBtn,
} from "@/modules/admin/components/modal";
import { UserRoleBadge } from "@/modules/users/components/users-ui";

const ROLE_OPTIONS: readonly string[] = [
  UserRole.Admin,
  UserRole.Vendor,
  UserRole.Delivery,
];

export function UsersRoleModal({
  user,
  title = "Change role",
  description,
  onClose,
  onUpdated,
}: {
  user: DBUser;
  title?: string;
  description?: string;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSelect(newRole: string) {
    startTransition(async () => {
      setError(null);
      try {
        await updateUserRoleAction(user.id, newRole);
        void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
        onUpdated?.();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update role.");
      }
    });
  }

  return (
    <Modal title={title} onClose={onClose} size="sm">
      <div className="space-y-4">
        <div className="rounded-lg bg-muted px-3 py-2 text-sm">
          <p className="font-medium">{user.name ?? "Unknown user"}</p>
          <p className="text-muted-foreground">{user.email ?? "No email"}</p>
          {description ? (
            <p className="mt-2 text-xs text-muted-foreground">{description}</p>
          ) : null}
          {error ? (
            <p className="mt-2 whitespace-pre-line text-xs font-medium text-destructive">
              {error}
            </p>
          ) : null}
          <div className="mt-2">
            <UserRoleBadge role={user.role} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {ROLE_OPTIONS.map((role) => (
            <button
              key={role}
              type="button"
              disabled={isPending}
              onClick={() => handleSelect(role)}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-left text-sm font-medium transition hover:bg-muted/60 disabled:opacity-50"
            >
              <span className="capitalize">{role}</span>
              {user.role === role ? <Check className="size-4 text-primary" /> : null}
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
        </div>
      </div>
    </Modal>
  );
}
