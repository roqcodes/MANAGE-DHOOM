import { stripOpenBlock } from "./parse-open";
import { stripReportBlock } from "./parse-report";
import { stripUiBlock } from "./parse-ui";

export type PointDirective = {
  id: string | null;
  label: string;
  spoken: string;
  done: boolean;
};

const POINT_RE = /\[POINT:([^\]]+)\]/i;
const SUGGEST_RE = /\[SUGGEST:([^\]]+)\]/i;

export function parseSuggestDirective(raw: string): string[] {
  const match = raw.match(SUGGEST_RE);
  if (!match) return [];
  return match[1]
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function stripSuggestAndPoint(raw: string): string {
  return stripOpenBlock(
    stripUiBlock(
      stripReportBlock(raw.replace(POINT_RE, "").replace(SUGGEST_RE, "")),
    ),
  ).trim();
}

function stripAssistantDirectives(raw: string): string {
  return stripSuggestAndPoint(raw);
}

export function parsePointDirective(raw: string): PointDirective {
  const match = raw.match(POINT_RE);
  const spoken = stripAssistantDirectives(raw);
  if (!match) {
    return { id: null, label: "", spoken, done: false };
  }

  const inner = match[1].trim();
  if (/^none$/i.test(inner) || /^done$/i.test(inner)) {
    return { id: null, label: "", spoken, done: true };
  }

  const [id, ...labelParts] = inner.split(":");
  const label = labelParts.join(":").trim();
  if (!id || !/^e\d+$/i.test(id)) {
    return { id: null, label, spoken, done: false };
  }

  return {
    id: id.toLowerCase(),
    label,
    spoken,
    done: false,
  };
}

export function looksLikeHowTo(text: string): boolean {
  return /how (do i|to)|where (do i|is|can i)|show me|walk me|guide me|take me|help me (add|create|make|find|open)/i.test(
    text,
  );
}

export { wantsOnScreenGuide } from "./message-intent";
