"use client";

import type { ReactNode } from "react";

import { AdminAppShell } from "@/modules/admin/components/admin-app-shell";
import { AdminQueryProvider } from "@/modules/admin/providers/admin-query-provider";
import { AdminLoadDebugPreferenceProvider } from "@/modules/navigation/context/AdminLoadDebugPreferenceContext";
import { ErpOutboxSyncRuntime } from "@/modules/pwa/components/erp-outbox-sync-runtime";
import { OutboxActivityRoot } from "@/modules/pwa/components/outbox-activity-root";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminQueryProvider>
      <AdminLoadDebugPreferenceProvider>
        <OutboxActivityRoot>
          <AdminAppShell>{children}</AdminAppShell>
          <ErpOutboxSyncRuntime />
        </OutboxActivityRoot>
      </AdminLoadDebugPreferenceProvider>
    </AdminQueryProvider>
  );
}
