import { CreditNoteDetailView } from "@/modules/admin/views/sales/credit-note-detail-view";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CreditNoteDetailView creditNoteId={id} />;
}
