import type { GoalIntent } from "./goal-intent";
import { goalEntityHints, pathEntityHint } from "./goal-intent";
import type { ScreenSnapshot } from "./screen-snapshot";

export type LiveUiState = {
  path: string;
  /** `form` query param when present (e.g. new, edit). */
  formQuery: string | null;
  modalOpen: boolean;
  modalTitle: string | null;
  inlineFormOpen: boolean;
  dialogControlCount: number;
  /** Visible listbox / combobox popup (don't navigate away mid-pick). */
  openOverlayMenu: boolean;
  /** Short facts the model must treat as ground truth. */
  facts: string[];
};

const CLOSE_LABEL_RE =
  /^(close|cancel|dismiss|back|×|x|done|discard|not now)$/i;

function readModalTitle(): string | null {
  if (typeof document === "undefined") return null;
  const titleEl = document.querySelector<HTMLElement>(
    "[data-slot='dialog-title'], [role='dialog'] h2, [role='dialog'] [data-slot='dialog-title']",
  );
  const text = titleEl?.innerText?.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 120) : null;
}

const AI_ROOT_SELECTOR = ".ai-assistant-root";

function isBlockingVisibleOverlay(el: HTMLElement): boolean {
  if (el.closest(AI_ROOT_SELECTOR)) return false;
  if (el.closest('[data-bh-sidebar-flyout="true"]')) return false;
  if (el.closest("aside, [data-bh-admin-sidebar]")) return false;

  if (el.getAttribute("aria-hidden") === "true") return false;
  if (el.hasAttribute("hidden")) return false;

  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (style.pointerEvents === "none") return false;

  const opacity = Number(style.opacity);
  if (!Number.isNaN(opacity) && opacity < 0.08) return false;

  const rect = el.getBoundingClientRect();
  return rect.width >= 8 && rect.height >= 8;
}

/** True only when a visible dropdown/listbox is open (not closed menus still in the DOM). */
function hasOpenOverlayMenu(): boolean {
  if (typeof document === "undefined") return false;

  const selectors = [
    "[data-slot='dropdown-menu-content'][data-open]",
    "[role='listbox']",
    "[role='menu']",
  ];

  for (const selector of selectors) {
    const nodes = document.querySelectorAll<HTMLElement>(selector);
    for (const el of nodes) {
      if (isBlockingVisibleOverlay(el)) return true;
    }
  }
  return false;
}

function parseFormQuery(path: string): string | null {
  try {
    const q = path.includes("?") ? path.split("?")[1] : "";
    const params = new URLSearchParams(q);
    return params.get("form");
  } catch {
    return null;
  }
}

export function captureLiveUiState(screen: ScreenSnapshot): LiveUiState {
  const path = screen.path;
  const formQuery = parseFormQuery(path);
  const dialogEls = screen.elements.filter((el) => el.region === "dialog");
  const modalOpen =
    dialogEls.length > 0 ||
    (typeof document !== "undefined" &&
      Boolean(
        document.querySelector(
          "[role='dialog']:not([hidden]), [data-slot='dialog-content']",
        ),
      ));
  const modalTitle = readModalTitle();
  const inlineFormOpen = formQuery === "new" || formQuery === "edit";
  const openOverlayMenu = hasOpenOverlayMenu();

  const facts: string[] = [];
  if (modalOpen) {
    facts.push(
      modalTitle
        ? `A modal/dialog is OPEN (title: “${modalTitle}”). Background page controls are not the focus.`
        : "A modal/dialog is OPEN. Background page controls are not the focus.",
    );
  }
  if (inlineFormOpen) {
    facts.push(
      `URL has form=${formQuery} — an inline create/edit panel is open on this page.`,
    );
  }
  if (openOverlayMenu) {
    facts.push(
      "A dropdown or menu overlay is open — finish or dismiss it before other navigation.",
    );
  }
  if (!modalOpen && !inlineFormOpen && dialogEls.length === 0) {
    facts.push("No create/edit modal or inline form is open (list/page view).");
  }

  return {
    path,
    formQuery,
    modalOpen,
    modalTitle,
    inlineFormOpen,
    dialogControlCount: dialogEls.length,
    openOverlayMenu,
    facts,
  };
}

export function uiStateFromPath(path: string): Pick<LiveUiState, "formQuery" | "inlineFormOpen"> {
  const formQuery = parseFormQuery(path);
  return {
    formQuery,
    inlineFormOpen: formQuery === "new" || formQuery === "edit",
  };
}

