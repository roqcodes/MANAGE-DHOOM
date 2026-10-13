"use client";

import { useActionState, useState } from "react";

import type {
  AuthFormState,
  AuthScreenProps,
  AuthScreenViewProps,
} from "@/common/auth/types";
import { INITIAL_AUTH_ACTION_STATE } from "@/common/auth/types";
import { signInAction } from "@/modules/auth/actions/auth.actions";

const initialFormState: AuthFormState = {
  name: "",
  email: "",
  phone: "",
  password: "",
};

export function useAuthScreenController(
  _props: AuthScreenProps = {},
): AuthScreenViewProps {
  const [form, setForm] = useState<AuthFormState>(initialFormState);
  const [showPassword, setShowPassword] = useState(false);
  const [actionState, formAction, isPending] = useActionState(
    signInAction,
    INITIAL_AUTH_ACTION_STATE,
  );

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
    form,
    showPassword,
    isPending,
    actionState,
    formAction,
    onFieldChange,
    onPasswordVisibilityToggle,
  };
}
