"use client";

import Link from "next/link";
import { Fragment } from "react";
import { ArrowLeft } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AdminBreadcrumbItem = {
  label: string;
  href?: string;
};

type AdminBreadcrumbProps = {
  items: AdminBreadcrumbItem[];
  /** When set, shows a ghost back button linking here (defaults to the nearest prior `href`). */
  backHref?: string;
  showBack?: boolean;
  className?: string;
};

export function AdminBreadcrumb({
  items,
  backHref,
  showBack = true,
  className,
}: AdminBreadcrumbProps) {
  if (items.length === 0) return null;

  const linkItems = items.slice(0, -1);
  const current = items[items.length - 1];
  const resolvedBackHref =
    backHref ?? [...items].reverse().find((item) => item.href)?.href ?? "/admin";

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 border-b border-border pb-2",
        className,
      )}
    >
      {showBack ? (
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={<Link href={resolvedBackHref} />}
          aria-label="Go back"
        >
          <ArrowLeft />
        </Button>
      ) : null}

      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList>
          {linkItems.map((item) => (
            <Fragment key={`${item.href ?? "link"}-${item.label}`}>
              <BreadcrumbItem>
                {item.href ? (
                  <BreadcrumbLink render={<Link href={item.href} />}>{item.label}</BreadcrumbLink>
                ) : (
                  <BreadcrumbLink>{item.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </Fragment>
          ))}
          <BreadcrumbItem className="min-w-0 max-w-full">
            <BreadcrumbPage className="truncate font-medium">
              {current.label}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
