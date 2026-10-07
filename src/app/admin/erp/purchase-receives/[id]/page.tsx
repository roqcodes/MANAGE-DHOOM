import { PurchaseReceiveDetailView } from "@/modules/admin/views/purchasing/purchase-receive-detail-view";

type PageProps = { params: Promise<{ id: string }> };

export default async function AdminPurchaseReceiveDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <PurchaseReceiveDetailView receiveId={id} />;
}
