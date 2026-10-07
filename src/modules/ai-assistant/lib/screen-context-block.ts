import type { ChatApiScreenInput } from "./chat-request-context";
import type { GoalIntent } from "./goal-intent";
import {
  formatLiveUiStateForModel,
  uiStateFromPath,
  type LiveUiState,
} from "./live-ui-state";
import type { ScreenElement, ScreenSnapshot } from "./screen-snapshot";

function resolveUiState(
  screen?: ChatApiScreenInput,
): LiveUiState | undefined {
  if (screen?.uiState) return screen.uiState;
  if (!screen?.path) return undefined;
  const partial = uiStateFromPath(screen.path);
  if (!partial.inlineFormOpen) return undefined;
  return {
    path: screen.path,
    formQuery: partial.formQuery,
    modalOpen: false,
    modalTitle: null,
    inlineFormOpen: true,
    dialogControlCount: 0,
    openOverlayMenu: false,
    facts: [
      `URL has form=${partial.formQuery} — an inline create/edit panel is likely open.`,
    ],
  };
}

export type ScreenContextOptions = {
  /** When false, only `extra` is returned (FAQ / generic chat — no path or UI state). */
  includeScreen?: boolean;
  goal?: string;
  intent?: GoalIntent;
};

export function screenContextBlock(
  screen?: ChatApiScreenInput,
  extra?: string,
  options?: ScreenContextOptions,
): string {
  const includeScreen = options?.includeScreen ?? Boolean(screen);

  if (!includeScreen) {
    return extra?.trim() ?? "";
  }

  const uiBlock = formatLiveUiStateForModel(resolveUiState(screen), {
    goal: options?.goal,
    intent: options?.intent,
  });

  if (!screen?.elements?.length) {
    return (
      [
        extra,
        uiBlock,
        screen?.path ? `Current page: ${screen.path}` : "",
      ]
        .filter(Boolean)
        .join("\n\n") || "Current UI: unknown."
    );
  }
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
    extra,
    uiBlock,
    `Live screen path: ${screen.path ?? "?"}`,
    `title: ${screen.title ?? "?"}`,
    screen.viewport
      ? `viewport: ${screen.viewport.w}x${screen.viewport.h}`
      : "",
    "visible controls (id | region | tag | label | extras | x,y):",
    ...rows,
  ]
    .filter(Boolean)
    .join("\n");
}

const REGION_PRIORITY: Record<string, number> = {
  dialog: 0,
  "sidebar-flyout": 1,
  sidebar: 2,
  form: 3,
  main: 4,
  table: 5,
  header: 6,
  page: 7,
};

/** Keep local model context small; prefer dialogs and nav over chrome. */
export function capScreenForLocalModel(
  screen: ScreenSnapshot,
  maxElements = 48,
): ScreenSnapshot {
  if (screen.elements.length <= maxElements) return screen;
  const sorted = [...screen.elements].sort(
    (a: ScreenElement, b: ScreenElement) =>
      (REGION_PRIORITY[a.region] ?? 9) - (REGION_PRIORITY[b.region] ?? 9),
  );
  return { ...screen, elements: sorted.slice(0, maxElements) };
}
