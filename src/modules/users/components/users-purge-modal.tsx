"use client";

import { useEffect, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

import type { DBUser } from "@/common/admin/types";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { formatPortalUserPurgeReason } from "@/modules/users/lib/portal-user-purge-messages";
import { Modal, SecondaryBtn } from "@/modules/admin/components/modal";
import { Button } from "@/components/ui/button";
import { formatUserId } from "@/modules/users/components/users-ui";

export function UsersPurgeModal({
  user,
  onClose,
  onPurged,
}: {
  user: DBUser;
  onClose: () => void;
  onPurged?: () => void;
}) {
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setEligible(null);
    void adminGet<{ eligible: boolean; reason: string | null }>(
      `users?purgeEligibility=${encodeURIComponent(user.id)}`,
    )
      .then((res) => {
        if (cancelled) return;
        setEligible(res.eligible);
        setReason(res.reason);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Could not check eligibility.");
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  function handlePurge() {
    startTransition(async () => {
      setActionError(null);
      try {
        await adminPost("users", { action: "purge", userId: user.id });
        void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
        onPurged?.();
        onClose();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Could not delete user.");
      }
    });
  }

  return (
    <Modal title="Delete user permanently" onClose={onClose} size="md">
      <div className="space-y-4">
        <div className="rounded-lg bg-muted px-3 py-2 text-sm">
          <p className="font-medium">{user.name ?? "Unknown user"}</p>
          <p className="text-muted-foreground">{user.email ?? "No email"}</p>
          <p className="text-xs text-muted-foreground">{formatUserId(user)}</p>
        </div>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : eligible === null ? (
          <p className="text-sm text-muted-foreground">Checking activity…</p>
        ) : eligible ? (
          <p className="text-sm text-muted-foreground">
            No audit logs or business activity were found for this account. This
            removes their profile and login — it cannot be undone.
          </p>
        ) : (
          <div className="flex gap-2 rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-950">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden />
            <p>{formatPortalUserPurgeReason(reason)}</p>
          </div>
        )}

        {actionError ? (
          <p className="text-sm font-medium text-destructive">{actionError}</p>
        ) : null}

        <div className="flex justify-end gap-2">
          <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
          <Button
            variant="destructive"
            disabled={isPending || eligible !== true}
            onClick={handlePurge}
          >
            Delete permanently
          </Button>
        </div>
      </div>
    </Modal>
  );
}
