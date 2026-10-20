"use client";

import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function FeedbackDialogFrame({
  open,
  onOpenChange,
  icon: Icon,
  iconWrapClassName,
  iconClassName,
  title,
  badge,
  description,
  bulletPoints,
  technicalHint,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: LucideIcon;
  iconWrapClassName: string;
  iconClassName: string;
  title: string;
  badge?: React.ReactNode;
  description: string;
  bulletPoints?: string[];
  technicalHint?: string;
  footer: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="gap-3 border-b border-border px-5 py-4 text-left">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-full",
                iconWrapClassName,
                iconClassName,
              )}
            >
              <Icon className="size-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 space-y-2 pr-1">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-base font-semibold leading-snug">{title}</DialogTitle>
                {badge}
              </div>
              <DialogDescription className="text-sm leading-relaxed text-foreground/90">
                {description}
              </DialogDescription>
              {bulletPoints && bulletPoints.length > 0 ? (
                <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed text-foreground/85">
                  {bulletPoints.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
              {technicalHint ? (
                <p
                  className="rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 font-mono text-[11px] leading-snug text-amber-950/90 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100/90"
                >
                  {technicalHint}
                </p>
              ) : null}
              {children}
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="gap-2 border-t border-border bg-muted/40 px-5 py-3.5 sm:justify-end">
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FeedbackOkButton({ onClick, label = "OK" }: { onClick: () => void; label?: string }) {
  return (
    <Button type="button" className="min-w-20" onClick={onClick}>
      {label}
    </Button>
  );
}
