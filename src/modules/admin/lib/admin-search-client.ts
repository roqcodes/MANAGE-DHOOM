import {
  ADMIN_DASHBOARD_ITEM,
  ADMIN_EXTRA_NAV_ITEMS,
  ADMIN_NAV_SECTIONS,
  type AdminNavItem,
} from "@/modules/admin/lib/admin-nav-items";
import { isAdminRouteHidden } from "@/modules/admin/lib/hidden-admin-routes";
import type {
  AdminSearchGroup,
  AdminSearchIndexItem,
} from "@/modules/admin/types/admin-search";

const GROUP_LABELS: Record<string, string> = {
  pages: "Pages",
  orders: "Orders",
  purchase_orders: "Purchase orders",
  products: "Products",
  inventory: "Inventory",
  customers: "Customers",
  vendors: "Vendors",
  categories: "Categories",
  team: "Team & users",
};

const GROUP_ORDER = [
  "pages",
  "orders",
  "purchase_orders",
  "products",
  "inventory",
  "customers",
  "vendors",
  "categories",
  "team",
];

const MAX_PER_GROUP = 10;

function navSearchText(item: AdminNavItem): string {
  return [
    item.name,
    item.href,
    item.href.replace("/admin/", "").replace(/\//g, " "),
    ...(item.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

function pagePathLabel(href: string): string {
  if (href === "/admin") return "Dashboard";
  return href.replace(/^\/admin\/?/, "").replace(/\//g, " › ") || "Admin";
}

export function buildPageIndexItems(): AdminSearchIndexItem[] {
  const items: AdminSearchIndexItem[] = [];

  const push = (item: AdminNavItem, section: string) => {
    if (isAdminRouteHidden(item.href)) return;
    items.push({
      id: item.href,
      group: "pages",
      title: item.name,
      subtitle: pagePathLabel(item.href),
      section,
      href: item.href,
      searchText: navSearchText(item),
    });
  };

  push(ADMIN_DASHBOARD_ITEM, "Overview");
  for (const navSection of ADMIN_NAV_SECTIONS) {
    for (const navItem of navSection.items) {
      push(navItem, navSection.label);
    }
  }
  for (const navItem of ADMIN_EXTRA_NAV_ITEMS) {
    push(navItem, "More");
  }

  return items;
}

function scoreItem(item: AdminSearchIndexItem, tokens: string[]): number {
  const title = item.title.toLowerCase();
  const text = item.searchText;
  let score = 0;

  for (const token of tokens) {
    if (title === token) score += 100;
    else if (title.startsWith(token)) score += 40;
    else if (title.includes(token)) score += 20;
    else if (text.startsWith(token)) score += 12;
    else if (text.includes(token)) score += 6;
    else return -1;
  }

  return score;
}

export function filterSearchIndex(
  serverItems: AdminSearchIndexItem[],
  query: string,
): AdminSearchGroup[] {
  const pageItems = buildPageIndexItems();
  const trimmed = query.trim().toLowerCase();
  const tokens = trimmed.split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return pageItems.length
      ? [
          {
            id: "pages",
            label: GROUP_LABELS.pages,
            items: pageItems.map(({ group: _group, searchText: _searchText, ...rest }) => rest),
          },
        ]
      : [];
  }

  const allItems = [...pageItems, ...serverItems];
  const scored: { item: AdminSearchIndexItem; score: number }[] = [];

  for (const item of allItems) {
    const score = scoreItem(item, tokens);
    if (score >= 0) scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));

  const grouped = new Map<string, AdminSearchIndexItem[]>();
  for (const { item } of scored) {
    const list = grouped.get(item.group) ?? [];
    if (list.length >= MAX_PER_GROUP) continue;
    list.push(item);
    grouped.set(item.group, list);
  }

  return GROUP_ORDER.flatMap((groupId) => {
    const items = grouped.get(groupId);
    if (!items?.length) return [];
    return [
      {
        id: groupId,
        label: GROUP_LABELS[groupId] ?? groupId,
        items: items.map(({ group: _group, searchText: _searchText, ...rest }) => rest),
      },
    ];
  });
}
