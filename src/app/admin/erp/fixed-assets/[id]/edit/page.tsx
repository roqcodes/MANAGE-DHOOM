import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

export default async function EditFixedAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ErpFormRouteRedirect listPath="/admin/erp/fixed-assets" form="edit" id={id} />;
}
