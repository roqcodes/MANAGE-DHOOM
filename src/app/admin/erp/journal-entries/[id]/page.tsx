import { JournalEntryDetailView } from "@/modules/admin/views/finance/journal-entry-detail-view";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <JournalEntryDetailView journalId={id} />;
}
