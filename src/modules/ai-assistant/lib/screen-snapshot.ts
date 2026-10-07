import {
  formatSidebarChromeForModel,
  readAdminSidebarChrome,
  type AdminSidebarChrome,
} from "./admin-sidebar-chrome";
import { captureLiveUiState, type LiveUiState } from "./live-ui-state";
import {
  hrefForAdminNavItemName,
  isElementExposedInNavChrome,
} from "./sidebar-nav-visibility";

export { formatSidebarChromeForModel, readAdminSidebarChrome };
export type { AdminSidebarChrome };

export const AI_ID_ATTR = "data-bh-ai-id";
export const AI_ROOT_SELECTOR = ".ai-assistant-root";

export type ScreenElement = {
  id: string;
  tag: string;
  role: string;
  text: string;
  href?: string;
  type?: string;
  placeholder?: string;
  region: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ScreenSnapshot = {
  path: string;
  title: string;
  viewport: { w: number; h: number };
  elements: ScreenElement[];
  sidebar?: AdminSidebarChrome;
  uiState?: LiveUiState;
};

let lastSnapshot: ScreenSnapshot | null = null;

export function getLastSnapshot(): ScreenSnapshot | null {
  return lastSnapshot;
}

const TARGET_SELECTOR = [
  "a[href]",
  "button",
  "[role='button']",
  "[role='menuitem']",
  "[role='tab']",
  "[role='link']",
  "[role='option']",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "summary",
  "label",
].join(",");

function isInsideAssistant(el: Element): boolean {
  return Boolean(el.closest(AI_ROOT_SELECTOR));
}

export function isHeaderQuickCreateElement(el: Element): boolean {
  if (el.closest('[role="menu"][aria-label="Quick create"]')) return true;
  const trigger = el.closest('button[aria-label="Quick create"]');
  return Boolean(trigger && trigger.closest("header"));
}

export type CaptureScreenOptions = {
  includeHeaderQuickCreate?: boolean;
};

let lastCaptureOptions: CaptureScreenOptions = {};

export function getLastCaptureOptions(): CaptureScreenOptions {
  return lastCaptureOptions;
}

function isShown(el: HTMLElement): boolean {
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
  const rect = el.getBoundingClientRect();
  return rect.width >= 6 && rect.height >= 6;
}

function regionOf(el: HTMLElement): string {
  if (el.closest("[role='dialog'], [data-slot='dialog-content']")) return "dialog";
  if (el.closest("[data-bh-sidebar-flyout]")) return "sidebar-flyout";
  if (el.closest("aside, nav, [data-sidebar], [data-bh-admin-sidebar]")) {
    return "sidebar";
  }
  if (el.closest("header")) return "header";
  if (el.closest("form")) return "form";
  if (el.closest("table, [role='table']")) return "table";
  if (el.closest("main")) return "main";
  return "page";
}

function cleanText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 90);
}

export function labelFor(el: HTMLElement): string {
  const aria = el.getAttribute("aria-label");
  if (aria) return cleanText(aria);
  const navSection = el.getAttribute("data-bh-nav-section");
  if (navSection) return cleanText(navSection);
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return cleanText(el.placeholder || el.name || el.getAttribute("name") || "");
  }
  if (el instanceof HTMLSelectElement) {
    return cleanText(el.name || el.options[el.selectedIndex]?.text || "");
  }
  const title = el.getAttribute("title");
  if (title) return cleanText(title);
  return cleanText(el.innerText || el.textContent || "");
}

function clearPreviousIds(): void {
  document.querySelectorAll(`[${AI_ID_ATTR}]`).forEach((node) => {
    node.removeAttribute(AI_ID_ATTR);
  });
}

