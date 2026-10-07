import { InvoiceDetailView } from "@/modules/admin/views/sales/invoice-detail-view";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoiceDetailView invoiceId={id} />;
}
