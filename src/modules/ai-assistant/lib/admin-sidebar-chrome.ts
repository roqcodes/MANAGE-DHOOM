export const ADMIN_SIDEBAR_SELECTOR = '[data-bh-admin-sidebar="true"]';

const MD_MIN_WIDTH = 768;
/** Between icon rail (~72px) and expanded sidebar (~232px). */
const RAIL_WIDTH_THRESHOLD = 112;

export type NavSectionChromeState = {
  label: string;
  /** Child page links are visible (expanded section or open flyout). */
  expanded: boolean;
};

export type AdminSidebarChrome = {
  railCollapsed: boolean;
  openSectionLabels: string[];
  flyoutSectionLabel: string | null;
  /** Per-section open/closed from aria-expanded + visible flyouts. */
  sectionStates: NavSectionChromeState[];
  /** Mobile drawer closed — nav tree off-screen. */
  mobileDrawerClosed?: boolean;
};

export function isMdViewport(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia(`(min-width: ${MD_MIN_WIDTH}px)`).matches;
}

export function getAdminSidebarElement(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(ADMIN_SIDEBAR_SELECTOR);
}

function isElementShown(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (style.pointerEvents === "none") return false;
  const opacity = Number(style.opacity);
  if (!Number.isNaN(opacity) && opacity < 0.08) return false;
  const rect = el.getBoundingClientRect();
  return rect.width >= 8 && rect.height >= 8;
}

/**
 * Icon rail vs expanded sidebar — uses layout width on desktop, not data-attribute alone
 * (attribute can disagree with rendered width after CSS / hydration).
 */
export function isAdminSidebarRailCollapsed(aside: HTMLElement): boolean {
  const rect = aside.getBoundingClientRect();
  const mdUp = isMdViewport();

  if (!mdUp) {
    // Drawer mostly off-screen when closed
    return rect.right < 48;
  }

  if (rect.width >= RAIL_WIDTH_THRESHOLD) return false;
  if (rect.width > 0 && rect.width < RAIL_WIDTH_THRESHOLD) return true;

  return aside.getAttribute("data-bh-sidebar-collapsed") === "true";
}

function readSectionStates(
  aside: HTMLElement,
  railCollapsed: boolean,
): NavSectionChromeState[] {
  const states: NavSectionChromeState[] = [];

  aside
    .querySelectorAll<HTMLElement>("button[data-bh-nav-section]")
    .forEach((btn) => {
      const label = btn.getAttribute("data-bh-nav-section")?.trim();
      if (!label) return;

      let expanded = btn.getAttribute("aria-expanded") === "true";

      if (railCollapsed) {
        const flyout = document.querySelector<HTMLElement>(
          `[data-bh-sidebar-flyout="true"][data-bh-flyout-section="${CSS.escape(label)}"]`,
        );
        expanded = Boolean(flyout && isElementShown(flyout));
      }

      states.push({ label, expanded });
    });

  return states;
}

export function readAdminSidebarChrome(): AdminSidebarChrome | undefined {
  const aside = getAdminSidebarElement();
  if (!aside) return undefined;

  const mdUp = isMdViewport();
  const rect = aside.getBoundingClientRect();
  const mobileDrawerClosed = !mdUp && rect.right < 48;
  const railCollapsed = isAdminSidebarRailCollapsed(aside);

  const openSectionLabels: string[] = [];
  if (!railCollapsed && !mobileDrawerClosed) {
    aside
      .querySelectorAll<HTMLElement>(
        "button[data-bh-nav-section][aria-expanded='true']",
      )
      .forEach((btn) => {
        const label = btn.getAttribute("data-bh-nav-section");
        if (label) openSectionLabels.push(label);
      });
  }

  let flyoutSectionLabel: string | null = null;
  if (railCollapsed) {
    const flyouts = aside.querySelectorAll<HTMLElement>(
      "[data-bh-sidebar-flyout='true']",
    );
    for (const flyout of flyouts) {
      if (!isElementShown(flyout)) continue;
      flyoutSectionLabel =
        flyout.getAttribute("data-bh-flyout-section")?.trim() || null;
      if (flyoutSectionLabel) break;
    }
  }

  const sectionStates = mobileDrawerClosed
    ? []
    : readSectionStates(aside, railCollapsed);

  return {
    railCollapsed,
    openSectionLabels,
    flyoutSectionLabel,
    sectionStates,
    mobileDrawerClosed: mobileDrawerClosed || undefined,
  };
}

export function formatSidebarChromeForModel(
  sidebar: AdminSidebarChrome | undefined,
): string {
  if (!sidebar) return "";

  if (sidebar.mobileDrawerClosed) {
    return (
      "Sidebar: mobile navigation drawer is CLOSED. Point at the header menu button (panel icon) to open the nav drawer first, then the page link."
    );
  }

  const sectionLine = formatSectionStatesLine(sidebar.sectionStates);

  if (sidebar.railCollapsed) {
    if (sidebar.flyoutSectionLabel) {
      return [
        `Sidebar: COLLAPSED icon rail. Flyout open for “${sidebar.flyoutSectionLabel}” — page links in sidebar-flyout region are visible.`,
        sectionLine,
      ].join("\n");
    }
    return [
      "Sidebar: COLLAPSED icon rail. Nested page links are NOT in the control list until a section flyout is open — point at the section icon (data-bh-nav-section) first.",
      sectionLine,
    ].join("\n");
  }

  if (sidebar.openSectionLabels.length === 0) {
    return [
      "Sidebar: EXPANDED (full width). All nav sections are FOLDED — nested page links are NOT in the control list until a section header is expanded.",
      sectionLine,
    ].join("\n");
  }

  return [
    `Sidebar: EXPANDED (full width). Open sections: ${sidebar.openSectionLabels.join(", ")}.`,
    sectionLine,
  ].join("\n");
}

function formatSectionStatesLine(states: NavSectionChromeState[]): string {
  if (states.length === 0) return "";
  const parts = states.map((s) => `${s.label}=${s.expanded ? "open" : "closed"}`);
  return `Nav sections (open=child links visible in list): ${parts.join("; ")}`;
}
