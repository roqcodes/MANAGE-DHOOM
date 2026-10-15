export type AssistantReportHighlight = {
  label: string;
  value: string;
};

export type AssistantReport = {
  title: string;
  subtitle?: string;
  highlights?: AssistantReportHighlight[];
  columns?: string[];
  rows?: Array<Array<string | number | null>>;
  note?: string;
  ctaLabel?: string;
  ctaPath?: string;
};

const REPORT_BLOCK_RE = /\[REPORT\]([\s\S]*?)\[\/REPORT\]/i;

export function parseReportBlock(raw: string): {
  spoken: string;
  report: AssistantReport | null;
} {
  const match = raw.match(REPORT_BLOCK_RE);
  if (!match) {
    return { spoken: raw, report: null };
  }
  const spoken = raw.replace(REPORT_BLOCK_RE, "").trim();
  try {
    const parsed = JSON.parse(match[1].trim()) as AssistantReport;
    if (!parsed || typeof parsed.title !== "string") {
      return { spoken, report: null };
    }
    return { spoken, report: parsed };
  } catch {
    return { spoken, report: null };
  }
}

export function stripReportBlock(raw: string): string {
  return raw.replace(REPORT_BLOCK_RE, "").trim();
}
