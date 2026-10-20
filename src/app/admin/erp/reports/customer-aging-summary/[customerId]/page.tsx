import { CustomerAgingSummaryDetailsView } from "@/modules/admin/views/reports/customer-aging-summary-details-view";

export default async function CustomerAgingSummaryDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ asOf?: string; storeId?: string; salesmanId?: string }>;
}) {
  const { customerId } = await params;
  const { asOf, storeId, salesmanId } = await searchParams;
  return (
    <CustomerAgingSummaryDetailsView
      customerId={customerId}
      initialAsOf={asOf}
      initialStoreId={storeId}
      initialSalesmanId={salesmanId}
    />
  );
}
