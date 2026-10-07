"use client";

import type { ComponentProps } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LoadingButtonProps = ComponentProps<typeof Button> & {
  loading?: boolean;
  loadingLabel?: string;
};

/** Primary / submit button with consistent spinner while an async action runs. */
export function LoadingButton({
  loading = false,
  loadingLabel,
  disabled,
  children,
  className,
  ...props
}: LoadingButtonProps) {
  const label = loading && loadingLabel ? loadingLabel : children;

  return (
    <Button disabled={disabled || loading} className={cn(className)} {...props}>
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
          {label}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
