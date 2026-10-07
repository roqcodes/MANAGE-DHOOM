"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { Eye, MoreHorizontal, Pencil, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ErpListMenuItem = {
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  separatorBefore?: boolean;
};

export type ErpListIconAction = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  destructive?: boolean;
};

function iconActionToMenuItem(action: ErpListIconAction): ErpListMenuItem {
  return {
    label: action.label,
    href: action.href,
    onClick: action.onClick,
    disabled: action.disabled,
    destructive: action.destructive,
  };
}

export function ErpListRowActions({
  viewHref,
  editHref,
  printHref,
  onPrintClick,
  editDisabled,
  menuItems = [],
  iconActions = [],
  menuLabel = "More actions",
  responsiveIcons = false,
}: {
  viewHref?: string;
  editHref?: string;
  printHref?: string;
  onPrintClick?: () => void;
  editDisabled?: boolean;
  menuItems?: ErpListMenuItem[];
  iconActions?: ErpListIconAction[];
  menuLabel?: string;
  /** Icon actions inline on md+; collapse to ⋯ menu below md. */
  responsiveIcons?: boolean;
}) {
  const dropdownItems: ErpListMenuItem[] = responsiveIcons
    ? [...iconActions.map(iconActionToMenuItem), ...menuItems]
    : menuItems;

  const showDropdown = responsiveIcons
    ? dropdownItems.length > 0
    : menuItems.length > 0;

  const showInlineIcons = iconActions.length > 0;

  function renderIconButton(action: ErpListIconAction) {
    const Icon = action.icon;
    const className = cn(action.destructive && "text-destructive hover:text-destructive");

    if (action.href) {
      return (
        <Button
          key={action.label}
          nativeButton={false}
          size="icon-sm"
          variant="ghost"
          disabled={action.disabled}
          className={className}
          render={<Link href={action.href} />}
          aria-label={action.label}
        >
          <Icon />
        </Button>
      );
    }

    return (
      <Button
        key={action.label}
        nativeButton
        size="icon-sm"
        variant="ghost"
        disabled={action.disabled}
        className={className}
        onClick={action.onClick}
        aria-label={action.label}
      >
        <Icon />
      </Button>
    );
  }

  return (
    <div className="flex items-center justify-end gap-0.5">
      {viewHref ? (
        <Button
          nativeButton={false}
          size="icon-sm"
          variant="ghost"
          render={<Link href={viewHref} />}
          aria-label="View"
          className={responsiveIcons ? "hidden md:inline-flex" : undefined}
        >
          <Eye />
        </Button>
      ) : null}
      {editHref ? (
        editDisabled ? (
          <Button
            nativeButton
            size="icon-sm"
            variant="ghost"
            disabled
            aria-label="Edit"
            className={responsiveIcons ? "hidden md:inline-flex" : undefined}
          >
            <Pencil />
          </Button>
        ) : (
          <Button
            nativeButton={false}
            size="icon-sm"
            variant="ghost"
            render={<Link href={editHref} />}
            aria-label="Edit"
            className={responsiveIcons ? "hidden md:inline-flex" : undefined}
          >
            <Pencil />
          </Button>
        )
      ) : null}
      {onPrintClick ? (
        <Button
          nativeButton
          size="icon-sm"
          variant="ghost"
          onClick={onPrintClick}
          aria-label="Print"
          className={responsiveIcons ? "hidden md:inline-flex" : undefined}
        >
          <Printer />
        </Button>
      ) : printHref ? (
        <Button
          nativeButton={false}
          size="icon-sm"
          variant="ghost"
          render={<Link href={printHref} target="_blank" />}
          aria-label="Print"
          className={responsiveIcons ? "hidden md:inline-flex" : undefined}
        >
          <Printer />
        </Button>
      ) : null}

      {showInlineIcons ? (
        <div className={cn("flex items-center gap-0.5", responsiveIcons && "hidden md:flex")}>
          {iconActions.map(renderIconButton)}
        </div>
      ) : null}

      {showDropdown ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                nativeButton
                size="icon-sm"
                variant="ghost"
                aria-label={menuLabel}
                className={responsiveIcons ? "md:hidden" : undefined}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {renderMenuItems(dropdownItems)}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

function renderMenuItems(items: ErpListMenuItem[]) {
  const nodes: ReactNode[] = [];
  let group: ErpListMenuItem[] = [];

  function flushGroup() {
    if (group.length === 0) return;
    nodes.push(
      <DropdownMenuGroup key={`group-${nodes.length}`}>
        {group.map((item) => (
          <DropdownMenuItem
            key={item.label}
            nativeButton={false}
            render={
              item.href ? (
                <Link href={item.href} target={item.href.includes("/print") ? "_blank" : undefined} />
              ) : undefined
            }
            disabled={item.disabled}
            variant={item.destructive ? "destructive" : "default"}
            onClick={item.onClick}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>,
    );
    group = [];
  }

  for (const item of items) {
    if (item.separatorBefore) {
      flushGroup();
      nodes.push(<DropdownMenuSeparator key={`sep-${nodes.length}`} />);
    }
    group.push(item);
  }
  flushGroup();
  return nodes;
}
