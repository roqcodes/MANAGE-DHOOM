"use client";

import { useActionState, useEffect, useState } from "react";
import { KeyRound, Mail } from "lucide-react";

import { INITIAL_AUTH_ACTION_STATE } from "@/common/auth/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  forgotPasswordAction,
  updatePasswordAction,
} from "@/modules/auth/actions/auth.actions";
import { AUTH_ROUTES } from "@/modules/auth/services/auth-route.service";
import { useAdminSession } from "@/modules/admin/providers/admin-session-provider";

export function SecuritySettingsCard() {
  const profile = useAdminSession();
  const [redirectTo, setRedirectTo] = useState("");
  const [updateState, updateAction, updatePending] = useActionState(
    updatePasswordAction,
    INITIAL_AUTH_ACTION_STATE,
  );
  const [resetState, resetAction, resetPending] = useActionState(
    forgotPasswordAction,
    INITIAL_AUTH_ACTION_STATE,
  );

  useEffect(() => {
    setRedirectTo(`${window.location.origin}${AUTH_ROUTES.resetPassword}`);
  }, []);

  return (
    <Card className="border border-border py-0 ring-0">
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="size-4 text-muted-foreground" aria-hidden />
          Security
        </CardTitle>
        <CardDescription>
          Change your password while signed in, or email a reset link to{" "}
          {profile?.email ?? "your account"}.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 p-4 lg:grid-cols-2">
        <form action={updateAction} className="space-y-3">
          <p className="text-sm font-medium">Change password</p>
          <div className="space-y-2">
            <Label htmlFor="security-password">New password</Label>
            <Input
              autoComplete="new-password"
              id="security-password"
              minLength={8}
              name="password"
              placeholder="At least 8 characters"
              required
              type="password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="security-confirm">Confirm password</Label>
            <Input
              autoComplete="new-password"
              id="security-confirm"
              minLength={8}
              name="confirmPassword"
              placeholder="Re-enter password"
              required
              type="password"
            />
          </div>
          {updateState.errorMessage ? (
            <p className="text-sm text-destructive">{updateState.errorMessage}</p>
          ) : null}
          {updateState.successMessage ? (
            <p className="text-sm text-emerald-700">{updateState.successMessage}</p>
          ) : null}
          <Button disabled={updatePending} type="submit">
            {updatePending ? "Updating…" : "Update password"}
          </Button>
        </form>

        <form action={resetAction} className="space-y-3">
          <input name="email" type="hidden" value={profile?.email ?? ""} />
          <input name="redirectTo" type="hidden" value={redirectTo} />
          <p className="text-sm font-medium">Forgot password?</p>
          <p className="text-xs text-muted-foreground">
            We will send a secure reset link to your account email. Use this if you
            prefer not to set a password in the browser right now.
          </p>
          {resetState.errorMessage ? (
            <p className="text-sm text-destructive">{resetState.errorMessage}</p>
          ) : null}
          {resetState.successMessage ? (
            <p className="text-sm text-emerald-700">{resetState.successMessage}</p>
          ) : null}
          <Button
            disabled={resetPending || !profile?.email}
            type="submit"
            variant="outline"
          >
            <Mail className="size-4" aria-hidden />
            {resetPending ? "Sending…" : "Email reset link"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
