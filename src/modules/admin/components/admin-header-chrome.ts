import { cn } from "@/lib/utils";

/** Shared height + surface for admin shell header controls. */
export const ADMIN_HEADER_CONTROL_HEIGHT = "h-10";

export const ADMIN_HEADER_SURFACE =
  "rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.04]";

export const ADMIN_HEADER_SURFACE_INTERACTIVE = cn(
  ADMIN_HEADER_SURFACE,
  "outline-none transition-all duration-200 ease-out",
  "hover:border-primary/30 hover:bg-white hover:shadow-md hover:shadow-primary/[0.07]",
  "focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15",
);

export const ADMIN_HEADER_FIELD = cn(
  ADMIN_HEADER_CONTROL_HEIGHT,
  ADMIN_HEADER_SURFACE_INTERACTIVE,
);

export const ADMIN_HEADER_ICON_SLOT =
  "flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500";

/** Sidebar toggle, refresh — same footprint as fields, icon-only. */
export const ADMIN_HEADER_ICON_BUTTON = cn(
  ADMIN_HEADER_CONTROL_HEIGHT,
  "flex size-10 shrink-0 items-center justify-center",
  ADMIN_HEADER_SURFACE_INTERACTIVE,
  "text-slate-500",
);

export function adminHeaderFieldClassName(extra?: string) {
  return cn(
    ADMIN_HEADER_FIELD,
    "flex min-w-0 items-center gap-2 px-2.5 text-sm",
    extra,
  );
}