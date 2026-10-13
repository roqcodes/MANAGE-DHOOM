import { redirect } from "next/navigation";

import { AUTH_ROUTES } from "@/modules/auth/services/auth-route.service";

export default function SignUpPage() {
  redirect(AUTH_ROUTES.signIn);
}
