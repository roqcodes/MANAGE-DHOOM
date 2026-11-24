"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { AdminPageActionBar } from "@/modules/admin/ui/admin-page-actions";

/** Icon-only admin actions in identity header (stacked on the right). */
export function ErpPartyProfileInlineAdmin({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 flex-col items-end gap-1 sm:hidden", className)}>
      {children}
    </div>
  );
}

/** Profile header actions: labeled money actions, optional divider, icon admin actions. */
export function ErpPartyProfileToolbar({
  children,
  adminActions,
  className,
}: {
  children: ReactNode;
  adminActions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end",
        className,
      )}
    >
      <AdminPageActionBar
        className={cn(
          "grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end",
          "[&_button.rounded-full]:w-full sm:[&_button.rounded-full]:w-auto",
        )}
      >
        {children}
      </AdminPageActionBar>
      {adminActions ? (
        <>
          <span
            className="mx-0.5 hidden h-9 w-px shrink-0 bg-border sm:block"
            aria-hidden
          />
          <div className="hidden items-center gap-2 sm:flex sm:justify-end">
            {adminActions}
          </div>
        </>
      ) : null}
    </div>
  );
}