"use client";

import {
  ArrowUpRight,
  Building2,
  FileText,
  Package,
  Receipt,
  User,
  Wallet,
} from "lucide-react";

import type { UiEntityBlock, UiEntityKind } from "../../lib/parse-ui";
import { AssistantActionButton } from "../assistant-action-ui";
import { entityInitials } from "./present-format";
import { PresentShell } from "./PresentShell";

const KIND_ICON: Record<UiEntityKind, typeof User> = {
  customer: User,
  vendor: Building2,
  invoice: FileText,
  bill: Receipt,
  product: Package,
  user: User,
  account: Wallet,
};

const KIND_ACCENT: Record<UiEntityKind, string> = {
  customer: "from-sky-500/25 to-indigo-500/20",
  vendor: "from-violet-500/25 to-purple-500/20",
  invoice: "from-emerald-500/20 to-teal-500/15",
  bill: "from-amber-500/22 to-orange-500/18",
  product: "from-cyan-500/20 to-sky-500/15",
  user: "from-slate-500/25 to-zinc-500/15",
  account: "from-rose-500/20 to-primary/15",
};

export function PresentEntityCard({ block }: { block: UiEntityBlock }) {
  const Icon = KIND_ICON[block.kind];
  const fields = block.fields.slice(0, 8);

  return (
    <PresentShell
      footer={
        block.href ? (
          <AssistantActionButton
            variant="open"
            href={block.href}
            label={
              block.kind === "customer"
                ? "Open customer"
                : block.kind === "invoice"
                  ? "Open invoice"
                  : `Open ${block.kind}`
            }
            className="mt-0 w-full justify-center"
            icon={<ArrowUpRight size={9} strokeWidth={2.5} aria-hidden />}
          />
        ) : undefined
      }
    >
      <div className="flex gap-3 px-3 py-2.5">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${KIND_ACCENT[block.kind]} border border-white/10`}
          aria-hidden
        >
          <span className="text-[11px] font-bold text-foreground">
            {entityInitials(block.title)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <Icon className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-foreground">
                {block.title}
              </p>
              {block.subtitle ? (
                <p className="text-[10px] capitalize text-muted-foreground">
                  {block.subtitle}
                </p>
              ) : null}
            </div>
          </div>
          <dl className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                  {f.label}
                </dt>
                <dd className="truncate text-[11px] tabular-nums text-foreground/95">
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </PresentShell>
  );
}
