"use client";

/**
 * Backward-compatible re-exports. Prefer `@/modules/admin/ui` for new pages.
 */
export {
  AdminPageLayout as SalesPageLayout,
  AdminPageHeader as SalesPageHeader,
  AdminListCard as SalesListCard,
  type AdminFilterOption as SalesFilterOption,
} from "@/modules/admin/ui";

export { AdminPageSkeleton as SalesLoadingState } from "@/modules/admin/components/admin-page-skeleton";
