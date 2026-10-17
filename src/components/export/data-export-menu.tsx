"use client";

import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  exportFromSource,
  type TabularExportFormat,
  type TabularExportSource,
} from "@/lib/export/tabular-export";

type DataExportButtonSize = "sm" | "default" | "lg" | "icon" | "page" | "page-icon";

export function DataExportMenu({
  source,
  disabled,
  presentation = "icon",
  size,
  variant = "outline",
  label = "Export",
}: {
  source: TabularExportSource;
  disabled?: boolean;
  /** Icon-only for page headers; labeled for dense toolbars. */
  presentation?: "icon" | "labeled";
  size?: DataExportButtonSize;
  variant?: "outline" | "default" | "secondary" | "ghost";
  label?: string;
}) {
  const buttonSize = size ?? (presentation === "icon" ? "page-icon" : "page");
  const [pending, setPending] = useState(false);

  async function run(format: TabularExportFormat) {
    setPending(true);
    try {
      await exportFromSource(format, source);
    } finally {
      setPending(false);
    }
  }

  const isDisabled =
    disabled || pending || (source.getTabular()?.rows.length ?? 0) === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant={variant}
            size={buttonSize}
            disabled={isDisabled}
            aria-label={presentation === "icon" ? label : undefined}
            title={presentation === "icon" ? label : undefined}
            className={presentation === "labeled" ? "rounded-full" : undefined}
          />
        }
      >
        <Download data-icon={presentation === "labeled" ? "inline-start" : undefined} />
        {presentation === "labeled" ? label : null}
        {presentation === "labeled" ? <ChevronDown data-icon="inline-end" /> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => run("csv")}>CSV</DropdownMenuItem>
          <DropdownMenuItem onClick={() => run("xlsx")}>Excel (XLSX)</DropdownMenuItem>
          <DropdownMenuItem onClick={() => run("pdf")}>PDF</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
