import { OpeningStockDetailView } from "@/modules/admin/views/inventory/opening-stock-detail-view";

type PageProps = { params: Promise<{ id: string }> };

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <OpeningStockDetailView openingId={id} />;
}