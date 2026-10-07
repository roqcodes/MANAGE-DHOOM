import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ErpFormRouteRedirect listPath="/admin/erp/credit-notes" form="edit" id={id} />;
}
