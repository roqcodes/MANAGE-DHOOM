import type { ReactNode } from "react";

import { BuyHubInvoiceLogo } from "@/modules/brand/components/buyhub-logo";
import { COMPANY_NAME } from "@/modules/brand/lib/brand";

export function InvoicePrintRoot({
  children,
  kind = "invoice",
}: {
  children: ReactNode;
  kind?: "invoice" | "order" | "purchase" | "bill";
}) {
  return (
    <article
      data-invoice-document
      data-print-document
      data-print-kind={kind}
      className="bh-a4-page text-slate-900 print:text-black"
    >
      {children}
    </article>
  );
}

export function InvoicePrintLogo({
  logoUrl,
  storeName,
}: {
  logoUrl?: string | null;
  storeName?: string | null;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={storeName ?? COMPANY_NAME}
        className="bh-inv-logo h-12 w-auto max-w-[200px] object-contain"
      />
    );
  }
  return <BuyHubInvoiceLogo className="bh-inv-logo" />;
}

export function InvoicePrintHeader({
  logoUrl,
  storeName,
  title,
  documentNumber,
  status,
  metaRows,
}: {
  logoUrl?: string | null;
  storeName?: string | null;
  title: string;
  documentNumber: string;
  status?: string | null;
  metaRows: Array<{ label: string; value: string }>;
}) {
  return (
    <table className="bh-inv-header" role="presentation">
      <tbody>
        <tr>
          <td>
            <InvoicePrintLogo logoUrl={logoUrl} storeName={storeName} />
          </td>
          <td className="bh-inv-head-right">
            <p className="bh-inv-kicker">Document</p>
            <h1 className="bh-inv-title">{title}</h1>
            <p className="bh-inv-doc-id">{documentNumber}</p>
            {status ? (
              <p className="mt-2">
                <span className="bh-inv-badge">{status}</span>
              </p>
            ) : null}
          </td>
        </tr>
        <tr>
          <td colSpan={2}>
            <table className="bh-inv-meta" role="presentation">
              <tbody>
                <tr>
                  {metaRows.map((row) => (
                    <td key={row.label}>
                      <div className="bh-inv-meta-label">{row.label}</div>
                      <div className="bh-inv-strong">{row.value}</div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function InvoicePrintParties({
  left,
  right,
}: {
  left: { title: string; lines: string[] };
  right: { title: string; lines: string[] };
}) {
  return (
    <table className="bh-inv-parties" role="presentation">
      <tbody>
        <tr>
          <td>
            <p className="bh-inv-kicker">{left.title}</p>
            {left.lines.map((line, i) => (
              <p key={i} className={i === 0 ? "bh-inv-party-name" : "bh-inv-muted"}>
                {line}
              </p>
            ))}
          </td>
          <td>
            <p className="bh-inv-kicker">{right.title}</p>
            {right.lines.map((line, i) => (
              <p key={i} className={i === 0 ? "bh-inv-party-name" : "bh-inv-muted"}>
                {line}
              </p>
            ))}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export type InvoicePrintLineColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
  width?: string;
};

export function InvoicePrintLineTable({
  columns,
  rows,
}: {
  columns: InvoicePrintLineColumn[];
  rows: Record<string, ReactNode>[];
}) {
  return (
    <table className="bh-inv-items">
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              className={col.align === "right" ? "bh-inv-num" : undefined}
              style={col.width ? { width: col.width } : undefined}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {columns.map((col) => (
              <td
                key={col.key}
                className={col.align === "right" ? "bh-inv-num" : undefined}
              >
                {row[col.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function InvoicePrintTotals({
  lines,
  highlightBalance,
}: {
  lines: Array<{ label: string; value: string; grand?: boolean; balance?: boolean }>;
  highlightBalance?: boolean;
}) {
  return (
    <div className="bh-inv-totals-wrap">
      <table className="bh-inv-totals" role="presentation">
        <tbody>
          {lines.map((line) => (
            <tr
              key={line.label}
              className={
                line.balance && highlightBalance
                  ? "bh-inv-balance"
                  : line.grand
                    ? "bh-inv-grand"
                    : undefined
              }
            >
              <td className="bh-inv-total-label">{line.label}</td>
              <td className="bh-inv-num">{line.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InvoicePrintNotes({ title, body }: { title: string; body: string }) {
  return (
    <section className="bh-inv-notes">
      <p className="bh-inv-kicker">{title}</p>
      <p className="mt-1 whitespace-pre-wrap">{body}</p>
    </section>
  );
}

export function InvoicePrintFooter({ children }: { children: ReactNode }) {
  return <footer className="bh-inv-footer">{children}</footer>;
}
