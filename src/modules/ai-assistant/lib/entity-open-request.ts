import type { RecordKind } from "./record-target";
import { inferRecordGuideTarget } from "./record-target";

export type EntityOpenRequest = {
  kind: RecordKind;
  kindLabel: string;
  query: string;
  tokens: string[];
  displayName: string;
};

type ChatTurn = { role: string; content: string };

const PRONOUN_OPEN_RE =
  /\b(his|her|their|this)\s+(page|profile|record|account)\b|\btake me to (his|her|their)\b|\bopen (this|that|the)\s+(customer|invoice|bill|vendor|product|order|estimate|payment)\b|\b(show|view)\s+.+\s+(customer|invoice|bill)\s+page\b/i;

export function inferEntityOpenRequest(
  userAsk: string,
  history: ChatTurn[] = [],
): EntityOpenRequest | null {
  const extra: ChatTurn[] = [];
  if (PRONOUN_OPEN_RE.test(userAsk) && history.length > 0) {
    extra.push(...history.slice(-6));
  }
  const record = inferRecordGuideTarget(userAsk, [
    ...extra,
    ...history.slice(-6),
  ]);
  if (!record) return null;

  let displayName = record.displayName;
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role !== "assistant") continue;
    const bold = turn.content.match(/\*\*([^*]{2,60})\*\*/);
    if (bold) {
      displayName = bold[1].trim();
      break;
    }
  }

  const weakLabel =
    !displayName ||
    ["something", "like", "customer", "open"].includes(displayName.toLowerCase());
  const query =
    record.tokens.length > 0
      ? record.tokens[record.tokens.length - 1]
      : record.query;

  return {
    kind: record.kind,
    kindLabel: record.kindLabel,
    query,
    tokens: record.tokens,
    displayName: weakLabel ? query : displayName,
  };
}
