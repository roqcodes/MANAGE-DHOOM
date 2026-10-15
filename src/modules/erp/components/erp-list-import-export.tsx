"use client";

import { useState } from "react";
import { Upload } from "lucide-react";

import { DataExportMenu } from "@/components/export/data-export-menu";
import { Button } from "@/components/ui/button";
import type { TabularExportSource } from "@/lib/export/tabular-export";
import { CsvImportDialog } from "@/modules/erp/components/csv-import-dialog";
import type { CsvImportEntity } from "@/modules/erp/lib/csv-import-configs";

export function ErpListImportExport({
  entity,
  storeId,
  exportHeaders,
  exportRows,
  exportFilename,
  onImported,
}: {
  entity: CsvImportEntity;
  storeId?: string;
  exportHeaders: string[];
  exportRows: Record<string, unknown>[];
  exportFilename: string;
  onImported?: () => void;
}) {
  const [importOpen, setImportOpen] = useState(false);

  const exportSource: TabularExportSource = {
    baseFilename: exportFilename.replace(/\.csv$/i, ""),
    getTabular: () => {
      if (exportRows.length === 0) return null;
      return {
        headers: exportHeaders,
        rows: exportRows.map((row) =>
          exportHeaders.map((header) => String(row[header] ?? "")),
        ),
      };
    },
  };

  return (
    <>
      <DataExportMenu
        source={exportSource}
        disabled={exportRows.length === 0}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
        <Upload data-icon="inline-start" />
        Import
      </Button>
      <CsvImportDialog
        entity={entity}
        open={importOpen}
        onOpenChange={setImportOpen}
        storeId={storeId}
        onSuccess={onImported}
      />
    </>
  );
}
