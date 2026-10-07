import {
  ADMIN_DASHBOARD_ITEM,
  ADMIN_NAV_SECTIONS,
} from "../../admin/lib/admin-nav-items";
import {
  type AdminSidebarChrome,
  getAdminSidebarElement,
  isAdminSidebarRailCollapsed,
} from "./admin-sidebar-chrome";

const AI_ID_ATTR = "data-bh-ai-id";

function isInSidebarFlyout(el: Element): boolean {
  return Boolean(el.closest('[data-bh-sidebar-flyout="true"]'));
}

function getAdminSidebar(el: Element): HTMLElement | null {
  return el.closest('[data-bh-admin-sidebar="true"]') as HTMLElement | null;
}

function isClippedInSidebarAncestor(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return true;

  let parent = el.parentElement;
  while (parent) {
    const style = window.getComputedStyle(parent);
    const clips =
      style.overflow === "hidden" ||
      style.overflowY === "hidden" ||
      style.overflowX === "hidden";
    if (clips && parent.closest("[data-bh-admin-sidebar]")) {
      const pr = parent.getBoundingClientRect();
      if (rect.bottom <= pr.top + 2 || rect.top >= pr.bottom - 2) return true;
      if (rect.right <= pr.left + 2 || rect.left >= pr.right - 2) return true;
    }
    if (parent.matches('[data-bh-admin-sidebar="true"]')) break;
    parent = parent.parentElement;
  }
  return false;
}

function isShownEnough(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.pointerEvents === "none"
  ) {
    return false;
  }
  const opacity = Number(style.opacity);
  if (!Number.isNaN(opacity) && opacity === 0) return false;
  return !isClippedInSidebarAncestor(el);
}

/**
 * Nested sidebar links inside a folded section or collapsed rail (no flyout) must not
 * be offered to the guide model or highlighted.
 */
export function isElementExposedInNavChrome(el: HTMLElement): boolean {
  const aside = getAdminSidebar(el);
  if (!aside) return true;

  if (el.matches("button[data-bh-nav-section]")) {
    return isShownEnough(el);
  }

  if (isInSidebarFlyout(el)) {
    const flyout = el.closest<HTMLElement>('[data-bh-sidebar-flyout="true"]');
    return Boolean(flyout && isShownEnough(flyout) && isShownEnough(el));
  }

  const collapsed = isAdminSidebarRailCollapsed(aside);

  if (collapsed) {
    if (
      el instanceof HTMLAnchorElement &&
      el.getAttribute("href") === ADMIN_DASHBOARD_ITEM.href &&
      !el.closest("nav .relative")
    ) {
      return isShownEnough(el);
    }
    return false;
  }

  const sectionRoot = el.closest("nav .pt-1");
  if (sectionRoot) {
    const sectionBtn = sectionRoot.querySelector<HTMLElement>(
      ":scope > button[data-bh-nav-section]",
    );
    if (sectionBtn && sectionBtn.getAttribute("aria-expanded") !== "true") {
      return false;
    }
  }

  return isShownEnough(el);
}

/** Stable sidebar href for an exact nav item label (e.g. "Expenses"). */
export function hrefForAdminNavItemName(name: string): string | null {
  const needle = name.replace(/\s+/g, " ").trim().toLowerCase();
  if (!needle) return null;
  if (ADMIN_DASHBOARD_ITEM.name.toLowerCase() === needle) {
    return ADMIN_DASHBOARD_ITEM.href;
  }
  for (const section of ADMIN_NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.name.toLowerCase() === needle) return item.href;
    }
  }
  return null;
}

export function pathWithoutQuery(path: string): string {
  return path.split("?")[0].split("#")[0];
}

export function isOnTargetHref(currentPath: string, href: string): boolean {
  const path = pathWithoutQuery(currentPath);
  return path === href || path.startsWith(`${href}/`);
}

