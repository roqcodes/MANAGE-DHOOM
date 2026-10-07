/** Shared UI for route-level loading.tsx files — one place, reused across segments. */
export function GlobalLoadingFallback() {
  return (
    <div className="box-border flex min-h-[70dvh] w-full flex-1 flex-col items-center justify-center gap-3 px-6 py-8">
      <div
        className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-[#2563EB]"
        role="status"
        aria-label="Loading"
      />
      <p className="text-[13px] font-medium tracking-wide text-slate-500">
        Loading…
      </p>
    </div>
  );
}
