import type { ReactNode } from "react";

interface TrendProps {
  label: string;
  positive?: boolean;
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  iconBg: string;
  trend: TrendProps;
}

export function StatCard({ label, value, icon, iconBg, trend }: StatCardProps) {
  return (
    <div className="flex flex-1 flex-col gap-3 rounded-[28px] border border-slate-100 bg-white p-4 shadow-[0_4px_16px_rgba(26,26,46,0.04)]">
      <div className="flex items-start justify-between">
        <div
          className="flex size-10 items-center justify-center rounded-2xl"
          style={{ background: iconBg }}
        >
          {icon}
        </div>
        <span
          className={[
            "rounded-full px-2.5 py-1 text-[11px] font-bold",
            trend.positive === false
              ? "bg-amber-50 text-amber-700"
              : trend.positive
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-500",
          ].join(" ")}
        >
          {trend.label}
        </span>
      </div>
      <div>
        <p className="text-[28px] font-extrabold leading-none tracking-tight text-slate-900">
          {value}
        </p>
        <p className="mt-1.5 text-[13px] font-semibold text-slate-500">{label}</p>
      </div>
    </div>
  );
}
