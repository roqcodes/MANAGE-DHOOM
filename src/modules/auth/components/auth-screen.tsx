"use client";

import type { AuthScreenProps } from "@/common/auth/types";
import { AuthScreenView } from "@/modules/auth/components/auth-screen-view";
import { useAuthScreenController } from "@/modules/auth/hooks/use-auth-screen-controller";

export function AuthScreen(props: AuthScreenProps) {
  const viewModel = useAuthScreenController(props);

  return <AuthScreenView {...viewModel} />;
}
