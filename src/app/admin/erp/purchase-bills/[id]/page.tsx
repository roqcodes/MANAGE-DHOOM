"use client";

import { use } from "react";

import { PurchaseBillDetailView } from "@/modules/admin/views/purchasing/purchase-bill-detail-view";

export default function AdminPurchaseBillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <PurchaseBillDetailView billId={id} />;
}
