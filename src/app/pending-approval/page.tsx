import { PendingApprovalView } from "@/modules/auth/components/pending-approval-view";
import { requirePendingProfile } from "@/modules/auth/services/auth-guard.service";

export const dynamic = "force-dynamic";

export default async function PendingApprovalPage() {
  const profile = await requirePendingProfile();

  return <PendingApprovalView profile={profile} />;
}
