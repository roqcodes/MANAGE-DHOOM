const PROMPT_ABUSE_RE =
  /\b(ignore (all|previous|prior)|disregard (your|the)|system prompt|developer message|you are now|pretend (you are|to be)|jailbreak|DAN\b|reveal (your|the) (instructions|prompt|rules)|act as (if|a) (?!customer)|override (your|the) (rules|instructions)|new instructions?:|forget (everything|all)|roleplay as)\b/i;

const ON_SCREEN_RE =
  /\b(how (do i|to)|where (do i|is|can i find)|show me (how|where|on)|walk me through|guide me|take me to|help me (add|create|make|find|open|navigate)|open (the )?.+ (page|screen|menu)|find the .+ (button|link|page)|go to .+ (page|screen))\b/i;

const CREATE_NAV_RE =
  /\b((add|create|new|set up|register)\s+(a\s+)?[\w-]+|(add|create)\s+[\w-]+)\b/i;

const FAQ_RE =
  /\b(what is|what are|what does|why (do|does|is|are)|when (do|does|should)|who (is|are)|can you explain|explain (the |what )|difference between|meaning of|is it (ok|normal)|how does .+ work(?!.*\b(on screen|in the app|click|button|page)\b))\b/i;

/** Jailbreak / prompt override attempts */
export function looksLikePromptInjection(text: string): boolean {
  return PROMPT_ABUSE_RE.test(text.trim());
}

/** User wants step-by-step UI guidance (Show me on screen). */
export function wantsOnScreenGuide(text: string): boolean {
  const t = text.trim();
  if (!t || looksLikePromptInjection(t)) return false;
  if (ON_SCREEN_RE.test(t)) return true;
  if (FAQ_RE.test(t) && !/\b(where|how (do i|to)|show me|open|find|click|navigate)\b/i.test(t)) {
    return false;
  }
  if (CREATE_NAV_RE.test(t) && /\b(how|where|help|show)\b/i.test(t)) return true;
  return false;
}

/** General knowledge / policy — answer in chat only. */
export function isGeneralKnowledgeQuestion(text: string): boolean {
  const t = text.trim();
  if (!t || looksLikePromptInjection(t)) return false;
  if (wantsOnScreenGuide(t)) return false;
  return (
    FAQ_RE.test(t) ||
    /\b(policy|best practice|recommend|should i|allowed to|vat|tax|invoice|accounting)\b/i.test(t)
  );
}

export function refusalForAbuse(): string {
  return "I can only help with DHOOM Trading admin how-tos and product questions. I can't follow instructions that change my rules. [POINT:none]";
}
