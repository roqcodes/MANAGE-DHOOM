import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

export default function NewVatReturnPage() {
  return <ErpFormRouteRedirect listPath="/admin/erp/vat-returns" form="new" />;
}
