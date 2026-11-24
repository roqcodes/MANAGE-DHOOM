"use client";

import { AppLoadingState } from "@/modules/feedback/components/app-loading-state";

export function AdminWorkspaceTabLoading({ label = "Loading workspace" }: { label?: string }) {
  return (
    <div className="mx-auto w-full max-w-[min(100%,90rem)] px-3 sm:px-5">
      <AppLoadingState label={label} variant="section" className="min-h-[36vh]" />
    </div>
  );
}