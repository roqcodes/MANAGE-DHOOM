import type { ReportDefinition } from "@/common/erp/report-types";

export type AddressHierarchyFilterParams = {
  cityId?: string | null;
  streetId?: string | null;
  mallId?: string | null;
};

export function hasActiveAddressHierarchyFilter(
  params: AddressHierarchyFilterParams | undefined,
): boolean {
  if (!params) return false;
  return Boolean(params.cityId?.trim() || params.streetId?.trim() || params.mallId?.trim());
}

export function addressHierarchyToQueryRecord(
  params: AddressHierarchyFilterParams,
): Record<string, string> {
  const out: Record<string, string> = {};
  const cityId = params.cityId?.trim();
  const streetId = params.streetId?.trim();
  const mallId = params.mallId?.trim();
  if (cityId) out.cityId = cityId;
  if (streetId) out.streetId = streetId;
  if (mallId) out.mallId = mallId;
  return out;
}

export function parseAddressHierarchySearchParams(
  searchParams: URLSearchParams | ReadonlyURLSearchParamsLike,
): AddressHierarchyFilterParams {
  return {
    cityId: searchParams.get("cityId")?.trim() || null,
    streetId: searchParams.get("streetId")?.trim() || null,
    mallId: searchParams.get("mallId")?.trim() || null,
  };
}

type ReadonlyURLSearchParamsLike = {
  get(name: string): string | null;
};

/** Reports and lists tied to customer billing address. */
export function reportUsesAddressHierarchyFilters(report: ReportDefinition): boolean {
  if (report.category === "Activity") return false;
  if (report.filters.addressHierarchy === false) return false;
  if (report.filters.addressHierarchy === true) return true;
  if (report.filters.vendorSearch && !report.filters.customerSearch) return false;
  return (
    Boolean(report.filters.customerSearch) ||
    report.category === "Sales" ||
    report.category === "Receivables" ||
    report.category === "Payments Received" ||
    report.slug === "performance-report"
  );
}
