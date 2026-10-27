import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

const INVALID_CONTROL =
  "border-destructive ring-3 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40";

function isFormControlElement(
  child: ReactElement,
): child is ReactElement<{ className?: string; "aria-invalid"?: boolean }> {
  const type = child.type;
  if (typeof type === "string") {
    return (
      type === "input" ||
      type === "select" ||
      type === "textarea" ||
      type === "button"
    );
  }
  const displayName =
    typeof type === "function"
      ? (type as { displayName?: string; name?: string }).displayName ??
        (type as { name?: string }).name
      : undefined;
  if (displayName === "Input" || displayName === "Textarea" || displayName === "Select") {
    return true;
  }
  return false;
}

/** Sets `aria-invalid` (and destructive border on native controls) on field controls. */
export function applyFieldInvalidState(
  children: ReactNode,
  invalid: boolean,
): ReactNode {
  if (!invalid) return children;

  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;

    const props = child.props as {
      className?: string;
      "aria-invalid"?: boolean;
      children?: ReactNode;
    };

    if (isFormControlElement(child)) {
      const isNative = typeof child.type === "string";
      return cloneElement(child, {
        "aria-invalid": true,
        ...(isNative
          ? { className: cn(props.className, INVALID_CONTROL) }
          : {}),
      } as Partial<typeof props>);
    }

    if (props.children) {
      return cloneElement(child, {
        children: applyFieldInvalidState(props.children, true),
      } as Partial<typeof props>);
    }

    return child;
  });
}

export function controlBorderInvalid(invalid?: boolean, className?: string) {
  return cn(className, invalid && INVALID_CONTROL);
}
