"use client";

import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
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
  onMouseEnter,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
}) {
  return (
    <TableRow
      className={cn(onClick && "cursor-pointer", "hover:bg-muted/30", className)}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
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

const ROW_WIDTHS = ["w-full", "w-4/5", "w-3/5", "w-11/12", "w-2/3"] as const;

/** Skeleton rows inside AdminDataTable while keeping real column headers visible. */
export function AdminDataTableRowsSkeleton({
  rows = 8,
  columns = 6,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <TableBody>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <TableRow key={rowIndex} className="hover:bg-transparent">
          {Array.from({ length: columns }, (_, colIndex) => (
            <TableCell key={colIndex}>
              <Skeleton
                className={cn(
                  "h-4",
                  ROW_WIDTHS[(rowIndex + colIndex) % ROW_WIDTHS.length],
                )}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}
