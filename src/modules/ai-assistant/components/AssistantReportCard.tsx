"use client";

import { ArrowUpRight } from "lucide-react";

import type { AssistantReport } from "../lib/parse-report";
import { AssistantActionButton } from "./assistant-action-ui";

function cell(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  }
  return String(value);
}

export function AssistantReportCard({ report }: { report: AssistantReport }) {
  const columns = report.columns ?? [];
  const rows = (report.rows ?? []).slice(0, 8);
  const highlights = (report.highlights ?? []).slice(0, 4);

  return (
    <div className="mt-2.5 overflow-hidden rounded-xl border border-white/15 bg-background/70 shadow-sm backdrop-blur-md dark:bg-slate-950/40">
      <div className="border-b border-white/10 px-3 py-2">
        <p className="text-[12px] font-semibold leading-snug text-foreground">
          {report.title}
        </p>
        {report.subtitle ? (
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {report.subtitle}
          </p>
        ) : null}
      </div>

      {highlights.length > 0 ? (
        <div className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
          {highlights.map((h) => (
            <div key={h.label} className="bg-background/80 px-3 py-2">
              <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                {h.label}
              </p>
              <p className="mt-0.5 font-semibold tabular-nums text-[12px] text-foreground">
                {h.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {columns.length > 0 && rows.length > 0 ? (
        <div className="max-h-56 overflow-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-background/90 backdrop-blur-sm">
              <tr>
                {columns.map((col, i) => (
                  <th
                    key={col}
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
                      {cell(row[ci])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {(report.note || report.ctaPath) && (
        <div className="flex flex-col gap-2 border-t border-white/10 px-2 py-2">
          {report.note ? (
            <p className="px-1 text-[10px] text-muted-foreground">{report.note}</p>
          ) : null}
          {report.ctaPath ? (
            <AssistantActionButton
              variant="nav"
              href={report.ctaPath}
              label={report.ctaLabel || "Open report"}
              className="mt-0"
              icon={<ArrowUpRight size={9} strokeWidth={2.5} aria-hidden />}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
