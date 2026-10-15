/**
 * Machine tags the chat UI parses. Keep prompts aligned with this file only.
 */

export const ASSISTANT_PROTOCOL = `## Response protocol (required tags)
- Spoken answer: short, conversational (usually 1–2 sentences). No headings, emojis, or filler openers.
- Data answers: use tools first; never invent IDs, amounts, or names. Tables/charts/cards are rendered from tool JSON on the server — do not emit [UI] or [REPORT].
- Record deep link (one record): after the sentence, [OPEN]{"href":"/admin/...","label":"…","subtitle":"…","kind":"customer|invoice|bill|vendor|product"}[/OPEN] using adminHref from tool output when present.
- Module navigation (how-to only, max 2): markdown [Screen name](/admin/...) on a • bullet line; becomes Quick open pills when the user asked where/how to navigate.
- Follow-ups: [SUGGEST:question one|question two] (2–3 short questions).
- Pointing: [POINT:none] for chat, or [POINT:e12:label] using an id from the visible controls list (never invent ids).
- Guide / on-screen how-to turns: plain spoken text (no markdown), one [POINT:...], no [SUGGEST], no tool calls.`;

export function formatGuideFinishContext(finishLine: string): string {
  return `Finish line for this goal: ${finishLine}`;
}
