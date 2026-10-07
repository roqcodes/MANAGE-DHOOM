import type { ReactNode } from "react";

export function EmptyState({
  icon,
  message,
}: {
  icon: ReactNode;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 py-14 text-center">
      <div className="text-slate-200">{icon}</div>
      <p className="text-sm font-semibold text-slate-400">{message}</p>
    </div>
  );
}

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-[0_4px_16px_rgba(26,26,46,0.04)]">
      {children}
    </div>
  );
}
