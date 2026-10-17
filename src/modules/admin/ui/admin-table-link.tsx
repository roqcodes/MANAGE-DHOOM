import Link from "next/link";
import type { ReactNode } from "react";

import { INTERACTIVE_FOREGROUND_LINK_CLASS } from "@/lib/ui/interactive-styles";
import { cn } from "@/lib/utils";

export function AdminTableLink({
  href,
  children,
  className,
  title,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <Link
      href={href}
      title={title}
      className={cn(INTERACTIVE_FOREGROUND_LINK_CLASS, className)}
    >
      {children}
    </Link>
  );
}
