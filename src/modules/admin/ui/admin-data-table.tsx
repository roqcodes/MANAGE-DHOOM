"use client";

import type { ReactNode } from "react";

import { SortableTableHead } from "@/components/ui/sortable-table-head";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export { SortableTableHead };

export function AdminDataTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Table className={cn("text-sm", className)}>
      {children}
    </Table>
  );
}

export function AdminTableHeader({ children }: { children: ReactNode }) {
  return (
    <TableHeader>
      <TableRow className="bg-muted/40 hover:bg-muted/40">{children}</TableRow>
    </TableHeader>
  );
}

export function AdminTableBody({ children }: { children: ReactNode }) {
  return <TableBody>{children}</TableBody>;
}

export function AdminTableRow({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <TableRow
      className={cn(onClick && "cursor-pointer", "hover:bg-muted/30", className)}
      onClick={onClick}
    >
      {children}
    </TableRow>
  );
}

export function AdminTableCell({
  children,
  className,
  align,
}: {
  children: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <TableCell
      className={cn(
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </TableCell>
  );
}
