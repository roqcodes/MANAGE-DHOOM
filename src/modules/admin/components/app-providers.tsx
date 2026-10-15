"use client";

import type { ReactNode } from "react";

import { FormEnterNavigationProvider } from "@/modules/admin/components/form-enter-navigation-provider";
import { AppFeedbackProvider } from "@/modules/feedback/components/app-feedback-provider";
import { AppNetworkStatus } from "@/modules/feedback/components/app-network-status";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AppFeedbackProvider>
      <FormEnterNavigationProvider />
      <AppNetworkStatus />
      {children}
    </AppFeedbackProvider>
  );
}
