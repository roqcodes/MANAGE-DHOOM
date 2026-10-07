import { EstimateDetailView } from "@/modules/admin/views/sales/estimate-detail-view";

export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EstimateDetailView estimateId={id} />;
}
