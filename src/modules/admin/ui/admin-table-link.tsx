import Link from "next/link";
import type { ReactNode } from "react";

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
      className={cn(
        "font-medium text-foreground hover:text-primary hover:underline",
        className,
      )}
    >
      {children}
    </Link>
  );
}
