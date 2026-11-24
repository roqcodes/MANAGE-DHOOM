"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { ActivityLogPanel } from "@/modules/erp/components/activity-log-panel";
import {
  ErpDocumentDetailTabs,
  type ErpDocumentTab,
} from "@/modules/erp/components/erp-document-detail-tabs";
import { JournalLinesPanel } from "@/modules/erp/components/journal-lines-panel";
import {
  AdminDetailBodySkeleton,
  AdminPanelSkeleton,
} from "@/modules/admin/components/admin-page-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ErpDocumentTabsLayoutProps = {
  detailsLabel: string;
  entityId: string;
  auditEntityType: string;
  journalSourceType?: string;
  showJournals?: boolean;
  children: ReactNode;
};

export function ErpDocumentTabsLayout({
  detailsLabel,
  entityId,
  auditEntityType,
  journalSourceType,
  showJournals = true,
  children,
}: ErpDocumentTabsLayoutProps) {
  const [tab, setTab] = useState<ErpDocumentTab>("details");
  const [switching, setSwitching] = useState(false);
  const switchGeneration = useRef(0);
  const journalsEnabled = showJournals && Boolean(journalSourceType);

  const finishSwitchIfCurrent = useCallback((generation: number) => {
    if (generation === switchGeneration.current) {
      setSwitching(false);
    }
  }, []);

  const handleTabChange = useCallback(
    (next: ErpDocumentTab) => {
      if (next === tab || switching) return;
      switchGeneration.current += 1;
      setSwitching(true);
      setTab(next);
    },
    [tab, switching],
  );

  const handleAsyncPanelLoading = useCallback(
    (loading: boolean) => {
      if (!loading) {
        finishSwitchIfCurrent(switchGeneration.current);
      }
    },
    [finishSwitchIfCurrent],
  );

  useEffect(() => {
    if (tab !== "details" || !switching) return;
    const generation = switchGeneration.current;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        finishSwitchIfCurrent(generation);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [tab, switching, finishSwitchIfCurrent]);

  const tabPanel = (
    <>
      {tab === "details" ? children : null}

      {tab === "journals" && journalSourceType ? (
        <Card>
          <CardContent className="p-0">
            <JournalLinesPanel
              sourceType={journalSourceType}
              sourceId={entityId}
              onLoadingChange={handleAsyncPanelLoading}
            />
          </CardContent>
        </Card>
      ) : null}

      {tab === "activity" ? (
        <Card>
          <CardHeader>
            <CardTitle>Activity log</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityLogPanel
              entityType={auditEntityType}
              entityId={entityId}
              onLoadingChange={handleAsyncPanelLoading}
            />
          </CardContent>
        </Card>
      ) : null}
    </>
  );

  return (
    <>
      <ErpDocumentDetailTabs
        detailsLabel={detailsLabel}
        activeTab={tab}
        onTabChange={handleTabChange}
        showJournals={journalsEnabled}
        switching={switching}
      />

      <div className="relative min-h-[10rem]">
        {switching ? (
          <Card
            className="border border-border ring-0"
            aria-busy="true"
            aria-live="polite"
          >
            <CardContent className="p-5 sm:p-6">
              {tab === "details" ? (
                <AdminDetailBodySkeleton />
              ) : (
                <AdminPanelSkeleton rows={6} />
              )}
            </CardContent>
          </Card>
        ) : null}

        <div
          className={cn(
            switching &&
              "pointer-events-none invisible absolute inset-0 h-0 overflow-hidden opacity-0",
          )}
          aria-hidden={switching}
        >
          {tabPanel}
        </div>
      </div>
    </>
  );
}