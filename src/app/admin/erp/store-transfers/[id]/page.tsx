import { StoreTransferDetailView } from "@/modules/admin/views/inventory/store-transfer-detail-view";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StoreTransferDetailView transferId={id} />;
}
