"use client";

import type { ReactNode } from "react";

import { OutboxActivityPreferenceProvider } from "@/modules/pwa/context/OutboxActivityPreferenceContext";
import { OutboxActivityDock } from "@/modules/pwa/components/outbox-activity-dock";

export function OutboxActivityRoot({ children }: { children: ReactNode }) {
  return (
    <OutboxActivityPreferenceProvider>
      {children}
      <OutboxActivityDock />
    </OutboxActivityPreferenceProvider>
  );
}
