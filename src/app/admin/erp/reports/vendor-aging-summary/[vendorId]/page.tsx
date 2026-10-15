import { VendorAgingSummaryDetailsView } from "@/modules/admin/views/reports/vendor-aging-summary-details-view";

export default async function VendorAgingSummaryDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ vendorId: string }>;
  searchParams: Promise<{ asOf?: string; storeId?: string }>;
}) {
  const { vendorId } = await params;
  const { asOf, storeId } = await searchParams;
  return (
    <VendorAgingSummaryDetailsView
      vendorId={vendorId}
      initialAsOf={asOf}
      initialStoreId={storeId}
    />
  );
}
