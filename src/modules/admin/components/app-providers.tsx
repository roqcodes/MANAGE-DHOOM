"use client";

import type { ReactNode } from "react";

import { FormEnterNavigationProvider } from "@/modules/admin/components/form-enter-navigation-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <>
      <FormEnterNavigationProvider />
      {children}
    </>
  );
}
