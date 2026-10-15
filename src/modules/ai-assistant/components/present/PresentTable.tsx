"use client";

import { ArrowUpRight } from "lucide-react";

import type { UiTableBlock } from "../../lib/parse-ui";
import { AssistantActionButton } from "../assistant-action-ui";
import { formatPresentCell } from "./present-format";
import { PresentShell } from "./PresentShell";

export function PresentTable({ block }: { block: UiTableBlock }) {
  const columns = block.columns;
  const rows = block.rows;

  const footer =
    block.note || block.ctaPath ? (
      <div className="flex flex-col gap-2 px-1">
        {block.note ? (
          <p className="text-[10px] text-muted-foreground">{block.note}</p>
        ) : null}
        {block.ctaPath ? (
          <AssistantActionButton
            variant="nav"
            href={block.ctaPath}
            label={block.ctaLabel || "Open"}
            className="mt-0"
            icon={<ArrowUpRight size={9} strokeWidth={2.5} aria-hidden />}
          />
        ) : null}
      </div>
    ) : undefined;

  return (
    <PresentShell title={block.title} subtitle={block.subtitle} footer={footer}>
      <div className="max-h-56 overflow-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="sticky top-0 bg-background/90 backdrop-blur-sm">
            <tr>
              {columns.map((col, i) => (
                <th
                  key={col}
                  scope="col"
                  className={`whitespace-nowrap px-3 py-1.5 font-medium text-muted-foreground ${
                    i === 0 ? "text-left" : "text-right"
                  }`}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={ri}
                className="border-t border-white/8 even:bg-white/[0.03]"
              >
                {columns.map((_, ci) => (
                  <td
                    key={ci}
                    className={`px-3 py-1.5 tabular-nums ${
                      ci === 0
                        ? "text-left font-medium text-foreground"
                        : "text-right text-foreground/90"
                    }`}
                  >
                    {formatPresentCell(row[ci])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PresentShell>
  );
}
