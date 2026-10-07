import { ExpenseDetailView } from "@/modules/admin/views/purchasing/expense-detail-view";

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExpenseDetailView expenseId={id} />;
}
