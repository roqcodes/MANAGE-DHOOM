import { PaymentDetailView } from "@/modules/admin/views/sales/payment-detail-view";

export default async function AdminErpPaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PaymentDetailView paymentId={id} />;
}
