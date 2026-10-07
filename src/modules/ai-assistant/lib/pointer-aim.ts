import {
  ARROW_INSET,
  ARROW_SVG_SIZE,
  POINTER_SIZE,
  POINTER_TILT_DEG,
} from "../components/AcrylicPointer";

/** Arrow tip in SVG viewBox (apex at x=22, y=5). */
export const TIP_VIEWBOX = { x: 22, y: 5 };
export const VIEWBOX_SIZE = 44;

export type PointerFace = "left" | "right";

/**
 * Tip position (px) from the top-left of the fixed POINTER_SIZE container.
 * Uses the same transform stack as Framer on the arrow layer.
 */
export function getPointerTipOffset(face: PointerFace): { x: number; y: number } {
  const tipX = (TIP_VIEWBOX.x / VIEWBOX_SIZE) * ARROW_SVG_SIZE;
  const tipY = (TIP_VIEWBOX.y / VIEWBOX_SIZE) * ARROW_SVG_SIZE;
  const cx = ARROW_SVG_SIZE / 2;
  const cy = ARROW_SVG_SIZE / 2;

  const rotateDeg = POINTER_TILT_DEG;
  let m = new DOMMatrix()
    .translate(ARROW_INSET, ARROW_INSET)
    .translate(cx, cy)
    .rotate(rotateDeg);

  if (face === "right") {
    m = m.scale(-1, 1);
  }

  m = m.translate(-cx, -cy);

  const p = new DOMPoint(tipX, tipY).matrixTransform(m);
  return { x: p.x, y: p.y };
}

/** Rect used for horizontal/vertical aim (sidebar label cap when available). */
export function getGuideAimRect(el: HTMLElement): DOMRect {
  const inNav = el.closest(
    '[data-bh-admin-sidebar="true"], [data-bh-sidebar-flyout="true"]',
  );
  if (inNav) {
    const textEl =
      el.querySelector<HTMLElement>("span.truncate") ??
      el.querySelector<HTMLElement>("span:not(.sr-only)");
    if (textEl) {
      const textRect = textEl.getBoundingClientRect();
      if (textRect.height >= 4 && textRect.width >= 4) {
        return textRect;
      }
    }
  }
  return el.getBoundingClientRect();
}

const TOUCH_OVERLAP_PX = 2;

export function pointerAimForRect(rect: DOMRect, face: PointerFace) {
  const tip = getPointerTipOffset(face);
  const aimY = rect.top + rect.height / 2;

  const aimX =
    face === "left"
      ? rect.right - TOUCH_OVERLAP_PX
      : rect.left + TOUCH_OVERLAP_PX;

  return {
    x: aimX - tip.x,
    y: aimY - tip.y,
  };
}

export { POINTER_SIZE };
