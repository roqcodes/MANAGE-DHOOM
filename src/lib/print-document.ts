const PRINT_BODY_CLASS = "bh-document-print-active";

/** Append `?print=1` or `?download=1` for direct print / PDF routes. */
export function documentPrintUrl(
  path: string,
  mode: "print" | "download" = "print",
): string {
  const url = new URL(path, "http://print.local");
  if (mode === "download") {
    url.searchParams.set("download", "1");
    url.searchParams.delete("print");
  } else {
    url.searchParams.set("print", "1");
    url.searchParams.delete("download");
  }
  return `${url.pathname}${url.search}`;
}

/** Print only the given element (hides the rest of the page, including modals/sidebar). */
export function printDocumentElement(element: HTMLElement): void {
  element.setAttribute("data-print-area", "true");
  document.body.classList.add(PRINT_BODY_CLASS);

  const cleanup = () => {
    element.removeAttribute("data-print-area");
    document.body.classList.remove(PRINT_BODY_CLASS);
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup);
  window.print();
}
