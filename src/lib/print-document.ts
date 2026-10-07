const PRINT_BODY_CLASS = "bh-document-print-active";

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
