"use client";

import { Star } from "lucide-react";

import { AdminSecondaryIconAction } from "@/modules/admin/ui";
import { cn } from "@/lib/utils";

import { useReportFavorites } from "./report-favorites";

export function ReportFavoriteButton({
  slug,
  className,
  size = "page-icon",
}: {
  slug: string;
  className?: string;
  size?: "page-icon" | "sm" | "icon";
}) {
  const { isFavorite, toggle, toggling } = useReportFavorites();
  const active = isFavorite(slug);
  const label = active ? "Remove from favourites" : "Add to favourites";

  return (
    <AdminSecondaryIconAction
      type="button"
      size={size}
      disabled={toggling}
      className={cn(active && "text-amber-600 hover:text-amber-700 dark:text-amber-400", className)}
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(slug);
      }}
    >
      <Star className={cn("size-4", active && "fill-current")} />
    </AdminSecondaryIconAction>
  );
}
