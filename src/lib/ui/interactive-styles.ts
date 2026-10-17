/** Shared hover/focus for text links (tables, inline copy, breadcrumbs). */
export const INTERACTIVE_LINK_CLASS =
  "rounded-sm underline-offset-4 transition-all duration-200 ease-out hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2";

/** Default table / entity name links (foreground → primary on hover). */
export const INTERACTIVE_FOREGROUND_LINK_CLASS =
  "font-medium text-foreground underline-offset-4 transition-all duration-200 ease-out hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2";

/** Already primary-colored links. */
export const INTERACTIVE_PRIMARY_LINK_CLASS =
  "text-primary underline-offset-4 transition-all duration-200 ease-out hover:text-primary/85 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2";

export const INTERACTIVE_MOTION_REDUCED =
  "motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100";

/** Header CREATE — primary solid CTA. */
export const INTERACTIVE_CTA_SOLID_HOVER =
  "shadow-sm shadow-primary/20 transition-all duration-200 ease-out hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

/** Solid buttons — same lift as CREATE. */
export const INTERACTIVE_BUTTON_SOLID_HOVER =
  `${INTERACTIVE_CTA_SOLID_HOVER} hover:-translate-y-px active:translate-y-0 motion-reduce:hover:translate-y-0`;

export const INTERACTIVE_BUTTON_OUTLINE_HOVER =
  "shadow-xs shadow-slate-900/[0.03] transition-all duration-200 ease-out hover:-translate-y-px hover:border-primary/30 hover:bg-white hover:text-foreground hover:shadow-md hover:shadow-primary/[0.08] active:translate-y-0 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100";

export const INTERACTIVE_BUTTON_GHOST_HOVER =
  "transition-all duration-200 ease-out hover:bg-slate-100 hover:text-foreground hover:shadow-sm hover:shadow-slate-900/5 hover:ring-1 hover:ring-slate-200/80 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

/** Header icon controls (sidebar toggle, refresh, recent activity). */
export const INTERACTIVE_CHROME_ICON_BUTTON =
  "transition-all duration-200 ease-out hover:bg-white hover:text-slate-900 hover:shadow-md hover:shadow-slate-900/8 hover:ring-1 hover:ring-slate-200/80 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

/** Sidebar nav links / section triggers (inactive). */
export const INTERACTIVE_SIDEBAR_NAV_INACTIVE_HOVER =
  "transition-colors duration-150 ease-out hover:bg-slate-100/90 hover:text-slate-900";
