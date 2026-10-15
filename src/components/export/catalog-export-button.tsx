"use client";

import { DataExportMenu } from "@/components/export/data-export-menu";
import { Button } from "@/components/ui/button";
import type { TabularExportSource } from "@/lib/export/tabular-export";

export function CatalogExportButton({
  source,
  onFallbackExport,
}: {
  source?: TabularExportSource;
  onFallbackExport?: () => void;
}) {
  if (source) {
    return <DataExportMenu source={source} />;
  }
  if (onFallbackExport) {
    return (
      <Button variant="outline" size="sm" onClick={onFallbackExport}>
        Export
      </Button>
    );
  }
  return null;
}
