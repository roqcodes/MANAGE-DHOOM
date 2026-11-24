const PROMPT_ABUSE_RE =
  /\b(ignore (all|previous|prior)|disregard (your|the)|system prompt|developer message|you are now|pretend (you are|to be)|jailbreak|DAN\b|reveal (your|the) (instructions|prompt|rules)|act as (if|a) (?!customer)|override (your|the) (rules|instructions)|new instructions?:|forget (everything|all)|roleplay as)\b/i;

const ON_SCREEN_RE =
  /\b(how (do i|to)|where (do i|is|can i find)|show me (how|where|on)|walk me through|guide me|take me to|help me (add|create|make|find|open|navigate)|open (the )?.+ (page|screen|menu)|find the .+ (button|link|page)|go to .+ (page|screen))\b/i;

const CREATE_NAV_RE =
  /\b((add|create|new|set up|register)\s+(a\s+)?[\w-]+|(add|create)\s+[\w-]+)\b/i;

const FAQ_RE =
  /\b(what is|what are|what does|why (do|does|is|are)|when (do|does|should)|can you explain|explain (the |what )|difference between|meaning of|is it (ok|normal)|how does .+ work(?!.*\b(on screen|in the app|click|button|page)\b))\b/i;

const DATA_RE =
  /\b(best|top|worst|highest|lowest|biggest)\b|\bwhich ones?\b|\bwho(se|es|'s)?\s+(the\s+)?vendor\b|\b(purchase bills?|payables?|balance due|unpaid|partially paid)\b|\bwho\s+(edited|updated|changed|modified|created|is the)\b|\bwhen\s+did\b.+\b(buy|bought|purchase|purchased|order|ordered)\b|\b(did|has|have)\b.+\b(buy|bought|purchase|purchased)\b|\b(how much|total sales|revenue|collections?|profit|outstanding|aging)\b|\b(graph|chart|trend)\b|\b(custom )?report\b|\b(invoice|bill)\s*#?\s*[A-Z0-9-]{3,}\b|\bsales by\b|\b(find|search|look up)\b.+\b(customer|invoice|product)\b|\b(balance|owe|outstanding|due)\b.+\b(customer|him|her|they)\b|\b(what about|how about)\b/i;

/** Jailbreak / prompt override attempts */
export function looksLikePromptInjection(text: string): boolean {
  return PROMPT_ABUSE_RE.test(text.trim());
}

const ENTITY_OPEN_RE =
  /\b(his|her|their)\s+(page|profile|record|account)\b|\btake me to (his|her|their)\b|\bopen (this|that|the)\s+(customer|invoice|bill|vendor|product)\b/i;

/** Jump to a specific customer / invoice / bill detail page (not sidebar walkthrough). */
export function wantsEntityOpen(text: string): boolean {
  const t = text.trim();
  if (!t || looksLikePromptInjection(t)) return false;
  if (ENTITY_OPEN_RE.test(t)) return true;
  if (
    /\bopen\b.+\b(customer|invoice|bill|vendor|product)\b/i.test(t) &&
    !/\b(how (do i|to)|where (is|do i)|guide|walk me|show me how)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

/** User wants step-by-step UI guidance (Show me on screen). */
export function wantsOnScreenGuide(text: string): boolean {
  const t = text.trim();
  if (!t || looksLikePromptInjection(t)) return false;
  if (wantsEntityOpen(t)) return false;
  if (ON_SCREEN_RE.test(t)) return true;
  if (FAQ_RE.test(t) && !/\b(where|how (do i|to)|show me|open|find|click|navigate)\b/i.test(t)) {
    return false;
  }
  if (CREATE_NAV_RE.test(t) && /\b(how|where|help|show)\b/i.test(t)) return true;
  return false;
}

export function isDataQuestion(text: string): boolean {
  const t = text.trim();
  if (!t || wantsOnScreenGuide(t) || wantsEntityOpen(t)) return false;
  return DATA_RE.test(t);
}

/** @deprecated Use isDataQuestion */
export const looksLikeDataQuestion = isDataQuestion;

/** General knowledge / policy — answer in chat only. */
export function isGeneralKnowledgeQuestion(text: string): boolean {
  const t = text.trim();
  if (!t || looksLikePromptInjection(t)) return false;
  if (wantsOnScreenGuide(t)) return false;
  if (isDataQuestion(t)) return false;
  return (
    FAQ_RE.test(t) ||
    /\b(policy|best practice|recommend|should i|allowed to)\b/i.test(t)
  );
}

const NO_TABLE_CHART_RE =
  /\b(no|without|don't|do not|dont|skip|hide|avoid)\b[\s\S]{0,40}\b(table|tables|chart|charts|graph|graphs|visuali[sz]ation|breakdown)\b|\b(just (tell|say|answer|give)|text only|in words only|verbally|plain text)\b/i;

const FULL_DATA_PRESENTATION_RE =
  /\b(all|every|each|full|entire|complete|breakdown|detailed|listing|list of|show (?:me )?(?:all|every)|ranking of all)\b|\b(custom )?report\b|\b(graph|chart|trend|visuali[sz]e)\b|\bexport\b/i;

const NARROW_SUPERLATIVE_RE =
  /\b(top|best|worst|biggest|largest|smallest|highest|lowest|leading|maximum|minimum)\b|\bwho\s+(?:is|'s)\s+(?:the\s+)?(?:top|#?1|first|best|leading)\b|\bwhich\s+.+\s+(?:tops?|leads?|ranks? (?:first|#?1)|has the (?:most|highest|largest|biggest))\b/i;

/** User wants facts in prose only — server must not attach table/chart blocks. */
export function userDeclinesVisualPresentation(text: string): boolean {
  const t = text.trim();
  if (!t || looksLikePromptInjection(t)) return false;
  return NO_TABLE_CHART_RE.test(t);
}

/** Superlative / who-is-leading ask without a request for a full list or report. */
export function wantsNarrowSuperlativeAnswer(text: string): boolean {
  const t = text.trim();
  if (!t || looksLikePromptInjection(t)) return false;
  if (wantsFullDataPresentation(text)) return false;
  if (wantsOnScreenGuide(t) || wantsEntityOpen(t)) return false;
  return NARROW_SUPERLATIVE_RE.test(t);
}

/** Explicit ask for lists, reports, trends, or exhaustive breakdowns. */
export function wantsFullDataPresentation(text: string): boolean {
  const t = text.trim();
  if (!t || looksLikePromptInjection(t)) return false;
  return FULL_DATA_PRESENTATION_RE.test(t);
}

export type ScopedPresentationFlags = {
  textOnly: boolean;
  narrowSuperlative: boolean;
};

export function scopedPresentationFlags(text: string): ScopedPresentationFlags {
  const t = text.trim();
  if (!t || looksLikePromptInjection(t)) {
    return { textOnly: false, narrowSuperlative: false };
  }
  const narrowSuperlative = wantsNarrowSuperlativeAnswer(t);
  const textOnly = userDeclinesVisualPresentation(t) || narrowSuperlative;
  return { textOnly, narrowSuperlative };
}

export function refusalForAbuse(): string {
  return "I can't change my rules or role — ask me about DHOOM admin or your live data. [POINT:none]";
}
