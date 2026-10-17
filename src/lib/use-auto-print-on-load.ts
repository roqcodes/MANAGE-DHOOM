"use client";

import { useEffect, useRef } from "react";

import { printDocumentElement } from "@/lib/print-document";

/** Triggers the browser print dialog once the document is ready (`?print=1`). */
export function useAutoPrintOnLoad(
  enabled: boolean,
  selector = "[data-print-document]",
) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled || firedRef.current) return;
    firedRef.current = true;
    const timer = window.setTimeout(() => {
      const element = document.querySelector(selector);
      if (element instanceof HTMLElement) {
        printDocumentElement(element);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [enabled, selector]);
}
