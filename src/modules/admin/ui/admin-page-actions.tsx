"use client";

import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Groups primary + secondary actions in page headers and detail toolbars. */
export function AdminPageActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2.5", className)}>{children}</div>
  );
}

/** High-priority page action — always show icon + label (e.g. Record payment, New invoice). */
export function AdminPrimaryAction({
  className,
  size = "page",
  ...props
}: ComponentProps<typeof Button>) {
  return <Button size={size} className={cn("rounded-full", className)} {...props} />;
}

/** Secondary page action — icon only with accessible name. */
export function AdminSecondaryIconAction({
  className,
  size = "page-icon",
  "aria-label": ariaLabel,
  title,
  ...props
}: ComponentProps<typeof Button>) {
  const accessibleName = ariaLabel ?? title;
  return (
    <Button
      size={size}
      variant="outline"
      className={className}
      aria-label={accessibleName}
      title={title ?? ariaLabel}
      {...props}
    />
  );
}
