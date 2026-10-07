import { EmployeeDetailView } from "@/modules/admin/views/hr/employee-detail-view";

type PageProps = { params: Promise<{ id: string }> };

export default async function EmployeeDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <EmployeeDetailView employeeId={id} />;
}
