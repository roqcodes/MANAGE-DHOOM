import { TransferRequestDetailView } from "@/modules/admin/views/inventory/transfer-request-detail-view";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TransferRequestDetailView requestId={id} />;
}
