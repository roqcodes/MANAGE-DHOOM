"use client";

import { usePathname } from "next/navigation";

import { AdminDateRangePicker } from "@/modules/admin/ui/admin-date-range-picker";
import { useAdminDateRangeContext } from "@/modules/admin/providers/admin-date-range-provider";
import { cn } from "@/lib/utils";

/** Routes where the global header date filter is hidden (forms, print, auth). */
function headerDateHidden(pathname: string): boolean {
  if (!pathname.startsWith("/admin")) return true;
  if (pathname.includes("/print")) return true;
  return false;
}

export function AdminHeaderDateRange({ className }: { className?: string }) {
  const pathname = usePathname();
  const { value, setValue } = useAdminDateRangeContext();

  if (headerDateHidden(pathname)) return null;

  return (
    <AdminDateRangePicker
      variant="header"
      value={value}
      onChange={setValue}
      className={cn("shrink-0", className)}
      align="end"
    />
  );
}
