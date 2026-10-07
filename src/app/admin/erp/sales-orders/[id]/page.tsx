import { SalesOrderDetailView } from "@/modules/admin/views/sales/sales-order-detail-view";

export default async function SalesOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SalesOrderDetailView orderId={id} />;
}
