import { Children, isValidElement, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function RequiredFieldMark({ className }: { className?: string }) {
  return (
    <>
      <span className={cn("text-destructive", className)} aria-hidden="true"> *</span>
      <span className="sr-only"> (required)</span>
    </>
  );
}

export function hasRequiredDescendant(children: ReactNode): boolean {
  let found = false;

  Children.forEach(children, (child) => {
    if (found || !isValidElement(child)) return;

    const props = child.props as {
      required?: boolean;
      "aria-required"?: boolean | "true" | "false";
      children?: ReactNode;
    };

    if (
      props.required === true ||
      props["aria-required"] === true ||
      props["aria-required"] === "true"
    ) {
      found = true;
      return;
    }

    if (props.children && hasRequiredDescendant(props.children)) {
      found = true;
    }
  });

  return found;
}

export function showRequiredMark(
  required?: boolean,
  children?: ReactNode,
): boolean {
  if (required === true) return true;
  if (required === false) return false;
  if (children) return hasRequiredDescendant(children);
  return false;
}
