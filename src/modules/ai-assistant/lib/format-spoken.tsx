import React from "react";

type Segment = { type: "text" | "bold"; value: string };

export function parseSpokenSegments(text: string): Segment[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return { type: "bold", value: part.slice(2, -2) };
    }
    return { type: "text", value: part };
  });
}

/** Strip markdown artifacts for compact UI (guide card title). */
export function plainSpoken(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function shortenGuideHint(say: string, max = 64): string {
  const plain = plainSpoken(say);
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > 24 ? cut.slice(0, lastSpace) : cut;
  return `${base}…`;
}

export function guideCardCopy(say: string, label?: string) {
  const name = plainSpoken(label || "");
  const hint = shortenGuideHint(say, name ? 48 : 72);
  return {
    title: name || hint,
    subtitle: name && hint && hint !== name ? hint : null,
  };
}

function SpokenLine({ line }: { line: string }) {
  const segments = parseSpokenSegments(line);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "bold" ? (
          <strong key={i} className="font-semibold text-foreground">
            {seg.value}
          </strong>
        ) : (
          <React.Fragment key={i}>{seg.value}</React.Fragment>
        ),
      )}
    </>
  );
}

const BULLET_LINE_RE = /^(?:•|\*|-)\s+/;

function stripBulletPrefix(line: string): string {
  // Strip emojis like ✨, 🤖, ⭐ if any leaked in
  return line
    .replace(BULLET_LINE_RE, "")
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    .trim();
}

export function FormattedSpoken({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const lines = text.split(/\n+/).filter((line) => line.trim().length > 0);
  if (lines.length <= 1) {
    const single = lines[0] ?? text;
    if (BULLET_LINE_RE.test(single.trim())) {
      return (
        <ul className={`list-disc space-y-1.5 pl-4 ${className ?? ""}`}>
          <li className="leading-snug">
            <SpokenLine line={stripBulletPrefix(single.trim())} />
          </li>
        </ul>
      );
    }
    return (
      <span className={className}>
        <SpokenLine line={single} />
      </span>
    );
  }

  const bulletLines = lines.filter((line) => BULLET_LINE_RE.test(line.trim()));
  const proseLines = lines.filter((line) => !BULLET_LINE_RE.test(line.trim()));

  return (
    <span className={className}>
      {proseLines.map((line, i) => (
        <span key={`p-${i}`} className={i > 0 ? "mt-2 block" : "block"}>
          <SpokenLine line={line} />
        </span>
      ))}
      {bulletLines.length > 0 && (
        <ul
          className={`list-disc space-y-1.5 pl-4 ${proseLines.length > 0 ? "mt-2" : ""}`}
        >
          {bulletLines.map((line, i) => (
            <li key={`b-${i}`} className="leading-snug">
              <SpokenLine line={stripBulletPrefix(line.trim())} />
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
