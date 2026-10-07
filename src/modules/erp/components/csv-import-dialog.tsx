"use client";

import { useRef, useState, useTransition } from "react";
import { Download, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { downloadCsvFile, rowsToCsv } from "@/lib/csv/csv-utils";
import { adminPost } from "@/modules/admin/lib/admin-api-client";
import {
  CSV_IMPORT_CONFIGS,
  type CsvImportEntity,
} from "@/modules/erp/lib/csv-import-configs";

export function CsvImportDialog({
  entity,
  open,
  onOpenChange,
  storeId,
  onSuccess,
}: {
  entity: CsvImportEntity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId?: string;
  onSuccess?: () => void;
}) {
  const config = CSV_IMPORT_CONFIGS[entity];
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);

  function downloadSample() {
    const csv = rowsToCsv(config.sampleHeaders, [config.sampleRow]);
    downloadCsvFile(`${entity}-sample.csv`, csv);
  }

  function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    setResult(null);

    startTransition(async () => {
      try {
        const text = await file.text();
        const res = await adminPost<{ imported: number; errors: string[] }>(
          `erp/import/${entity}`,
          { csv: text, storeId },
        );
        setResult(res);
        if (res.imported > 0) onSuccess?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Button type="button" variant="outline" size="sm" onClick={downloadSample}>
            <Download data-icon="inline-start" />
            Download sample CSV
          </Button>

          <div className="rounded-md border border-dashed p-4 text-center">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                handleFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
            >
              <Upload data-icon="inline-start" />
              {pending ? "Importing…" : "Choose CSV file"}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Required columns: {config.sampleHeaders.join(", ")}
            </p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {result ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Imported {result.imported} row(s).</p>
              {result.errors.length > 0 ? (
                <ul className="mt-2 max-h-32 list-disc space-y-1 overflow-y-auto pl-4 text-destructive">
                  {result.errors.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
