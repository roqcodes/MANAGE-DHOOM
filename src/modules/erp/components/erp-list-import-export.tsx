"use client";

import { useState } from "react";
import { Download, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { downloadCsvFile, rowsToCsv } from "@/lib/csv/csv-utils";
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

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          downloadCsvFile(exportFilename, rowsToCsv(exportHeaders, exportRows))
        }
      >
        <Download data-icon="inline-start" />
        Export
      </Button>
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
