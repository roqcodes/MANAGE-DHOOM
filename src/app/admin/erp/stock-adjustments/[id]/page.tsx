import { StockAdjustmentDetailView } from "@/modules/admin/views/inventory/stock-adjustment-detail-view";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StockAdjustmentDetailView adjustmentId={id} />;
}
