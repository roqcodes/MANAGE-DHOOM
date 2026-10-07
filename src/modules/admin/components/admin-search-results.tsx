"use client";

import { useMemo, useState, type ComponentType } from "react";
import {
  ArrowRight,
  Building2,
  ClipboardList,
  FolderTree,
  ImageIcon,
  LayoutDashboard,
  Package,
  Search,
  UserCircle,
  Users,
  Warehouse,
} from "lucide-react";

import { getAllAdminNavItems } from "@/modules/admin/lib/admin-nav-items";
import type {
  AdminSearchBadge,
  AdminSearchBadgeTone,
  AdminSearchGroup,
  AdminSearchResultItem,
} from "@/modules/admin/types/admin-search";
import { customerInitials } from "@/modules/orders/components/orders-ui";
import { cn } from "@/lib/utils";

const GROUP_ICONS: Record<string, typeof Search> = {
  pages: LayoutDashboard,
  orders: ClipboardList,
  purchase_orders: Package,
  products: Package,
  inventory: Warehouse,
  customers: UserCircle,
  vendors: Building2,
  categories: FolderTree,
  team: Users,
};

const BADGE_STYLES: Record<AdminSearchBadgeTone, string> = {
  success: "border-emerald-200/80 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200/80 bg-amber-50 text-amber-800",
  danger: "border-rose-200/80 bg-rose-50 text-rose-700",
  muted: "border-border bg-muted/70 text-muted-foreground",
  info: "border-sky-200/80 bg-sky-50 text-sky-700",
};

const PAGE_ICON_STYLES = [
  "bg-blue-50 text-blue-600 ring-blue-100",
  "bg-violet-50 text-violet-600 ring-violet-100",
  "bg-emerald-50 text-emerald-600 ring-emerald-100",
  "bg-amber-50 text-amber-600 ring-amber-100",
  "bg-rose-50 text-rose-600 ring-rose-100",
  "bg-sky-50 text-sky-600 ring-sky-100",
] as const;

function usePageNavLookup() {
  return useMemo(() => {
    const iconByHref = new Map<string, ComponentType<{ className?: string }>>();
    for (const item of getAllAdminNavItems()) {
      iconByHref.set(item.href, item.icon);
    }
    return iconByHref;
  }, []);
}

function SearchBadge({ badge }: { badge: AdminSearchBadge }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none",
        BADGE_STYLES[badge.tone],
      )}
    >
      {badge.label}
    </span>
  );
}

function SearchThumbnail({
  url,
  fallback: Fallback = Package,
  className,
}: {
  url?: string;
  fallback?: typeof Package;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const trimmed = url?.trim() ?? "";

  if (!trimmed || failed) {
    return (
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-muted/40 text-muted-foreground",
          className,
        )}
      >
        <Fallback className="size-4" aria-hidden />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={trimmed}
      alt=""
      className={cn(
        "size-11 shrink-0 rounded-lg border border-border/80 object-cover",
        className,
      )}
      onError={() => setFailed(true)}
    />
  );
}

function SearchAvatar({
  name,
  groupId,
}: {
  name: string;
  groupId: string;
}) {
  const Icon = GROUP_ICONS[groupId] ?? UserCircle;
  const initials = customerInitials(name);

  return (
    <span
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-inset",
        groupId === "vendors"
          ? "bg-violet-50 text-violet-700 ring-violet-200/80"
          : groupId === "team"
            ? "bg-sky-50 text-sky-700 ring-sky-200/80"
            : "bg-slate-100 text-slate-700 ring-slate-200/80",
      )}
    >
      {initials === "?" ? <Icon className="size-4" aria-hidden /> : initials}
    </span>
  );
}

function SearchRefChip({ ref }: { ref: string }) {
  return (
    <span className="inline-flex shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-slate-600">
      {ref}
    </span>
  );
}

function ResultBadges({ badges }: { badges?: AdminSearchBadge[] }) {
  if (!badges?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {badges.map((badge) => (
        <SearchBadge key={badge.label} badge={badge} />
      ))}
    </div>
  );
}

export function SearchPageResultRow({
  item,
  iconIndex = 0,
}: {
  item: AdminSearchResultItem;
  iconIndex?: number;
}) {
  const iconByHref = usePageNavLookup();
  const Icon = iconByHref.get(item.href) ?? LayoutDashboard;
  const iconStyle = PAGE_ICON_STYLES[iconIndex % PAGE_ICON_STYLES.length];

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
          iconStyle,
        )}
      >
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">{item.section ?? item.subtitle}</p>
      </div>
      <ArrowRight
        className="size-3.5 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-data-selected/command-item:opacity-100"
        aria-hidden
      />
    </div>
  );
}

export function SearchEntityResultRow({
  item,
  groupId,
}: {
  item: AdminSearchResultItem;
  groupId: string;
}) {
  const showThumbnail =
    groupId === "products" || groupId === "categories" || Boolean(item.thumbnailUrl);
  const showAvatar =
    groupId === "customers" || groupId === "vendors" || groupId === "team";

  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      {showThumbnail ? (
        <SearchThumbnail
          url={item.thumbnailUrl}
          fallback={groupId === "categories" ? ImageIcon : Package}
        />
      ) : showAvatar ? (
        <SearchAvatar name={item.title} groupId={groupId} />
      ) : (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-200/80">
          {(() => {
            const Icon = GROUP_ICONS[groupId] ?? Search;
            return <Icon className="size-4 text-slate-500" aria-hidden />;
          })()}
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-2">
          {item.ref ? <SearchRefChip ref={item.ref} /> : null}
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {item.title}
          </p>
        </div>

        {item.subtitle ? (
          <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
        ) : null}

        <ResultBadges badges={item.badges} />

        {item.meta ? (
          <p className="line-clamp-1 text-[11px] leading-snug text-muted-foreground/80">
            {item.meta}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function SearchGroupHeader({
  group,
  showCount = true,
}: {
  group: AdminSearchGroup;
  showCount?: boolean;
}) {
  const Icon = GROUP_ICONS[group.id] ?? Search;

  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <span className="flex size-5 items-center justify-center rounded-md bg-muted/80 text-muted-foreground">
        <Icon className="size-3" aria-hidden />
      </span>
      <span className="text-xs font-semibold tracking-wide text-foreground uppercase">
        {group.label}
      </span>
      {showCount ? (
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
          {group.items.length}
        </span>
      ) : null}
    </div>
  );
}

export function groupPagesBySection(items: AdminSearchResultItem[]) {
  const sections = new Map<string, AdminSearchResultItem[]>();
  const order: string[] = [];

  for (const item of items) {
    const key = item.section ?? "Pages";
    if (!sections.has(key)) {
      sections.set(key, []);
      order.push(key);
    }
    sections.get(key)!.push(item);
  }

  return order.map((section) => ({
    section,
    items: sections.get(section) ?? [],
  }));
}
