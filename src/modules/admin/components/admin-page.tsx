import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  adminPageClass,
  adminPageErrorClass,
  adminPageNarrowClass,
  adminPageSpaceClass,
  adminPageStackClass,
  adminPageWideClass,
} from "@/modules/admin/lib/admin-layout";

type AdminPageVariant =
  | "default"
  | "stack"
  | "space"
  | "error"
  | "narrow"
  | "wide";

const VARIANT_CLASS: Record<AdminPageVariant, string> = {
  default: adminPageClass,
  stack: adminPageStackClass,
  space: adminPageSpaceClass,
  error: adminPageErrorClass,
  narrow: adminPageNarrowClass,
  wide: adminPageWideClass,
};

export function AdminPage({
  children,
  variant = "default",
  className,
}: {
  children: ReactNode;
  variant?: AdminPageVariant;
  className?: string;
}) {
  return <div className={cn(VARIANT_CLASS[variant], className)}>{children}</div>;
}
