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

export function refusalForAbuse(): string {
  return "I can't change my rules or role — ask me about DHOOM admin or your live data. [POINT:none]";
}
