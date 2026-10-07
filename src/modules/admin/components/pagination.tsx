"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { PAGE_SIZE } from "@/common/admin/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PaginationProps {
  total: number;
  page: number;
  basePath: string;
  extraParams?: Record<string, string>;
  listParams?: Record<string, string>;
  pageParam?: string;
  pageSize?: number;
  className?: string;
}

export function Pagination({
  total,
  page,
  basePath,
  extraParams = {},
  listParams,
  pageParam = "page",
  pageSize = PAGE_SIZE,
  className,
}: PaginationProps) {
  const router = useRouter();
  const totalPages = Math.ceil(total / pageSize);

  if (totalPages <= 1) return null;

  function buildUrl(p: number) {
    const params = new URLSearchParams({ ...extraParams, ...listParams, [pageParam]: String(p) });
    return `${basePath}?${params.toString()}`;
  }

  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border bg-card px-3 py-2",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {start}–{end}
        </span>{" "}
        of {total.toLocaleString()}
      </p>
      <div className="flex gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={page === 0}
          onClick={() => router.push(buildUrl(page - 1))}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={page >= totalPages - 1}
          onClick={() => router.push(buildUrl(page + 1))}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
