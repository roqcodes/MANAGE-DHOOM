import type { TabularExportSource } from "@/lib/export/tabular-export";
import { describeErpListFilters } from "@/lib/export/tabular-export";

export function buildCatalogExportSource(opts: {
  baseFilename: string;
  title: string;
  getSubtitle?: () => string;
  getTabular: () => { headers: string[]; rows: string[][] } | null;
}): TabularExportSource {
  return {
    baseFilename: opts.baseFilename,
    title: opts.title,
    getSubtitle: opts.getSubtitle,
    getTabular: opts.getTabular,
  };
}

export function catalogFilterSubtitle(parts: {
  search?: string;
  status?: string;
  storeLabel?: string;
  dateFrom?: string;
  dateTo?: string;
  extra?: string[];
}) {
  return describeErpListFilters(parts);
}
