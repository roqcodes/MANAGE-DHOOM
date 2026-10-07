/** html2canvas cannot parse modern CSS color functions (lab, oklch, etc.). */

const MODERN_COLOR_PATTERN = /(lab|oklch|oklab|lch|color)\(/i;

const COLOR_PROPS = [
  "color",
  "backgroundColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
  "textDecorationColor",
  "caretColor",
  "columnRuleColor",
] as const;

const LAYOUT_PROPS = [
  "display",
  "position",
  "top",
  "left",
  "right",
  "bottom",
  "width",
  "height",
  "maxWidth",
  "minWidth",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopStyle",
  "borderRightStyle",
  "borderBottomStyle",
  "borderLeftStyle",
  "borderRadius",
  "fontSize",
  "fontWeight",
  "fontFamily",
  "lineHeight",
  "textAlign",
  "verticalAlign",
  "whiteSpace",
  "textTransform",
  "letterSpacing",
  "boxSizing",
  "flex",
  "flexDirection",
  "flexWrap",
  "alignItems",
  "justifyContent",
  "gap",
  "gridTemplateColumns",
  "gridColumn",
  "opacity",
] as const;

const INLINE_PROPS = [...COLOR_PROPS, ...LAYOUT_PROPS] as const;

let colorProbe: HTMLDivElement | null = null;

function getColorProbe(): HTMLDivElement {
  if (!colorProbe) {
    colorProbe = document.createElement("div");
    colorProbe.style.display = "none";
    document.body.appendChild(colorProbe);
  }
  return colorProbe;
}

function toSupportedColor(
  value: string,
  prop: "color" | "backgroundColor",
): string {
  if (!value || value === "transparent") return value;
  if (!MODERN_COLOR_PATTERN.test(value)) return value;

  const probe = getColorProbe();
  probe.style.color = "";
  probe.style.backgroundColor = "";
  probe.style[prop] = value;
  const resolved = getComputedStyle(probe)[prop];
  if (resolved && !MODERN_COLOR_PATTERN.test(resolved)) {
    return resolved;
  }

  return prop === "backgroundColor" ? "transparent" : "#000000";
}

function toCssProperty(prop: string): string {
  return prop.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function isColorProp(prop: (typeof INLINE_PROPS)[number]): prop is (typeof COLOR_PROPS)[number] {
  return (COLOR_PROPS as readonly string[]).includes(prop);
}

export function inlineStylesForHtml2Canvas(
  clonedRoot: HTMLElement,
  sourceRoot: HTMLElement,
): void {
  const sourceNodes = [sourceRoot, ...sourceRoot.querySelectorAll("*")];
  const clonedNodes = [clonedRoot, ...clonedRoot.querySelectorAll("*")];

  clonedNodes.forEach((cloned, index) => {
    if (!(cloned instanceof HTMLElement)) return;
    const source = sourceNodes[index];
    if (!(source instanceof HTMLElement)) return;

    const computed = window.getComputedStyle(source);
    for (const prop of INLINE_PROPS) {
      const raw = computed[prop];
      if (!raw) continue;

      const normalized = isColorProp(prop)
        ? toSupportedColor(
            raw,
            prop === "backgroundColor" ? "backgroundColor" : "color",
          )
        : raw;

      cloned.style.setProperty(toCssProperty(prop), normalized, "important");
    }
  });
}

function stripUnsupportedStylesheets(clonedDoc: Document): void {
  clonedDoc.querySelectorAll("style, link[rel='stylesheet']").forEach((node) => {
    node.parentNode?.removeChild(node);
  });
}

export function buildHtml2CanvasOptions(sourceRoot: HTMLElement) {
  return {
    scale: 2,
    useCORS: true,
    onclone: (clonedDoc: Document, clonedElement: HTMLElement) => {
      inlineStylesForHtml2Canvas(clonedElement, sourceRoot);
      stripUnsupportedStylesheets(clonedDoc);
    },
  };
}

type PdfOptions = {
  margin?: number;
  orientation?: "portrait" | "landscape";
};

export async function downloadElementAsPdf(
  element: HTMLElement,
  filename: string,
  options: PdfOptions = {},
): Promise<void> {
  const html2pdf = (await import("html2pdf.js")).default;
  await html2pdf()
    .set({
      margin: options.margin ?? 12,
      filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: buildHtml2CanvasOptions(element),
      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: options.orientation ?? "portrait",
      },
    })
    .from(element)
    .save();
}
