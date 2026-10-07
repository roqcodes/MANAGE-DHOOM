type AssistantMessage = {
  content?: string | null;
  reasoning?: string | null;
};

const SAFETY_LINE =
  /^\s*(User|Response|Prompt)\s+Safety\s*:\s*.+$/i;

export function isSafetyClassifierOnly(text: string): boolean {
  const lines = text
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return true;
  return lines.every((line) => SAFETY_LINE.test(line));
}

export function stripSafetyClassifierPreamble(text: string): string {
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length && SAFETY_LINE.test(lines[i].trim())) {
    i += 1;
  }
  return lines.slice(i).join("\n").trim();
}

export function extractAssistantText(
  message: AssistantMessage | undefined,
): string | null {
  if (!message) return null;

  const raw = message.content?.trim() ?? "";
  const cleaned = raw ? stripSafetyClassifierPreamble(raw) : "";
  if (cleaned && !isSafetyClassifierOnly(cleaned)) {
    return cleaned;
  }

  const reasoning = message.reasoning?.trim() ?? "";
  const reasoningClean = reasoning
    ? stripSafetyClassifierPreamble(reasoning)
    : "";
  if (reasoningClean && !isSafetyClassifierOnly(reasoningClean)) {
    return reasoningClean;
  }

  if (raw && isSafetyClassifierOnly(raw)) {
    return null;
  }

  return cleaned || null;
}

export const EMPTY_MODEL_REPLY_MESSAGE =
  "The model returned an empty or blocked reply. Trying the next provider…";
