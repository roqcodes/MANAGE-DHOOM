"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { ADMIN_HEADER_CONTROL_HEIGHT } from "@/modules/admin/components/admin-header-chrome";
import { INTERACTIVE_CTA_SOLID_HOVER } from "@/lib/ui/interactive-styles";
import {
  ADMIN_QUICK_CREATE_ENTRIES,
  type QuickCreateBankingTx,
  type QuickCreateEntry,
} from "@/modules/admin/lib/admin-quick-create-config";
import { QuickCreateBankingAccountPicker } from "@/modules/admin/components/quick-create-banking-account-picker";

const CLOSE_DELAY_MS = 200;

/** One muted accent per grid slot (3×2). */
const TILE_ACCENTS = [
  {
    tile: "border-slate-200/90 bg-slate-50/80 hover:border-blue-200/90 hover:bg-blue-50/40",
    icon: "bg-blue-500/10 text-blue-700/90 ring-1 ring-blue-500/15",
    label: "text-slate-700",
  },
  {
    tile: "border-slate-200/90 bg-slate-50/80 hover:border-emerald-200/90 hover:bg-emerald-50/35",
    icon: "bg-emerald-500/10 text-emerald-800/85 ring-1 ring-emerald-500/15",
    label: "text-slate-700",
  },
  {
    tile: "border-slate-200/90 bg-slate-50/80 hover:border-violet-200/90 hover:bg-violet-50/35",
    icon: "bg-violet-500/10 text-violet-800/85 ring-1 ring-violet-500/15",
    label: "text-slate-700",
  },
  {
    tile: "border-slate-200/90 bg-slate-50/80 hover:border-amber-200/90 hover:bg-amber-50/40",
    icon: "bg-amber-500/10 text-amber-800/85 ring-1 ring-amber-500/15",
    label: "text-slate-700",
  },
  {
    tile: "border-slate-200/90 bg-slate-50/80 hover:border-rose-200/90 hover:bg-rose-50/35",
    icon: "bg-rose-500/10 text-rose-800/85 ring-1 ring-rose-500/15",
    label: "text-slate-700",
  },
  {
    tile: "border-slate-200/90 bg-slate-50/80 hover:border-sky-200/90 hover:bg-sky-50/35",
    icon: "bg-sky-500/10 text-sky-800/85 ring-1 ring-sky-500/15",
    label: "text-slate-700",
  },
] as const;

function tileClasses(index: number) {
  const accent = TILE_ACCENTS[index % TILE_ACCENTS.length];
  return {
    tile: cn(
      "group/tile flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border p-1",
      "text-center text-[10px] font-semibold leading-tight",
      "shadow-none transition-all duration-150 ease-out",
      "hover:shadow-sm",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
      accent.tile,
      accent.label,
    ),
    icon: cn(
      "flex size-8 shrink-0 items-center justify-center rounded-md transition-transform duration-150 group-hover/tile:scale-[1.03]",
      accent.icon,
    ),
  };
}

export function AdminQuickCreateMenu() {
  const [open, setOpen] = useState(false);
  const [bankingPick, setBankingPick] = useState<QuickCreateBankingTx | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [cancelClose]);

  const handleOpen = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  const handleToggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const closeMenu = useCallback(() => {
    cancelClose();
    setOpen(false);
  }, [cancelClose]);

  function handleEntryClick(entry: QuickCreateEntry) {
    if (entry.type === "banking-tx") {
      closeMenu();
      setBankingPick(entry);
      return;
    }
    closeMenu();
  }

  function renderTile(entry: QuickCreateEntry, index: number) {
    const { tile, icon } = tileClasses(index);
    const content = (
      <>
        <span className={icon} aria-hidden>
          <entry.icon className="size-4 stroke-[2]" />
        </span>
        <span className="line-clamp-2 w-full px-0.5">{entry.label}</span>
      </>
    );

    if (entry.type === "link") {
      return (
        <Link
          key={`${entry.href}-${index}`}
          href={entry.href}
          role="menuitem"
          className={tile}
          onClick={() => closeMenu()}
        >
          {content}
        </Link>
      );
    }

    return (
      <button
        key={`${entry.label}-${index}`}
        type="button"
        role="menuitem"
        className={tile}
        onClick={() => handleEntryClick(entry)}
      >
        {content}
      </button>
    );
  }

  return (
    <>
      <div
        ref={triggerRef}
        className="relative"
        onMouseEnter={handleOpen}
        onMouseLeave={scheduleClose}
      >
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            ADMIN_HEADER_CONTROL_HEIGHT,
            "flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary-foreground",
            INTERACTIVE_CTA_SOLID_HOVER,
            open && "bg-primary/90 ring-2 ring-primary/30 shadow-md",
          )}
          aria-label="Quick create"
          aria-expanded={open}
          aria-haspopup="menu"
        >
          CREATE
          <ChevronDown
            className={cn(
              "size-3.5 opacity-90 transition-transform duration-200 ease-out",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>

        {open ? (
          <div
            ref={menuRef}
            className="absolute left-0 top-[calc(100%+6px)] z-[60] w-[252px] origin-top animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150 motion-reduce:animate-none"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <div
              role="menu"
              aria-label="Quick create"
              className="rounded-xl border border-slate-200/80 bg-white/95 p-1.5 shadow-lg shadow-slate-900/10 ring-1 ring-black/[0.04] backdrop-blur-sm"
            >
              <div className="grid grid-cols-3 grid-rows-2 gap-1">
                {ADMIN_QUICK_CREATE_ENTRIES.map((entry, index) => renderTile(entry, index))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <QuickCreateBankingAccountPicker
        open={bankingPick !== null}
        onOpenChange={(next) => {
          if (!next) setBankingPick(null);
        }}
        txKind={bankingPick?.txKind ?? "owner_contribution"}
        direction={bankingPick?.direction}
        actionLabel={bankingPick?.label ?? "Transaction"}
      />
    </>
  );
}