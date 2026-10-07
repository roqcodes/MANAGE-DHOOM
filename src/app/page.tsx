import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { getAccessRedirectPath } from "@/modules/auth/access.control";
import { AUTH_ROUTES } from "@/modules/auth/services/auth-route.service";
import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";
import { BuyHubManageHome } from "@/modules/marketing/components/buyhub-manage-home";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { user, profile } = await getCurrentSessionProfile();

  if (user) {
    if (!profile) {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
      redirect(AUTH_ROUTES.signIn);
    }
    redirect(getAccessRedirectPath(profile));
  }

  return <BuyHubManageHome />;
}
