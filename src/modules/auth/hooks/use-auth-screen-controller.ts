"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  AuthFormState,
  AuthScreenProps,
  AuthScreenViewProps,
  RequestAccessRole,
} from "@/common/auth/types";
import {
  INITIAL_AUTH_ACTION_STATE,
  UserRole,
} from "@/common/auth/types";
import {
  requestAccessAction,
  signInAction,
} from "@/modules/auth/actions/auth.actions";
import {
  getAlternateAuthMode,
  getAuthRouteForMode,
} from "@/modules/auth/services/auth-route.service";

const initialFormState: AuthFormState = {
  name: "",
  email: "",
  phone: "",
  password: "",
};

export function useAuthScreenController({
  initialMode = "sign-in",
}: AuthScreenProps): AuthScreenViewProps {
  const router = useRouter();
  const [role, setRole] = useState<RequestAccessRole>(UserRole.Admin);
  const [form, setForm] = useState<AuthFormState>(initialFormState);
  const [showPassword, setShowPassword] = useState(false);
  const [actionState, formAction, isPending] = useActionState(
    initialMode === "sign-in" ? signInAction : requestAccessAction,
    INITIAL_AUTH_ACTION_STATE,
  );

  function onModeToggle() {
    const nextMode = getAlternateAuthMode(initialMode);
    router.push(getAuthRouteForMode(nextMode));
  }

  function onRoleChange(nextRole: RequestAccessRole) {
    setRole(nextRole);
  }

  function onFieldChange<K extends keyof AuthFormState>(
    field: K,
    value: AuthFormState[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function onPasswordVisibilityToggle() {
    setShowPassword((current) => !current);
  }

  return {
    mode: initialMode,
    isRequestMode: initialMode === "request",
    role,
    form,
    showPassword,
    isPending,
    actionState,
    formAction,
    onModeToggle,
    onRoleChange,
    onFieldChange,
    onPasswordVisibilityToggle,
  };
}
