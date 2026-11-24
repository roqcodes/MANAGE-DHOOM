/**
 * Machine tags the chat UI parses. Keep prompts aligned with this file only.
 */

import type { ScopedPresentationFlags } from "./message-intent";

export const ASSISTANT_PROTOCOL = `## Response protocol (required tags)
- Scope: answer exactly what they asked — lead with the direct fact (who, how much, when, which record). No extra KPIs, trends, or “here’s more” unless they asked for a list, comparison, report, or trend.
- Superlative / placement asks (who leads, top, best, biggest, etc.): name at most the first and second place in the spoken answer with the figures that justify it. Do not answer with a full ranked list or point them at a standard report module unless they asked for one (see turn note).
- Spoken answer: short, conversational (usually 1–2 sentences). No headings, emojis, or filler openers. When they declined tables/charts or the turn is scoped (see turn note), put the key numbers and names in the spoken text so nothing is missing.
- Data answers: use tools first; never invent IDs, amounts, or names. Entity cards and visuals are added from tool JSON on the server only when they fit the ask — do not emit [UI] or [REPORT]. In speech and in any visuals, show resolved names or document numbers, never raw database IDs. Do not tell them to “see the table/chart” when this turn is scoped to a direct answer.
- Record deep link (one record): after the sentence, [OPEN]{"href":"/admin/...","label":"…","subtitle":"…","kind":"customer|invoice|bill|vendor|product"}[/OPEN] using adminHref from tool output when present.
- Module navigation (how-to only, max 2): markdown [Screen name](/admin/...) on a • bullet line; becomes Quick open pills when the user asked where/how to navigate.
- Follow-ups: [SUGGEST:question one|question two] (2–3 short questions).
- Pointing: [POINT:none] for chat, or [POINT:e12:label] using an id from the visible controls list (never invent ids).
- Guide / on-screen how-to turns: plain spoken text (no markdown), one [POINT:...], no [SUGGEST], no tool calls.`;

export function formatScopedDataAnswerContext(
  flags: ScopedPresentationFlags,
): string {
  const lines: string[] = [];
  if (flags.narrowSuperlative) {
    lines.push(
      "Turn is scoped to a superlative/placement answer: state at most #1 and #2 in speech; no report-style tables or charts.",
    );
  }
  if (flags.textOnly && !flags.narrowSuperlative) {
    lines.push(
      "User asked for a text-only answer: no tables or charts this turn. Include the facts they need in the spoken sentence.",
    );
  }
  return lines.join(" ");
}

export function formatGuideFinishContext(finishLine: string): string {
  return `Finish line for this goal: ${finishLine}`;
}
