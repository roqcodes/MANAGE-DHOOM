/**
 * Shared admin layout classes — tuned for desktop ERP density at 100% browser zoom.
 * Sidebar (~232px) leaves more room for content at 100% browser zoom.
 */

export const adminPageClass =
  "mx-auto w-full max-w-[1200px] px-3 py-3 sm:px-4 sm:py-4";

export const adminPageErrorClass =
  "mx-auto w-full max-w-[1200px] px-3 py-6 sm:px-4";

export const adminPageStackClass =
  "mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-3 py-3 sm:px-4 sm:py-4";

export const adminPageSpaceClass =
  "mx-auto w-full max-w-[1200px] space-y-4 px-3 py-3 sm:px-4 sm:py-4";

export const adminPageNarrowClass =
  "mx-auto w-full max-w-5xl px-3 py-4 sm:px-5 sm:py-4";

export const adminPageWideClass =
  "mx-auto w-full max-w-6xl px-5 py-6 sm:px-6";

export const adminPanelStackClass = "space-y-4 lg:space-y-5";

/** 4-up KPI row from md breakpoint (fits beside expanded sidebar). */
export const adminStatGridClass = "grid grid-cols-2 gap-2.5 md:grid-cols-4";

export const adminStatGrid3Class = "grid grid-cols-2 gap-2.5 md:grid-cols-3";

export const adminStatGrid3XlClass =
  "grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4";

export const adminCardShellClass =
  "rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_8px_24px_-12px_rgba(15,23,42,0.12)]";
