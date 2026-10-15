import { AppLoadingState } from "@/modules/feedback/components/app-loading-state";

/** Shared UI for route-level loading.tsx files — one place, reused across segments. */
export function GlobalLoadingFallback() {
  return <AppLoadingState label="Loading page" />;
}
