import { Button } from "@/components/ui/button";
import { signOutAction } from "@/modules/auth/actions/auth.actions";

export function SignOutForm() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="outline" size="sm">
        Sign out
      </Button>
    </form>
  );
}
