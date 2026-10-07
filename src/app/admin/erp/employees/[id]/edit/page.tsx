import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ErpFormRouteRedirect listPath="/admin/erp/employees" form="edit" id={id} />;
}
