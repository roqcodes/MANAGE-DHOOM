import type { ReactNode } from "react";

import { BuyHubInvoiceLogo } from "@/modules/brand/components/buyhub-logo";
import { BRAND_SHORT_NAME, COMPANY_NAME } from "@/modules/brand/lib/brand";
import {
  INVOICE_PRINT_LABELS as L,
  TAX_INVOICE_TITLE_AR,
  TAX_INVOICE_TITLE_EN,
  type PartyCard,
} from "@/modules/documents/invoice-print-copy";
import { InvoiceQr } from "@/modules/documents/invoice-qr";
import { formatInvoiceMoney } from "@/modules/documents/invoice-print-money";

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
      className="bh-a4-page text-black print:text-black"
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
        className="bh-inv-logo bh-inv-logo--store"
      />
    );
  }
  return <BuyHubInvoiceLogo className="bh-inv-logo" />;
}

function BiLabel({ en, ar }: { en: string; ar: string }) {
  return (
    <span className="bh-bi">
      <span className="bh-bi-en">{en}</span>
      {ar ? (
        <span className="bh-bi-ar" lang="ar" dir="rtl">
          {ar}
        </span>
      ) : null}
    </span>
  );
}

export function TaxInvoiceMasthead({
  storeName,
  titleEn = TAX_INVOICE_TITLE_EN,
  titleAr = TAX_INVOICE_TITLE_AR,
  vatNumber,
}: {
  logoUrl?: string | null;
  storeName?: string | null;
  titleEn?: string;
  titleAr?: string;
  vatNumber?: string | null;
}) {
  const tradingName = storeName?.trim() || COMPANY_NAME;

  return (
    <header className="bh-inv-masthead">
      <div className="bh-inv-masthead-row">
        <div className="bh-inv-brand-block">
          <div className="bh-inv-brand">
            <InvoicePrintLogo storeName={tradingName} />
            <div className="bh-inv-wordmark">
              <p className="bh-inv-wordmark-name">{BRAND_SHORT_NAME}</p>
              <p className="bh-inv-wordmark-sub">TRADING</p>
            </div>
          </div>
          {vatNumber ? <p className="bh-inv-wordmark-vat">VAT {vatNumber}</p> : null}
        </div>
        <div className="bh-inv-doc-title">
          {titleAr ? (
            <h1 className="bh-inv-title-ar" lang="ar" dir="rtl">
              {titleAr}
            </h1>
          ) : null}
          <p className="bh-inv-title-en">{titleEn}</p>
        </div>
      </div>
    </header>
  );
}

