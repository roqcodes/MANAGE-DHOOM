import type { ReportColumn } from "@/common/erp/report-types";

export function isAgingBucketColumnKey(key: string): boolean {
  return key.startsWith("bucket_");
}

export function isAgingAgeFilterActive(
  ageMinDays?: number,
  ageMaxDays?: number,
): boolean {
  return ageMinDays != null || ageMaxDays != null;
}

/** Hide fixed bucket columns when the user applies a custom age range. */
export function resolveAgingReportColumns(
  columns: ReportColumn[],
  ageMinDays?: number,
  ageMaxDays?: number,
): ReportColumn[] {
  if (!isAgingAgeFilterActive(ageMinDays, ageMaxDays)) {
    return columns;
  }
  return columns.filter((col) => !isAgingBucketColumnKey(col.key));
}
