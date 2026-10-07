import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

export default function NewVendorPage() {
  return <ErpFormRouteRedirect listPath="/admin/vendors" form="new" />;
}
