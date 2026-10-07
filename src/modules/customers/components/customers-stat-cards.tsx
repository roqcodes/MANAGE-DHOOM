import { Users, Store, UserCheck, ShieldAlert } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import type { CustomerStats } from "@/modules/customers/services/customers.service";

/* ────────────────────────── atomic UI (dashboard-consistent) ────────────────────────── */

function TintIconBadge({
  tint,
  children,
}: {
  tint: string;
  children: ReactNode;
}) {
  return (
    <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200/55 bg-white/90 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <span
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{ background: tint }}
        aria-hidden
      />
      <span className="relative text-slate-500 [&_svg]:size-4">{children}</span>
    </span>
  );
}

function TrendChip({
  tone,
  children,
}: {
  tone: "up" | "down" | "neutral";
  children: ReactNode;
}) {
  const tones = {
    up: "bg-emerald-50/80 text-emerald-600/90 ring-emerald-500/[0.08]",
    down: "bg-rose-50/80 text-rose-600/90 ring-rose-500/[0.08]",
    neutral: "bg-slate-100/90 text-slate-600/90 ring-slate-900/[0.05]",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ring-1 ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function KpiCard({
  label,
  value,
  delta,
  icon: Icon,
  tint,
  children,
}: {
  label: string;
  value: string | number;
  delta?: ReactNode;
  icon: ComponentType<{ className?: string }>;
  tint: string;
  children?: ReactNode;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_2px_10px_-4px_rgba(15,23,42,0.06),0_20px_40px_-24px_rgba(15,23,42,0.12)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_14px_-4px_rgba(15,23,42,0.1),0_28px_50px_-24px_rgba(15,23,42,0.16)]">
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full opacity-[0.07] blur-2xl transition-opacity group-hover:opacity-[0.11]"
        style={{ background: tint }}
        aria-hidden
      />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-slate-400">
            {label}
          </p>
          <p className="mt-2 text-[28px] font-black leading-none tabular-nums tracking-tight text-slate-950">
            {value}
          </p>
        </div>
        <TintIconBadge tint={tint}>
          <Icon aria-hidden />
        </TintIconBadge>
      </div>
      {delta ? <div className="relative mt-3">{delta}</div> : null}
      {children ? <div className="relative mt-4">{children}</div> : null}
    </div>
  );
}

function InlineRail({
  pct,
  label,
  value,
  gradient,
}: {
  pct: number;
  label: string;
  value: string;
  gradient: string;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10.5px] font-bold">
        <span className="uppercase tracking-[0.14em] text-slate-400">
          {label}
        </span>
        <span className="tabular-nums text-slate-700">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full"
          style={{ width: `${clamped}%`, background: gradient }}
        />
      </div>
    </div>
  );
}

export function CustomersStatCards({ stats }: { stats: CustomerStats }) {
  const activePct = stats.total > 0 ? (stats.active / stats.total) * 100 : 0;
  const retailPct = stats.total > 0 ? (stats.retail / stats.total) * 100 : 0;
  
  return (
    <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
      <KpiCard
        label="Total Customers"
        value={stats.total.toLocaleString("en-IN")}
        icon={Users}
        tint="linear-gradient(135deg, #e0e7ff, #c7d2fe)"
        delta={
          <div className="flex flex-wrap items-center gap-2">
            <TrendChip tone="neutral">
              All registered
            </TrendChip>
          </div>
        }
      />

      <KpiCard
        label="Retail Stores"
        value={stats.retail.toLocaleString("en-IN")}
        icon={Store}
        tint="linear-gradient(135deg, #d1fae5, #a7f3d0)"
        delta={
          <div className="flex flex-wrap items-center gap-2">
            <TrendChip tone="up">
              {Math.round(retailPct)}% of total
            </TrendChip>
          </div>
        }
      />

      <KpiCard
        label="Staff / Other"
        value={stats.staff.toLocaleString("en-IN")}
        icon={ShieldAlert}
        tint="linear-gradient(135deg, #fef9c3, #fde68a)"
        delta={
          <div className="flex flex-wrap items-center gap-2">
            <TrendChip tone="neutral">
              Admins & vendors
            </TrendChip>
          </div>
        }
      />

      <KpiCard
        label="Active Verified"
        value={stats.active.toLocaleString("en-IN")}
        icon={UserCheck}
        tint="linear-gradient(135deg, #cffafe, #a5f3fc)"
        delta={
          <div className="flex flex-wrap items-center gap-2">
            <TrendChip tone={activePct >= 90 ? "up" : "neutral"}>
              {Math.round(activePct)}% active
            </TrendChip>
            {stats.total - stats.active > 0 ? (
              <TrendChip tone="down">
                {(stats.total - stats.active).toLocaleString("en-IN")} blocked
              </TrendChip>
            ) : null}
          </div>
        }
      >
        <InlineRail
          pct={activePct}
          label="Active Share"
          value={`${stats.active} / ${stats.total}`}
          gradient="linear-gradient(to right, #34d399, #10b981)"
        />
      </KpiCard>
    </div>
  );
}
