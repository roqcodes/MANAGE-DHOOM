import { AdminRouteSuspense } from "@/modules/admin/components/admin-route-suspense";
import { AccountTransactionsView } from "@/modules/admin/views/banking/account-transactions-view";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminRouteSuspense>
      <AccountTransactionsView accountId={id} />
    </AdminRouteSuspense>
  );
}
