"use client";

import { useEffect } from "react";

import { handleFormEnterNavigation } from "@/lib/form-enter-navigation";

export function FormEnterNavigationProvider() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      handleFormEnterNavigation(event);
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return null;
}