function scoreNavMatch(
  query: string,
  name: string,
  href: string,
  keywords?: string[],
): number {
  let score = 0;
  const n = name.toLowerCase();
  const nameRe = new RegExp(
    `\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "i",
  );
  if (nameRe.test(query)) score = Math.max(score, n.length * 14);
  const slug = href.split("/").pop()?.replace(/-/g, " ").toLowerCase() ?? "";
  if (slug.length >= 4) {
    const slugRe = new RegExp(
      `\\b${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i",
    );
    if (slugRe.test(query)) score = Math.max(score, slug.length * 9);
  }
  for (const kw of keywords ?? []) {
    const k = kw.toLowerCase();
    if (k.length < 4) continue;
    const kwRe = new RegExp(
      `\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i",
    );
    if (kwRe.test(query)) score = Math.max(score, k.length * 6);
  }
  return score;
}

const STORES_HREF = "/admin/erp/stores";
const BUSINESS_SETTINGS_HREF = "/admin/business";

/** Whole-word nav item names beat fuzzy slug/substring scoring. */
function hrefForWholeWordNavName(goal: string): string | null {
  const g = goal.toLowerCase().replace(/\s+/g, " ");
  let bestHref: string | null = null;
  let bestLen = 0;

  const considerName = (name: string, href: string) => {
    const n = name.toLowerCase();
    const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (!re.test(g)) return;
    if (!bestHref || n.length > bestLen) {
      bestHref = href;
      bestLen = n.length;
    }
  };

  considerName(ADMIN_DASHBOARD_ITEM.name, ADMIN_DASHBOARD_ITEM.href);
  for (const section of ADMIN_NAV_SECTIONS) {
    for (const item of section.items) {
      considerName(item.name, item.href);
    }
  }
  return bestHref;
}

export function inferTargetHrefFromGoal(goal: string): string | null {
  const g = goal.toLowerCase().replace(/\s+/g, " ");

  if (/\bstores\b/i.test(g)) {
    return STORES_HREF;
  }
  if (
    /\bstore\b/i.test(g) &&
    !/\b(store\s+settings?|online\s+store|store\s+wise|store\s+analytics|e-?commerce)\b/i.test(
      g,
    )
  ) {
    return STORES_HREF;
  }
  if (/\b(business\s+settings?|company\s+settings?)\b/i.test(g)) {
    return BUSINESS_SETTINGS_HREF;
  }

  const wholeWord = hrefForWholeWordNavName(goal);
  if (wholeWord) return wholeWord;

  let bestHref: string | null = null;
  let bestScore = 0;

  const consider = (
    name: string,
    href: string,
    keywords?: string[],
  ) => {
    const score = scoreNavMatch(g, name, href, keywords);
    if (score > 0 && score > bestScore) {
      bestHref = href;
      bestScore = score;
    }
  };

  consider(
    ADMIN_DASHBOARD_ITEM.name,
    ADMIN_DASHBOARD_ITEM.href,
    ADMIN_DASHBOARD_ITEM.keywords,
  );
  for (const section of ADMIN_NAV_SECTIONS) {
    for (const item of section.items) {
      consider(item.name, item.href, item.keywords);
    }
  }
  return bestHref;
}

function sectionLabelForHref(href: string): string | null {
  for (const section of ADMIN_NAV_SECTIONS) {
    if (section.items.some((item) => item.href === href)) {
      return section.label;
    }
  }
  return null;
}

function pageNameForHref(href: string): string | null {
  for (const section of ADMIN_NAV_SECTIONS) {
    const item = section.items.find((i) => i.href === href);
    if (item) return item.name;
  }
  return null;
}

export function isNavSectionExpandedForGoal(
  goal: string,
  sidebar: AdminSidebarChrome,
): boolean | null {
  const href = inferTargetHrefFromGoal(goal);
  if (!href) return null;
  const sectionLabel = sectionLabelForHref(href);
  if (!sectionLabel) return null;
  const state = sidebar.sectionStates.find((s) => s.label === sectionLabel);
  if (!state) return null;
  return state.expanded;
}

/** Goal-aware hint so the model knows whether to expand a section before a page link. */
export function formatNavGoalAccessHint(
  goal: string,
  sidebar?: AdminSidebarChrome,
): string {
  if (!sidebar || sidebar.mobileDrawerClosed) return "";

  const href = inferTargetHrefFromGoal(goal);
  if (!href) return "";
  const sectionLabel = sectionLabelForHref(href);
  const pageName = pageNameForHref(href);
  if (!sectionLabel || !pageName) return "";

  const state = sidebar.sectionStates.find((s) => s.label === sectionLabel);
  const expanded = state?.expanded ?? false;

  if (sidebar.railCollapsed) {
    if (!expanded) {
      return `Nav goal: “${pageName}” is under ${sectionLabel}. Section flyout is CLOSED — point at the ${sectionLabel} section icon first (not the page link).`;
    }
    if (sidebar.flyoutSectionLabel && sidebar.flyoutSectionLabel !== sectionLabel) {
      return `Nav goal: “${pageName}” is under ${sectionLabel}. Another flyout is open — point at ${sectionLabel} section icon first.`;
    }
    return `Nav goal: “${pageName}” — ${sectionLabel} flyout is OPEN; the page link should be in the control list.`;
  }

  if (!expanded) {
    return `Nav goal: “${pageName}” is under ${sectionLabel}. Section is CLOSED — point at the “${sectionLabel}” section header to expand before the nested link.`;
  }
  return `Nav goal: “${pageName}” — ${sectionLabel} section is OPEN; nested link should be in the control list.`;
}

export function shouldPreferNavSectionTrigger(
  goal: string,
  path: string,
  sidebar?: AdminSidebarChrome,
): boolean {
  if (!sidebar) return false;
  if (sidebar.mobileDrawerClosed) return false;
  const href = inferTargetHrefFromGoal(goal);
  if (!href) return false;
  if (isOnTargetHref(path, href)) return false;

  const sectionLabel = sectionLabelForHref(href);
  if (!sectionLabel) return false;

  const expanded = isNavSectionExpandedForGoal(goal, sidebar);
  if (expanded === false) return true;

  if (sidebar.railCollapsed && sidebar.flyoutSectionLabel && sidebar.flyoutSectionLabel !== sectionLabel) {
    return true;
  }

  if (!sidebar.railCollapsed && !sidebar.openSectionLabels.includes(sectionLabel)) {
    return true;
  }

  return false;
}

export function isElementVisuallyShown(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number(style.opacity) === 0
  ) {
    return false;
  }
  const r = el.getBoundingClientRect();
  return r.width >= 8 && r.height >= 8 && r.bottom > 0 && r.top < window.innerHeight;
}

/** Visible sidebar/flyout link for a route — geometry only, no aria/chrome heuristics. */
export function findVisibleNavLink(href: string): HTMLAnchorElement | null {
  const want = pathWithoutQuery(href).replace(/\/$/, "") || "/";
  const links = document.querySelectorAll<HTMLAnchorElement>(
    "[data-bh-admin-sidebar] a[href], [data-bh-sidebar-flyout] a[href]",
  );
  for (const el of links) {
    const got =
      pathWithoutQuery(el.getAttribute("href") || "").replace(/\/$/, "") || "/";
    if (got !== want) continue;
    if (!isElementVisuallyShown(el)) continue;
    if (!isElementExposedInNavChrome(el)) continue;
    return el;
  }
  return null;
}

export function isSidebarChromeElement(el: HTMLElement): boolean {
  return Boolean(
    el.closest("[data-bh-admin-sidebar], [data-bh-sidebar-flyout]"),
  );
}

export type GuideNavPick = {
  kind: "page-link" | "section" | "create" | "done";
  el?: HTMLElement;
};

/**
 * DOM is the source of truth. If the page link is on screen, use it.
 * Only point at a section header when that link is not visible.
 */
export function pickGuideNavTarget(
  goal: string,
  currentPath: string,
  intentKind: string,
): GuideNavPick | null {
  const href = inferTargetHrefFromGoal(goal);
  if (!href) return null;

  if (isOnTargetHref(currentPath, href)) {
    if (intentKind === "open_page") return { kind: "done" };
    const create = findCreateActionOnPage();
    if (create) return { kind: "create", el: create };
    return { kind: "done" };
  }

  const pageLink = findVisibleNavLink(href);
  if (pageLink && isElementExposedInNavChrome(pageLink)) {
    return { kind: "page-link", el: pageLink };
  }

  const section = findSectionTriggerForGuideGoal(goal);
  if (section) return { kind: "section", el: section };

  return null;
}

export function findCreateActionOnPage(): HTMLElement | null {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(
      "main button, main a, main [role='button']",
    ),
  );
  for (const el of nodes) {
    if (!isShownEnough(el)) continue;
    const text = (
      el.getAttribute("aria-label") ||
      el.textContent ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
    if (
      /^(new|create|add)\b/i.test(text) ||
      /\b(add your first|new item|new invoice|new bill|new expense|create one)\b/i.test(
        text,
      )
    ) {
      return el;
    }
  }
  return null;
}

export function isNavSectionButton(el: HTMLElement): boolean {
  return el.matches("button[data-bh-nav-section]");
}

/** When flyout/section is closed, point at the section icon that opens it. */
export function findSectionTriggerForGuideGoal(goal: string): HTMLElement | null {
  const href = inferTargetHrefFromGoal(goal);
  if (!href) return null;

  let sectionLabel: string | null = null;
  for (const section of ADMIN_NAV_SECTIONS) {
    if (section.items.some((item) => item.href === href)) {
      sectionLabel = section.label;
      break;
    }
  }
  if (!sectionLabel) return null;

  const root = getAdminSidebarElement();
  const btn = root?.querySelector<HTMLElement>(
    `button[data-bh-nav-section="${CSS.escape(sectionLabel)}"]`,
  );
  if (!btn || !isShownEnough(btn)) return null;
  return btn;
}

export function tagElementForGuide(el: HTMLElement): string {
  const existing = el.getAttribute(AI_ID_ATTR);
  if (existing) return existing;
  const label = el.getAttribute("data-bh-nav-section") ?? "nav";
  const id = `e${label.replace(/\W+/g, "").toLowerCase().slice(0, 12)}`;
  el.setAttribute(AI_ID_ATTR, id);
  return id;
}