export function findTaggedElement(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${AI_ID_ATTR}="${id}"]`);
}

function normalizeLabel(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}

export function normalizeGuideHref(href: string): string {
  const raw = href.trim();
  if (!raw) return "";
  try {
    const path = raw.startsWith("http")
      ? new URL(raw).pathname
      : raw.split("?")[0].split("#")[0];
    if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
    return path;
  } catch {
    const path = raw.split("?")[0].split("#")[0];
    return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  }
}

export function hrefFromElement(el: HTMLElement): string | null {
  if (el instanceof HTMLAnchorElement) {
    return el.getAttribute("href");
  }
  const anchor = el.closest("a[href]");
  return anchor?.getAttribute("href") ?? null;
}

export function elementMatchesGuideLabel(
  el: HTMLElement,
  label: string,
): boolean {
  const needle = normalizeLabel(label);
  if (!needle) return true;
  return normalizeLabel(labelFor(el)) === needle;
}

export function findControlByHref(href: string): HTMLElement | null {
  const want = normalizeGuideHref(href);
  if (!want) return null;

  let fallback: HTMLElement | null = null;
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>("a[href]"),
  );

  for (const el of nodes) {
    if (isInsideAssistant(el) || !isShown(el)) continue;
    if (!isElementExposedInNavChrome(el)) continue;
    const h = el.getAttribute("href");
    if (!h || normalizeGuideHref(h) !== want) continue;
    fallback = el;
    const region = regionOf(el);
    if (region === "sidebar" || region === "sidebar-flyout") return el;
  }

  return fallback;
}

export function findControlByLabel(label: string): HTMLElement | null {
  const needle = normalizeLabel(label);
  if (!needle) return null;

  const navHref = hrefForAdminNavItemName(label);
  if (navHref) {
    const byHref = findControlByHref(navHref);
    if (byHref) return byHref;
  }

  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(TARGET_SELECTOR),
  );

  let best: { el: HTMLElement; score: number } | null = null;

  for (const el of nodes) {
    if (isInsideAssistant(el) || !isShown(el)) continue;
    if (!isElementExposedInNavChrome(el)) continue;
    const text = normalizeLabel(labelFor(el));
    if (!text) continue;

    let score = 0;
    if (text === needle) score = 1000;
    else if (text.startsWith(`${needle} `)) score = 900;
    else if (text.includes(needle)) {
      score = 400 - Math.min(300, text.length);
    } else continue;

    const region = regionOf(el);
    if (region === "sidebar" || region === "sidebar-flyout") score += 50;
    if (el instanceof HTMLAnchorElement && el.getAttribute("href")) score += 10;
    score -= Math.min(40, text.length);

    if (!best || score > best.score) best = { el, score };
  }

  return best?.el ?? null;
}

export type GuideTargetRef = {
  id?: string;
  label?: string;
  href?: string;
};

/**
 * Resolve the DOM node for a live guide step. Prefers stable href/label over
 * ephemeral snapshot ids (which change whenever the screen is re-scanned).
 */
export function resolveGuidedElement(point: GuideTargetRef): HTMLElement | null {
  const label = point.label?.replace(/\s+/g, " ").trim() ?? "";
  let href = point.href?.trim() ?? "";
  if (!href && label) {
    href = hrefForAdminNavItemName(label) ?? "";
  }

  if (href) {
    const byHref = findControlByHref(href);
    if (byHref) return byHref;
  }

  if (label) {
    const byLabel = findControlByLabel(label);
    if (byLabel) return byLabel;
  }

  if (point.id) {
    const byId = findTaggedElement(point.id);
    if (byId && (!label || elementMatchesGuideLabel(byId, label))) {
      return byId;
    }
  }

  if (label) {
    const sidebar = document.querySelector('[data-bh-admin-sidebar="true"]');
    const sectionBtn = sidebar?.querySelector<HTMLElement>(
      `button[data-bh-nav-section="${CSS.escape(label)}"]`,
    );
    if (sectionBtn && isShown(sectionBtn)) {
      return sectionBtn;
    }
  }

  return null;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function hasOpenDialog() {
  return Boolean(document.querySelector("[role='dialog'], [data-slot='dialog-content']"));
}

function currentRouteKey(): string {
  return window.location.pathname + window.location.search;
}

function isMainPageLoading(): boolean {
  const main = document.querySelector("main");
  if (!main) return true;
  if (main.querySelector(".animate-pulse.space-y-3")) return true;
  if (main.getAttribute("aria-busy") === "true") return true;
  return false;
}

/** True when the admin main area shows skeleton / busy state (guide should wait). */
export function isAdminPageUiLoading(): boolean {
  return isMainPageLoading();
}

function mainUiSignature(): string {
  const main = document.querySelector("main");
  if (!main) return "";
  const controls = main.querySelectorAll(
    "button, a[href], input:not([type='hidden']), select, textarea, table, [role='table']",
  ).length;
  const textLen = (main.textContent ?? "").replace(/\s+/g, " ").trim().length;
  return `${currentRouteKey()}|${controls}|${textLen}|${isMainPageLoading()}`;
}

/** Two matching snapshots in a row — UI stopped shifting. */
async function waitForMainUiStable(
  stableMs = 240,
  maxWaitMs = 4000,
): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  let last = "";
  let stableSince = 0;

  while (Date.now() < deadline) {
    const sig = mainUiSignature();
    const loading = isMainPageLoading();

    if (!loading && sig === last && sig.length > 0) {
      if (!stableSince) stableSince = Date.now();
      if (Date.now() - stableSince >= stableMs) return;
    } else {
      last = sig;
      stableSince = 0;
    }
    await wait(55);
  }
}

/**
 * Brief pause before re-scanning. Only blocks on skeletons / aria-busy — not every navigation.
 */
export async function waitForSettledUi(pathWhenClicked?: string): Promise<void> {
  const routeAtClick = pathWhenClicked ?? currentRouteKey();

  await wait(40);

  let routeChanged = false;
  if (pathWhenClicked !== undefined) {
    const navDeadline = Date.now() + 600;
    while (Date.now() < navDeadline) {
      if (currentRouteKey() !== routeAtClick) {
        routeChanged = true;
        break;
      }
      await wait(45);
    }
  }

  if (!isMainPageLoading()) {
    if (routeChanged) {
      await wait(80);
      if (!isMainPageLoading()) return;
    } else {
      return;
    }
  }

  if (typeof document !== "undefined" && document.readyState !== "complete") {
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      if (document.readyState === "complete") {
        done();
        return;
      }
      window.addEventListener("load", done, { once: true });
      window.setTimeout(done, 2000);
    });
  }

  const loadDeadline = Date.now() + 9000;
  while (Date.now() < loadDeadline) {
    if (hasOpenDialog()) {
      await wait(160);
      await waitForMainUiStable(200, 2500);
      return;
    }

    const main = document.querySelector("main");
    const hasContent = Boolean(
      main?.querySelector(
        "button, a[href], input:not([type='hidden']), table, [role='table']",
      ),
    );

    if (!isMainPageLoading() && hasContent) {
      await waitForMainUiStable(260, 4500);
      return;
    }

    await wait(70);
  }

  await waitForMainUiStable(180, 1500);
}

/** Path + sidebar section open/closed only (~low tokens, no control list). */
export function captureNavChromeSnapshot(): Pick<
  ScreenSnapshot,
  "path" | "title" | "sidebar"
> {
  return {
    path: window.location.pathname + window.location.search,
    title: document.title,
    sidebar: readAdminSidebarChrome(),
  };
}

export function captureScreenSnapshot(
  options?: CaptureScreenOptions,
): ScreenSnapshot {
  lastCaptureOptions = options ?? {};
  clearPreviousIds();

  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(TARGET_SELECTOR),
  );

  const scored: { el: HTMLElement; rect: DOMRect; text: string }[] = [];

  for (const el of nodes) {
    if (isInsideAssistant(el)) continue;
    if (
      !options?.includeHeaderQuickCreate &&
      isHeaderQuickCreateElement(el)
    ) {
      continue;
    }
    if (!isShown(el)) continue;
    if (!isElementExposedInNavChrome(el)) continue;
    const text = labelFor(el);
    const rect = el.getBoundingClientRect();
    const inView =
      rect.bottom > -80 &&
      rect.top < window.innerHeight + 80 &&
      rect.right > -80 &&
      rect.left < window.innerWidth + 80;
    const inNav = Boolean(
      el.closest(
        "aside, nav, [data-sidebar], [data-bh-admin-sidebar], [data-bh-sidebar-flyout]",
      ),
    );
    if (!inView && !inNav) continue;
    scored.push({ el, rect, text });
  }

  const elements: ScreenElement[] = [];
  let n = 1;
  for (const item of scored.slice(0, 90)) {
    const id = `e${n++}`;
    item.el.setAttribute(AI_ID_ATTR, id);
    const href =
      item.el instanceof HTMLAnchorElement
        ? item.el.getAttribute("href") || undefined
        : undefined;
    const type =
      item.el instanceof HTMLInputElement ? item.el.type : item.el.tagName.toLowerCase();

    elements.push({
      id,
      tag: item.el.tagName.toLowerCase(),
      role: item.el.getAttribute("role") || type,
      text: item.text || item.el.tagName.toLowerCase(),
      href,
      type: item.el instanceof HTMLInputElement ? item.el.type : undefined,
      placeholder:
        item.el instanceof HTMLInputElement || item.el instanceof HTMLTextAreaElement
          ? item.el.placeholder || undefined
          : undefined,
      region: regionOf(item.el),
      x: Math.round(item.rect.left),
      y: Math.round(item.rect.top),
      w: Math.round(item.rect.width),
      h: Math.round(item.rect.height),
    });
  }

  const snapshot: ScreenSnapshot = {
    path: window.location.pathname + window.location.search,
    title: document.title,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    elements,
    sidebar: readAdminSidebarChrome(),
  };
  snapshot.uiState = captureLiveUiState(snapshot);
  lastSnapshot = snapshot;
  return snapshot;
}

export function locatePointedElement(
  id: string,
  snapshot: ScreenSnapshot,
): { el: HTMLElement; id: string } | null {
  const wanted = snapshot.elements.find((e) => e.id === id);

  const direct = findTaggedElement(id);
  if (direct && wanted) {
    const textOk = labelFor(direct) === wanted.text;
    const hrefOk =
      wanted.href &&
      normalizeGuideHref(hrefFromElement(direct) ?? "") ===
        normalizeGuideHref(wanted.href);
    if (textOk || hrefOk) {
      return { el: direct, id };
    }
  } else if (direct && !wanted) {
    return { el: direct, id };
  }

  if (!wanted) return null;

  const fresh = captureScreenSnapshot(getLastCaptureOptions());
  const match =
    fresh.elements.find(
      (e) =>
        e.text === wanted.text &&
        e.region === wanted.region &&
        (e.href || "") === (wanted.href || ""),
    ) ||
    fresh.elements.find(
      (e) => e.text === wanted.text && e.region === wanted.region,
    ) ||
    fresh.elements.find((e) => e.text === wanted.text);

  if (!match) return null;

  const el =
    resolveGuidedElement({
      id: match.id,
      label: wanted.text,
      href: wanted.href,
    }) ?? findTaggedElement(match.id);

  const resolvedId = el?.getAttribute(AI_ID_ATTR) || match.id;
  return el ? { el, id: resolvedId } : null;
}

export function formatSnapshotForModel(screen: ScreenSnapshot): string {
  const rows = screen.elements.map((el) => {
    const bits = [
      el.id,
      el.region,
      el.tag,
      el.text,
      el.href ? `href=${el.href}` : "",
      el.placeholder ? `ph=${el.placeholder}` : "",
      `@${el.x},${el.y}`,
    ].filter(Boolean);
    return bits.join(" | ");
  });
  return [
    `path: ${screen.path}`,
    `title: ${screen.title}`,
    `viewport: ${screen.viewport.w}x${screen.viewport.h}`,
    "visible controls (id | region | tag | label | extras | x,y):",
    ...rows,
  ]
    .filter(Boolean)
    .join("\n");
}
