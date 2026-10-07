import { notFound } from "next/navigation";

import { getReportBySlug } from "@/common/erp/report-types";
import { ReportViewer } from "@/modules/admin/views/reports/report-viewer";

export default async function ErpReportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const report = getReportBySlug(slug);
  if (!report) notFound();
  return <ReportViewer report={report} />;
}
