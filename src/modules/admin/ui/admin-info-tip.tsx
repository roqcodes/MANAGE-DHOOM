"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function AdminInfoTip({
  title,
  children,
  className,
  side = "top",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn("size-7 text-muted-foreground hover:text-foreground", className)}
            aria-label={title ? `About ${title}` : "More information"}
          />
        }
      >
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent side={side} className="max-w-xs">
        {title ? (
          <PopoverHeader>
            <PopoverTitle className="text-sm">{title}</PopoverTitle>
          </PopoverHeader>
        ) : null}
        <PopoverDescription className="space-y-1.5 text-xs leading-relaxed">
          {children}
        </PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}
