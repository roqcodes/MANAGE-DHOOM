import { Suspense, type ReactNode } from "react";

import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";

export function AdminRouteSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AdminPageSkeleton />}>{children}</Suspense>
  );
}