function entitiesAlign(goal: string, path: string): boolean {
  const hints = goalEntityHints(goal);
  const pathHint = pathEntityHint(path);
  if (!pathHint || hints.length === 0) return true;
  return hints.some(
    (h) => pathHint === h || pathHint.startsWith(h) || h.startsWith(pathHint),
  );
}

function formSurfaceOpen(state: LiveUiState): boolean {
  return state.modalOpen || state.inlineFormOpen;
}

export function findDismissControlId(
  screen: ScreenSnapshot,
): { id: string; label: string } | null {
  const candidates = screen.elements.filter((el) => el.region === "dialog");
  for (const el of candidates) {
    const t = el.text.trim();
    if (CLOSE_LABEL_RE.test(t) || /close/i.test(t)) {
      return { id: el.id, label: t || "Close" };
    }
  }
  const footer = candidates.find(
    (el) =>
      el.tag === "button" &&
      /cancel|close|discard/i.test(el.text),
  );
  if (footer) return { id: footer.id, label: footer.text };
  return null;
}

export type UiGuideGuard =
  | { action: "continue" }
  | { action: "finish"; summary: string }
  | {
      action: "block";
      spoken: string;
      dismiss?: { id: string; label: string };
    };

/** Deterministic guard before calling the LLM on guide steps. */
export function evaluateUiGuideGuard(
  goal: string,
  intent: GoalIntent,
  screen: ScreenSnapshot,
  state: LiveUiState,
): UiGuideGuard {
  const surfaceOpen = formSurfaceOpen(state);
  const aligned = entitiesAlign(goal, state.path);

  if (intent.kind === "open_create" && surfaceOpen && aligned) {
    return {
      action: "finish",
      summary: intent.doneLog,
    };
  }

  if (intent.kind === "open_create" && surfaceOpen && !aligned) {
    const dismiss = findDismissControlId(screen);
    const other =
      state.modalTitle ||
      (state.inlineFormOpen ? "another form" : "a form");
    return {
      action: "block",
      spoken: `Close ${other} first — then I can help you with “${goal.trim()}”.`,
      dismiss: dismiss ?? undefined,
    };
  }

  if (
    (intent.kind === "open_page" || intent.kind === "generic") &&
    surfaceOpen &&
    !aligned
  ) {
    const dismiss = findDismissControlId(screen);
    return {
      action: "block",
      spoken:
        "A form or dialog is open — close or cancel it before we navigate somewhere else.",
      dismiss: dismiss ?? undefined,
    };
  }

  if (intent.kind === "explain_form" && !surfaceOpen) {
    return {
      action: "continue",
    };
  }

  return { action: "continue" };
}

export function formatLiveUiStateForModel(
  state: LiveUiState | undefined,
  options?: { goal?: string; intent?: GoalIntent },
): string {
  if (!state) return "";

  const lines = ["## Live UI state (ground truth — do not contradict)"];
  for (const fact of state.facts) {
    lines.push(`- ${fact}`);
  }

  const goal = options?.goal?.trim();
  const intent = options?.intent;
  if (goal && intent) {
    const surfaceOpen = formSurfaceOpen(state);
    const aligned = entitiesAlign(goal, state.path);

    if (surfaceOpen && !aligned) {
      lines.push(
        `- CONFLICT: User goal (“${goal}”) does not match the open form/dialog. Do NOT point at sidebar links or “New” on other modules. Ask them to close or cancel the open form first.`,
      );
      lines.push(
        "- If a Close/Cancel control appears in the dialog region of the control list, you may point at that single control; otherwise [POINT:none] and explain.",
      );
    } else if (intent.kind === "open_create" && surfaceOpen && aligned) {
      lines.push(
        "- Finish line already met: create UI is open for this goal. Confirm briefly and use [POINT:none].",
      );
    } else if (surfaceOpen && intent.kind === "open_page") {
      lines.push(
        "- A form/dialog is open. If they only wanted a list page, they may already be on the right route — do not open another create flow. If they need a different page, tell them to close the form first.",
      );
    } else if (intent.kind === "explain_form" && !surfaceOpen) {
      lines.push(
        "- User asked about form fields but no create/edit UI is open. Point at the correct “New” / “Add” action for their entity, not at imaginary fields.",
      );
    }
  }

  lines.push(
    "- Never claim a button, field, or screen exists unless its id is in the visible controls list.",
  );
  lines.push(
    "- Never invent control ids, routes, or menu items. If unsure, say what is missing and use [POINT:none].",
  );

  return lines.join("\n");
}
