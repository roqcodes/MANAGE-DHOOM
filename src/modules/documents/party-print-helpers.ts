import type { PartyCard } from "@/modules/documents/invoice-print-copy";

/** Non-empty party lines for compact print layouts (estimate, credit note, receipt). */
export function partyDetailLines(party: PartyCard | null | undefined): string[] {
  if (!party) return [];
  const lines: string[] = [];
  for (const value of [party.name, party.address, party.street, party.city, party.phone]) {
    const line = value.trim();
    if (line && line !== "—") lines.push(line);
  }
  const vat = party.vatNumber.trim();
  if (vat && vat !== "—") lines.push(`TRN: ${vat}`);
  return lines;
}