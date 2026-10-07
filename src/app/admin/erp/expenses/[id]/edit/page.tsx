import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ErpFormRouteRedirect listPath="/admin/erp/expenses" form="edit" id={id} />;
}
