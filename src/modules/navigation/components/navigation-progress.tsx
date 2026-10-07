"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

import { setNavigationProgressActive } from "@/modules/navigation/lib/async-progress";

function NavigationProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const prevKey = useRef(routeKey);

  useEffect(() => {
    if (prevKey.current !== routeKey) {
      setNavigationProgressActive(false);
      prevKey.current = routeKey;
    }
  }, [routeKey]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest("a[href]");
      if (!el) return;
      const a = el as HTMLAnchorElement;
      if (a.target && a.target !== "_self") return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.hasAttribute("download")) return;
      try {
        const next = new URL(a.href);
        if (next.origin !== window.location.origin) return;
        const here = `${window.location.pathname}${window.location.search}`;
        const dest = `${next.pathname}${next.search}`;
        if (dest === here) return;
        setNavigationProgressActive(true);
      } catch {
        /* ignore invalid href */
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  useEffect(() => {
    return () => setNavigationProgressActive(false);
  }, [routeKey]);

  return null;
}

/** Drives header refresh status during internal link navigations. */
export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  );
}
