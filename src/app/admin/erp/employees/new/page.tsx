import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

export default function NewEmployeePage() {
  return <ErpFormRouteRedirect listPath="/admin/erp/employees" form="new" />;
}
