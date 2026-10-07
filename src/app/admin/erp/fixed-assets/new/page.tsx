import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

export default function NewFixedAssetPage() {
  return <ErpFormRouteRedirect listPath="/admin/erp/fixed-assets" form="new" />;
}
