"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PresentShell({
  title,
  subtitle,
  children,
  className,
  footer,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-white/15 bg-background/70 shadow-sm backdrop-blur-md dark:bg-slate-950/40",
        className,
      )}
    >
      {title ? (
        <div className="border-b border-white/10 px-3 py-2">
          <p className="text-[12px] font-semibold leading-snug text-foreground">
            {title}
          </p>
          {subtitle ? (
            <p className="mt-0.5 text-[10px] text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      ) : null}
      {children}
      {footer ? (
        <div className="border-t border-white/10 px-2 py-2">{footer}</div>
      ) : null}
    </div>
  );
}
