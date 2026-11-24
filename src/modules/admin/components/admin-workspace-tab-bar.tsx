"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState, type DragEvent } from "react";
import { GripVertical, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { ADMIN_WORKSPACE_MAX_TABS } from "@/modules/admin/lib/admin-workspace-tabs";
import { prefetchInactiveWorkspaceTab } from "@/modules/admin/lib/admin-workspace-tab-refresh";
import { useAdminWorkspaceTabs } from "@/modules/admin/providers/admin-workspace-tabs-provider";

export function AdminWorkspaceTabBar() {
  const queryClient = useQueryClient();
  const pathname = usePathname() ?? "/admin";
  const { tabs, activeRootHref, activateTab, closeTab, reorderTabs } = useAdminWorkspaceTabs();
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const hoverPrefetchRoot = useRef<string | null>(null);

  const onDragStart = useCallback(
    (index: number) => (event: DragEvent<HTMLButtonElement>) => {
      setDragFrom(index);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
    },
    [],
  );

  const onDragOver = useCallback(
    (index: number) => (event: DragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDragOver(index);
    },
    [],
  );

  const onDrop = useCallback(
    (index: number) => (event: DragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const from = dragFrom ?? Number(event.dataTransfer.getData("text/plain"));
      if (!Number.isNaN(from)) reorderTabs(from, index);
      setDragFrom(null);
      setDragOver(null);
    },
    [dragFrom, reorderTabs],
  );

  const onDragEnd = useCallback(() => {
    setDragFrom(null);
    setDragOver(null);
  }, []);

  const onTabHover = useCallback(
    (tab: (typeof tabs)[number]) => {
      if (tab.rootHref === activeRootHref) return;
      if (hoverPrefetchRoot.current === tab.rootHref) return;
      hoverPrefetchRoot.current = tab.rootHref;
      prefetchInactiveWorkspaceTab(
        queryClient,
        tab.href,
        activeRootHref,
        tab.rootHref,
        pathname,
      );
    },
    [activeRootHref, pathname, queryClient],
  );

  if (tabs.length === 0) return null;
  const canCloseTabs = tabs.length > 1;

  return (
    <div
      className="sticky top-0 z-20 border-b border-slate-200/80 bg-[#F8FAFC]/95 px-2.5 py-2 backdrop-blur-sm sm:px-4"
      role="tablist"
      aria-label="Open workspaces"
    >
      <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:thin]">
        {tabs.map((tab, index) => {
          const Icon = tab.icon;
          const active = tab.rootHref === activeRootHref;

          return (
            <div
              key={tab.rootHref}
              role="presentation"
              onMouseEnter={() => onTabHover(tab)}
              className={cn(
                "flex shrink-0 items-stretch overflow-hidden rounded-t-xl rounded-b-none border border-b-0 transition-colors",
                active
                  ? "border-[#EB205F]/25 bg-white shadow-sm"
                  : "border-transparent bg-slate-100/80 hover:border-slate-200 hover:bg-white",
                dragOver === index && dragFrom !== index && "ring-2 ring-[#EB205F]/30",
              )}
            >
              <button
                type="button"
                draggable
                onDragStart={onDragStart(index)}
                onDragOver={onDragOver(index)}
                onDrop={onDrop(index)}
                onDragEnd={onDragEnd}
                onClick={() => activateTab(tab.rootHref)}
                role="tab"
                aria-selected={active}
                className={cn(
                  "flex max-w-[12.5rem] min-h-9 min-w-0 items-center gap-2 px-2.5 py-1.5 text-left sm:max-w-[15rem]",
                  active ? "text-[#EB205F]" : "text-slate-600",
                )}
                title={tab.label}
              >
                <GripVertical
                  className="size-3.5 shrink-0 cursor-grab text-slate-400 active:cursor-grabbing"
                  aria-hidden
                />
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate text-xs font-semibold leading-tight">
                  {tab.label}
                </span>
              </button>
              {canCloseTabs ? (
                <button
                  type="button"
                  className="flex min-h-9 min-w-8 items-center justify-center px-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(tab.rootHref);
                  }}
                  aria-label={`Close ${tab.label}`}
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          );
        })}
        {tabs.length >= ADMIN_WORKSPACE_MAX_TABS ? (
          <span className="shrink-0 px-2 text-[10px] font-medium text-muted-foreground">
            Max {ADMIN_WORKSPACE_MAX_TABS} tabs
          </span>
        ) : null}
      </div>
    </div>
  );
}