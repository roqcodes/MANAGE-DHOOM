import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** True on first fetch before any cached/placeholder payload exists. */
export function isInitialAdminLoad(loading: boolean, hasPayload: boolean): boolean {
  return loading && !hasPayload;
}

/** Inline metric value placeholder (catalog KPI bars). */
export function AdminMetricValueSkeleton({ className }: { className?: string }) {
  return <Skeleton className={className ?? "h-7 w-20"} />;
}

/** KPI / stat cards grid — labels are static; values skeleton only. */
export function AdminKpiGridSkeleton({
  count = 4,
  labels,
}: {
  count?: number;
  labels?: string[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <p className="text-sm text-muted-foreground">
              {labels?.[i] ?? <Skeleton className="h-4 w-24" />}
            </p>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-7 w-28" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Detail page body only (pair with AdminPageHeader for instant chrome). */
export function AdminDetailBodySkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
      </div>
      <AdminTableBodySkeleton rows={6} />
    </div>
  );
}

/** @deprecated Prefer page chrome + AdminDataTableRowsSkeleton / AdminKpiGridSkeleton. */
export function AdminPageSkeleton() {
  return (
    <div className="space-y-3 px-3 py-4 sm:px-4 sm:py-5">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="mt-5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-[24px]" />
    </div>
  );
}

/** ERP document / entity detail pages (header, summary cards, line table). */
export function AdminDetailSkeleton() {
  return (
    <div className="space-y-5 px-3 py-4 sm:px-4 sm:py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
      </div>
      <AdminTableBodySkeleton rows={6} />
    </div>
  );
}

/** Modal / full-page ERP forms (field grid, line editor, totals sidebar). */
export function AdminFormSkeleton() {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-9 sm:col-span-2" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 max-w-md" />
          <AdminTableBodySkeleton rows={4} />
        </div>
      </div>
      <Skeleton className="h-56 w-full shrink-0 rounded-xl lg:w-64" />
    </div>
  );
}

/** Compact block for dialogs, popovers, and inline panels. */
export function AdminPanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 py-1">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={i % 2 === 0 ? "h-4 w-full" : "h-4 w-4/5"} />
      ))}
    </div>
  );
}

/** Table body placeholder (list rows, reports, statements). */
export function AdminTableBodySkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 rounded-xl border border-border/60 p-3">
      <Skeleton className="mb-3 h-9 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

/** Print preview / document load placeholder. */
export function AdminPrintSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="flex justify-between">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-8 w-32" />
      </div>
      <Skeleton className="h-4 w-2/3 max-w-md" />
      <Skeleton className="h-4 w-1/2 max-w-xs" />
      <AdminTableBodySkeleton rows={8} />
      <div className="flex justify-end">
        <Skeleton className="h-16 w-48" />
      </div>
    </div>
  );
}
