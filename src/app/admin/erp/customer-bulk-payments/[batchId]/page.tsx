import { CustomerBulkPaymentDetailView } from "@/modules/admin/views/sales/customer-bulk-payment-detail-view";

export default async function CustomerBulkPaymentDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  return <CustomerBulkPaymentDetailView batchId={decodeURIComponent(batchId)} />;
}
