import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

export default async function EditVendorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ErpFormRouteRedirect listPath="/admin/vendors" form="edit" id={id} />;
}
