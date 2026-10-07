"use client";

import { use } from "react";

import { VendorCreditDetailView } from "@/modules/admin/views/purchasing/vendor-credit-detail-view";

export default function VendorCreditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <VendorCreditDetailView creditId={id} />;
}
