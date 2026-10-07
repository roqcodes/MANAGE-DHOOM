"use client";

import { useSyncExternalStore } from "react";

const MD_QUERY = "(min-width: 768px)";

function subscribeMd(onChange: () => void) {
  const mq = window.matchMedia(MD_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getMdSnapshot() {
  return window.matchMedia(MD_QUERY).matches;
}

/** SSR / first server render: mobile-first so layout matches before hydration. */
function getServerMdSnapshot() {
  return false;
}

/** `true` when viewport is `md` breakpoint and up (Tailwind `md:` = 768px). */
export function useIsMdUp(): boolean {
  return useSyncExternalStore(subscribeMd, getMdSnapshot, getServerMdSnapshot);
}
