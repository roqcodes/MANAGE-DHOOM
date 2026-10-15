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

export function DataExportMenu({
  source,
  disabled,
  size = "sm",
  variant = "outline",
  label = "Export",
}: {
  source: TabularExportSource;
  disabled?: boolean;
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "outline" | "default" | "secondary" | "ghost";
  label?: string;
}) {
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
          <Button variant={variant} size={size} disabled={isDisabled} />
        }
      >
        <Download data-icon="inline-start" />
        {label}
        <ChevronDown data-icon="inline-end" />
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
