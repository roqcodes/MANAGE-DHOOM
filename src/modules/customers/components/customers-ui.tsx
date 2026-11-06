"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { AdminUser } from "@/common/admin/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

function customerInitials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const CUSTOMER_AVATAR_SIZE: Record<"sm" | "md" | "lg", string> = {
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-11 text-sm",
};

export function CustomerAvatar({
  name,
  avatarUrl,
  size = "md",
  className,
  enableHoverPreview = true,
}: {
  name?: string | null;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** When true and `avatarUrl` is set, hover shows a larger preview (e.g. vendor logo in search). */
  enableHoverPreview?: boolean;
}) {
  const url = avatarUrl?.trim();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoverPreview, setHoverPreview] = useState(false);
  const [previewBox, setPreviewBox] = useState<{
    top: number;
    left: number;
    maxWidth: number;
  } | null>(null);
  const showLargePreview = Boolean(enableHoverPreview && url && hoverPreview);

  const label = (name ?? "").trim() || "Profile photo";

  useLayoutEffect(() => {
    if (!showLargePreview) {
      setPreviewBox(null);
      return;
    }

    function updatePosition() {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const maxWidth = Math.min(352, Math.max(120, window.innerWidth - 16));
      setPreviewBox({
        top: r.bottom - 4,
        left: r.left + r.width / 2,
        maxWidth,
      });
    }

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [showLargePreview]);

  useEffect(
    () => () => {
      if (closeTimerRef.current != null) {
        clearTimeout(closeTimerRef.current);
      }
    },
    [],
  );

  function cancelScheduledClose() {
    if (closeTimerRef.current != null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function openPreview() {
    cancelScheduledClose();
    if (enableHoverPreview && url) setHoverPreview(true);
  }

  function scheduleClosePreview() {
    cancelScheduledClose();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setHoverPreview(false);
    }, 120);
  }

  const previewNode =
    showLargePreview && previewBox && typeof document !== "undefined" ? (
      createPortal(
        <span
          className="fixed w-max rounded-xl border border-border bg-background p-1.5 shadow-xl ring-1 ring-foreground/10"
          style={{
            top: previewBox.top,
            left: previewBox.left,
            transform: "translateX(-50%)",
            zIndex: 9999,
            maxWidth: previewBox.maxWidth,
          }}
          role="img"
          aria-label={`${label} — larger preview`}
          onMouseEnter={openPreview}
          onMouseLeave={scheduleClosePreview}
        >
          <img
            src={url}
            alt=""
            className="mx-auto max-h-64 w-auto max-w-full object-contain"
            draggable={false}
          />
        </span>,
        document.body,
      )
    ) : null;

  return (
    <span
      ref={anchorRef}
      className={cn("relative inline-flex flex-col items-center", className)}
      onMouseEnter={openPreview}
      onMouseLeave={scheduleClosePreview}
    >
      <Avatar className={cn(CUSTOMER_AVATAR_SIZE[size])}>
        {url ? <AvatarImage src={url} alt="" className="object-cover" /> : null}
        <AvatarFallback className="bg-primary/10 font-semibold text-primary">
          {customerInitials(name)}
        </AvatarFallback>
      </Avatar>
      {previewNode}
    </span>
  );
}

export type CustomerStatusFilter = "all" | "active" | "blocked";

export const CUSTOMER_STATUS_FILTERS: {
  id: CustomerStatusFilter;
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "blocked", label: "Blocked" },
];

export function formatCustomerId(user: AdminUser) {
  if (user.customer_number?.trim()) return user.customer_number;
  const shortId = user.id.split("-")[0]?.slice(0, 4).toUpperCase() ?? "0000";
  return `CUS-${shortId}`;
}

export function formatCreditLimit(limit: number | null | undefined) {
  if (limit == null || limit <= 0) return "No credit limit";
  return formatCurrencyAmount(limit);
}

export function isCustomerBlocked(user: AdminUser) {
  return user.is_verified === false;
}

export function matchesCustomerStatusFilter(
  user: AdminUser,
  filter: CustomerStatusFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "active":
      return user.is_verified !== false;
    case "blocked":
      return user.is_verified === false;
    default:
      return true;
  }
}

export function CustomerStatusBadge({ user }: { user: AdminUser }) {
  const blocked = isCustomerBlocked(user);

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        blocked
          ? "bg-rose-100 text-rose-800"
          : "bg-emerald-100 text-emerald-800",
      )}
    >
      {blocked ? "Blocked" : "Active"}
    </span>
  );
}
