import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

export default function Page() {
  return <ErpFormRouteRedirect listPath="/admin/erp/invoices" form="new" />;
}
