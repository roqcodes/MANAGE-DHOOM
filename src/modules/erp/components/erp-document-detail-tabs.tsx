"use client";

import { cn } from "@/lib/utils";

export type ErpDocumentTab = "details" | "journals" | "activity";

type ErpDocumentDetailTabsProps = {
  detailsLabel: string;
  activeTab: ErpDocumentTab;
  onTabChange: (tab: ErpDocumentTab) => void;
  showJournals?: boolean;
};

export function ErpDocumentDetailTabs({
  detailsLabel,
  activeTab,
  onTabChange,
  showJournals = true,
}: ErpDocumentDetailTabsProps) {
  const tabs: Array<{ id: ErpDocumentTab; label: string }> = [
    { id: "details", label: detailsLabel.toUpperCase() },
  ];

  if (showJournals) {
    tabs.push({ id: "journals", label: "JOURNALS" });
  }

  tabs.push({ id: "activity", label: "ACTIVITY LOG & HISTORY" });

  return (
    <div className="flex flex-wrap gap-0 border-b border-border bg-muted/20">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "border-b-2 px-4 py-2.5 text-[11px] font-semibold tracking-wide transition-colors",
            activeTab === tab.id
              ? "border-primary bg-background text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
