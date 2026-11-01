"use client";

import Link from "next/link";
import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

import { useReportFavorites } from "./report-favorites";

export function ReportFavoritesBar({ className }: { className?: string }) {
  const { reports, loading } = useReportFavorites();

  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-muted/30 px-3 py-3 sm:px-4",
        className,
      )}
      aria-label="Favourite reports"
    >
      <div className="mb-2 flex items-center gap-2">
        <Star className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">Favourites</h2>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading favourites…</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No favourites yet. Tap the star on any report below or on a report page to pin it here.
        </p>
      ) : (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:thin]">
          {reports.map((report) => (
            <Link
              key={report.slug}
              href={`/admin/erp/reports/${report.slug}`}
              className="inline-flex max-w-[16rem] shrink-0 items-center rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
              title={report.description}
            >
              <span className="truncate">{report.title}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
