"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  ADMIN_QUICK_CREATE_GROUPS,
  type QuickCreateBankingTx,
  type QuickCreateEntry,
} from "@/modules/admin/lib/admin-quick-create-config";
import { QuickCreateBankingAccountPicker } from "@/modules/admin/components/quick-create-banking-account-picker";

const CLOSE_DELAY_MS = 200;

export function AdminQuickCreateMenu() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuTop, setMenuTop] = useState(0);
  const [bankingPick, setBankingPick] = useState<QuickCreateBankingTx | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateMenuPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuTop(rect.bottom + 8);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

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

  function renderEntryIcon(entry: QuickCreateEntry) {
    const Icon = entry.icon;
    return (
      <span
        className="flex size-4 shrink-0 items-center justify-center text-slate-400 transition-colors duration-150 group-hover/entry:text-blue-600"
        aria-hidden
      >
        <Icon className="size-3.5 stroke-[1.75]" />
      </span>
    );
  }

  function renderEntry(entry: QuickCreateEntry, groupId: string) {
    const className =
      "group/entry flex w-full items-center gap-2 whitespace-normal rounded-md px-2 py-1.5 text-left text-[13px] font-medium leading-snug text-slate-700 transition-all duration-150 ease-out hover:bg-white hover:pl-2.5 hover:text-blue-700 hover:shadow-sm motion-reduce:transition-none";

    if (entry.type === "link") {
      return (
        <Link
          key={`${groupId}-${entry.label}`}
          href={entry.href}
          role="menuitem"
          className={className}
          onClick={() => closeMenu()}
        >
          {renderEntryIcon(entry)}
          <span className="min-w-0 flex-1">{entry.label}</span>
        </Link>
      );
    }

    return (
      <button
        key={`${groupId}-${entry.label}`}
        type="button"
        role="menuitem"
        className={className}
        onClick={() => handleEntryClick(entry)}
      >
        {renderEntryIcon(entry)}
        <span className="min-w-0 flex-1 text-left">{entry.label}</span>
      </button>
    );
  }

  const menuPanel =
    open && mounted ? (
      <div className="pointer-events-none fixed inset-0 z-[45]">
        <div
          ref={menuRef}
          className="pointer-events-auto absolute left-1/2 w-[min(880px,calc(100vw-1.5rem))] -translate-x-1/2"
          style={{ top: menuTop }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div
            role="menu"
            aria-label="Quick create"
            className="origin-top rounded-xl border border-slate-200/90 bg-white p-2 shadow-xl shadow-slate-900/10 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200 motion-reduce:animate-none"
          >
            <div className="columns-2 gap-2 sm:columns-4">
              {ADMIN_QUICK_CREATE_GROUPS.map((section) => (
                <div
                  key={section.id}
                  className="group mb-2 break-inside-avoid rounded-lg border border-slate-100 bg-slate-50/90 p-1.5 transition-colors duration-200 last:mb-0 hover:border-slate-200/90 hover:bg-slate-50"
                >
                  <p className="px-2 py-0.5 text-xs font-semibold text-slate-500 transition-colors duration-150 group-hover:text-slate-600">
                    {section.label}
                  </p>
                  <div>
                    {section.items.map((entry) => renderEntry(entry, section.id))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ) : null;

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
            "flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white shadow-sm shadow-blue-600/25 transition-all duration-200 ease-out",
            "hover:bg-blue-700 hover:shadow-md hover:shadow-blue-600/30 active:scale-[0.98]",
            open && "bg-blue-700 ring-2 ring-blue-600/30 shadow-md",
            "motion-reduce:transition-none motion-reduce:active:scale-100",
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
      </div>

      {menuPanel ? createPortal(menuPanel, document.body) : null}

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
