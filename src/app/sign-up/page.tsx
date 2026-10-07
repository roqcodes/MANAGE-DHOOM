import { AuthScreen } from "@/modules/auth/components/auth-screen";
import { redirectAuthenticatedUsersFromAuth } from "@/modules/auth/services/auth-guard.service";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  await redirectAuthenticatedUsersFromAuth();

  return <AuthScreen initialMode="request" />;
}
