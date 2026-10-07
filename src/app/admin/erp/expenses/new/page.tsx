import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

export default function NewExpensePage() {
  return <ErpFormRouteRedirect listPath="/admin/erp/expenses" form="new" />;
}
