import {
  ADMIN_DASHBOARD_ITEM,
  ADMIN_EXTRA_NAV_ITEMS,
  ADMIN_NAV_SECTIONS,
  type AdminNavItem,
} from "@/modules/admin/lib/admin-nav-items";

import {
  defaultPageBlurb,
  PAGE_BLURBS,
} from "./app-sitemap-blurbs";

export type SitemapPage = {
  path: string;
  name: string;
  section: string;
  about: string;
  kw: string[];
};

function toPage(section: string, item: AdminNavItem): SitemapPage {
  return {
    path: item.href,
    name: item.name,
    section,
    about: PAGE_BLURBS[item.href] ?? defaultPageBlurb(section, item.name),
    kw: [item.name, section, ...(item.keywords ?? [])].map((s) =>
      s.toLowerCase(),
    ),
  };
}

/** Source list used to generate `data/app-sitemap.json` (run `npm run ai:sitemap`). */
export function buildSitemapPages(): SitemapPage[] {
  const pages: SitemapPage[] = [
    toPage("Overview", ADMIN_DASHBOARD_ITEM),
  ];

  for (const section of ADMIN_NAV_SECTIONS) {
    for (const item of section.items) {
      pages.push(toPage(section.label, item));
    }
  }

  for (const item of ADMIN_EXTRA_NAV_ITEMS) {
    pages.push(toPage("Settings", item));
  }

  return pages;
}