export function TaxInvoiceMeta({
  numberLabel = L.invoiceNumber,
  dateLabel = L.invoiceDate,
  dueLabel = L.dueDate,
  documentNumber,
  invoiceDate,
  dueDate,
  extraRows,
  qrValue,
}: {
  numberLabel?: { en: string; ar: string };
  dateLabel?: { en: string; ar: string };
  dueLabel?: { en: string; ar: string };
  documentNumber: string;
  invoiceDate: string;
  dueDate: string;
  extraRows?: Array<{ label: { en: string; ar: string }; value: string }>;
  qrValue?: string | null;
}) {
  const rows = [
    { label: numberLabel, value: documentNumber },
    { label: dateLabel, value: invoiceDate },
    { label: dueLabel, value: dueDate },
    ...(extraRows ?? []),
  ];

  return (
    <table className="bh-inv-top" role="presentation">
      <colgroup>
        <col className="bh-inv-top-meta-col" />
        <col className="bh-inv-top-qr-col" />
      </colgroup>
      <tbody>
        <tr>
          <td className="bh-inv-meta-wrap">
            <table className="bh-inv-meta-table">
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label.en}>
                    <th>
                      <BiLabel en={row.label.en} ar={row.label.ar} />
                    </th>
                    <td>{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
          <td className="bh-inv-qr-wrap">
            {qrValue ? <InvoiceQr value={qrValue} /> : null}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function PartyTable({
  role,
  party,
}: {
  role: { en: string; ar: string };
  party: PartyCard;
}) {
  const fields: Array<{ label: { en: string; ar: string }; value: string }> = [
    { label: L.name, value: party.name },
    { label: L.address, value: party.address },
    { label: L.street, value: party.street },
    { label: L.city, value: party.city },
    { label: L.phone, value: party.phone },
    { label: L.vatNumber, value: party.vatNumber },
  ];

  return (
    <table className="bh-inv-party">
      <thead>
        <tr>
          <th colSpan={2}>
            <span className="bh-inv-party-en">{role.en}</span>
            <span className="bh-inv-party-ar" lang="ar" dir="rtl">
              {role.ar}
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        {fields.map((field) => (
          <tr key={field.label.en}>
            <th>
              <BiLabel en={field.label.en} ar={field.label.ar} />
            </th>
            <td>{field.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TaxInvoiceParties({
  seller,
  buyer,
}: {
  seller: PartyCard;
  buyer: PartyCard;
}) {
  return (
    <table className="bh-inv-parties" role="presentation">
      <tbody>
        <tr>
          <td>
            <PartyTable role={L.seller} party={seller} />
          </td>
          <td>
            <PartyTable role={L.buyer} party={buyer} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export type TaxInvoiceLine = {
  nature: ReactNode;
  unitPrice: string;
  quantity: string;
  taxable: string;
  taxRate: string;
  taxAmount: string;
  subtotal: string;
};

export function TaxInvoiceLineTable({ rows }: { rows: TaxInvoiceLine[] }) {
  const headers: Array<{
    key: keyof TaxInvoiceLine | "index";
    label: { en: string; ar: string };
    align?: "right";
  }> = [
    { key: "index", label: L.lineNo },
    { key: "nature", label: L.nature },
    { key: "unitPrice", label: L.unitPrice, align: "right" },
    { key: "quantity", label: L.quantity, align: "right" },
    { key: "taxable", label: L.taxableAmount, align: "right" },
    { key: "taxRate", label: L.taxRate, align: "right" },
    { key: "taxAmount", label: L.taxAmount, align: "right" },
    { key: "subtotal", label: L.itemSubtotal, align: "right" },
  ];

  const displayRows =
    rows.length > 0
      ? rows
      : [
          {
            nature: "—",
            unitPrice: "—",
            quantity: "—",
            taxable: "—",
            taxRate: "—",
            taxAmount: "—",
            subtotal: "—",
          },
        ];

  return (
    <table className="bh-inv-items">
      <colgroup>
        <col style={{ width: "32px" }} />
        <col />
        <col style={{ width: "78px" }} />
        <col style={{ width: "58px" }} />
        <col style={{ width: "88px" }} />
        <col style={{ width: "58px" }} />
        <col style={{ width: "78px" }} />
        <col style={{ width: "108px" }} />
      </colgroup>
      <thead>
        <tr>
          {headers.map((col) => (
            <th
              key={col.key}
              className={col.align === "right" ? "bh-inv-num" : undefined}
            >
              <BiLabel en={col.label.en} ar={col.label.ar} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {displayRows.map((row, index) => (
          <tr key={index}>
            <td>{index + 1}</td>
            <td>{row.nature}</td>
            <td className="bh-inv-num">{row.unitPrice}</td>
            <td className="bh-inv-num">{row.quantity}</td>
            <td className="bh-inv-num">{row.taxable}</td>
            <td className="bh-inv-num">{row.taxRate}</td>
            <td className="bh-inv-num">{row.taxAmount}</td>
            <td className="bh-inv-num">{row.subtotal}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TaxInvoiceTotals({
  taxable,
  vat,
  total,
  paid,
  balance,
  extraBeforeTotal,
}: {
  taxable: string;
  vat: string;
  total: string;
  paid: string;
  balance: string;
  extraBeforeTotal?: Array<{ label: { en: string; ar: string }; value: string }>;
}) {
  const lines: Array<{
    label: { en: string; ar: string };
    value: string;
    strong?: boolean;
  }> = [
    { label: L.totalTaxable, value: taxable },
    { label: L.totalVat, value: vat },
    ...(extraBeforeTotal ?? []),
    { label: L.totalAmount, value: total, strong: true },
    { label: L.amountPaid, value: paid },
    { label: L.balanceDue, value: balance, strong: true },
  ];

  return (
    <table className="bh-inv-totals">
      <thead>
        <tr>
          <th colSpan={2}>
            <span className="bh-inv-party-en">{L.totalAmounts.en}</span>
            <span className="bh-inv-party-ar" lang="ar" dir="rtl">
              {L.totalAmounts.ar}
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => (
          <tr key={line.label.en} className={line.strong ? "bh-inv-grand" : undefined}>
            <th>
              <BiLabel en={line.label.en} ar={line.label.ar} />
            </th>
            <td className="bh-inv-num">{line.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TaxInvoiceClosing({
  counterpartyLabel,
  counterpartyBalance,
}: {
  counterpartyLabel: string;
  counterpartyBalance?: number | null;
}) {
  const balanceText =
    counterpartyBalance != null && Number.isFinite(counterpartyBalance)
      ? formatInvoiceMoney(counterpartyBalance)
      : null;

  return (
    <section className="bh-inv-closing">
      {balanceText ? (
        <p className="bh-inv-balance-box">
          {counterpartyLabel} <strong>{balanceText}</strong>
        </p>
      ) : null}
      <p className="bh-inv-thanks">{L.thanks.en}</p>
    </section>
  );
}

export function InvoicePrintNotes({ title, body }: { title: string; body: string }) {
  return (
    <section className="bh-inv-notes">
      <p className="bh-inv-notes-title">{title}</p>
      <p className="bh-inv-notes-body">{body}</p>
    </section>
  );
}

/** @deprecated Prefer TaxInvoice* components. Kept for non-tax documents. */
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
    <>
      <TaxInvoiceMasthead
        logoUrl={logoUrl}
        storeName={storeName}
        titleEn={title.toUpperCase()}
        titleAr=""
      />
      <TaxInvoiceMeta
        documentNumber={status ? `${documentNumber} · ${status}` : documentNumber}
        invoiceDate={metaRows[0]?.value ?? "—"}
        dueDate={metaRows[1]?.value ?? "—"}
      />
    </>
  );
}

export function InvoicePrintParties({
  left,
  right,
}: {
  left: { title: string; lines: string[] };
  right: { title: string; lines: string[] };
}) {
  const toParty = (block: { title: string; lines: string[] }): PartyCard => ({
    name: block.lines[0] ?? "—",
    address: block.lines[1] ?? "—",
    street: block.lines[2] ?? "—",
    city: block.lines[3] ?? "—",
    phone: block.lines[4] ?? "—",
    vatNumber: block.lines[5] ?? "—",
  });
  return <TaxInvoiceParties seller={toParty(left)} buyer={toParty(right)} />;
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
}: {
  lines: Array<{ label: string; value: string; grand?: boolean; balance?: boolean }>;
  highlightBalance?: boolean;
}) {
  return (
    <table className="bh-inv-totals">
      <tbody>
        {lines.map((line) => (
          <tr
            key={line.label}
            className={line.grand || line.balance ? "bh-inv-grand" : undefined}
          >
            <th>{line.label}</th>
            <td className="bh-inv-num">{line.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function InvoicePrintFooter({ children }: { children: ReactNode }) {
  return <footer className="bh-inv-closing">{children}</footer>;
}
