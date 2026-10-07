"use client";

import { useState } from "react";

import { ActivityLogPanel } from "@/modules/erp/components/activity-log-panel";
import {
  ErpDocumentDetailTabs,
  type ErpDocumentTab,
} from "@/modules/erp/components/erp-document-detail-tabs";
import { JournalLinesPanel } from "@/modules/erp/components/journal-lines-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ErpDocumentTabsLayoutProps = {
  detailsLabel: string;
  entityId: string;
  auditEntityType: string;
  journalSourceType?: string;
  showJournals?: boolean;
  children: React.ReactNode;
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
  const journalsEnabled = showJournals && Boolean(journalSourceType);

  return (
    <>
      <ErpDocumentDetailTabs
        detailsLabel={detailsLabel}
        activeTab={tab}
        onTabChange={setTab}
        showJournals={journalsEnabled}
      />

      {tab === "details" ? children : null}

      {tab === "journals" && journalSourceType ? (
        <Card>
          <CardContent className="p-0">
            <JournalLinesPanel sourceType={journalSourceType} sourceId={entityId} />
          </CardContent>
        </Card>
      ) : null}

      {tab === "activity" ? (
        <Card>
          <CardHeader>
            <CardTitle>Activity log</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityLogPanel entityType={auditEntityType} entityId={entityId} />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
