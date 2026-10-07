import { VatReturnDetailView } from "@/modules/admin/views/finance/vat-return-detail-view";

export default async function AdminErpVatReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VatReturnDetailView returnId={id} />;
}
