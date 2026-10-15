import { MANAGE_APP_NAME } from "@/modules/brand/lib/brand";
import { cn } from "@/lib/utils";

type AppLoadingStateProps = {
  label?: string;
  className?: string;
  /** Full viewport center vs inline section */
  variant?: "page" | "section";
};

export function AppLoadingState({
  label = "Loading",
  className,
  variant = "page",
}: AppLoadingStateProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-4 px-6 text-center",
        variant === "page" ? "min-h-[70dvh] py-8" : "py-12",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="relative flex size-12 items-center justify-center">
        <div
          className="absolute inset-0 animate-spin rounded-full border-2 border-slate-200 border-t-[#EB205F]"
          aria-hidden
        />
        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
          {MANAGE_APP_NAME.split(" ")[0]}
        </span>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-muted-foreground">Please wait a moment…</p>
      </div>
    </div>
  );
}
