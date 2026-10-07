const FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])',
  "select",
  "textarea",
].join(",");

const SUBMIT_SELECTOR =
  'button[type="submit"]:not([disabled]), input[type="submit"]:not([disabled]), [data-form-enter-submit]:not([disabled])';

function isVisible(el: HTMLElement): boolean {
  if (el.tabIndex < 0) return false;
  if (el.closest('[data-enter-nav="off"]')) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  return el.getClientRects().length > 0;
}

function sortByTabOrder(elements: HTMLElement[]): HTMLElement[] {
  const positive = elements
    .filter((el) => el.tabIndex > 0)
    .sort((a, b) => a.tabIndex - b.tabIndex);
  const zero = elements.filter((el) => el.tabIndex <= 0);
  return [...positive, ...zero];
}

function uniqueElements(elements: HTMLElement[]): HTMLElement[] {
  return Array.from(new Set(elements));
}

function findNavigationContainer(target: HTMLElement): HTMLElement | null {
  const marked = target.closest("[data-form-enter-nav]");
  if (marked instanceof HTMLElement) return marked;

  const form = target.closest("form");
  if (form instanceof HTMLFormElement) return form;

  return null;
}

function getLinkedSubmitButtons(form: HTMLFormElement): HTMLElement[] {
  if (!form.id) return [];
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      `button[form="${CSS.escape(form.id)}"][type="submit"]:not([disabled]), input[form="${CSS.escape(form.id)}"][type="submit"]:not([disabled])`,
    ),
  );
}

function getScopedRoot(container: HTMLElement): HTMLElement | null {
  return (
    container.closest('[role="dialog"]') ??
    container.closest("[data-form-enter-scope]")
  );
}

function getExternalActionButtons(container: HTMLElement): HTMLElement[] {
  const scope = getScopedRoot(container);
  if (!(scope instanceof HTMLElement)) return [];

  const skipLabels = new Set(["cancel", "close", "back", "discard"]);

  const footerButtons: HTMLElement[] = [];
  scope.querySelectorAll("[data-form-enter-footer]").forEach((footer) => {
    footer.querySelectorAll<HTMLElement>("button:not([disabled])").forEach((btn) => {
      if (btn.hasAttribute("data-enter-nav-skip")) return;
      const label = btn.textContent?.trim().toLowerCase() ?? "";
      if (skipLabels.has(label) && !btn.hasAttribute("data-form-enter-submit")) return;
      if (!container.contains(btn)) footerButtons.push(btn);
    });
  });

  const markedSubmits = Array.from(scope.querySelectorAll<HTMLElement>(SUBMIT_SELECTOR)).filter(
    (el) => !container.contains(el),
  );

  return sortByTabOrder(uniqueElements([...footerButtons, ...markedSubmits])).filter(isVisible);
}

export function getEnterNavigationOrder(container: HTMLElement): HTMLElement[] {
  const fields = sortByTabOrder(
    uniqueElements(
      Array.from(container.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).filter(isVisible),
    ),
  );

  const submitsInContainer = Array.from(
    container.querySelectorAll<HTMLElement>(SUBMIT_SELECTOR),
  ).filter(isVisible);

  const linkedSubmits =
    container instanceof HTMLFormElement ? getLinkedSubmitButtons(container) : [];

  const externalActions = getExternalActionButtons(container);

  const submits = sortByTabOrder(
    uniqueElements([...submitsInContainer, ...linkedSubmits, ...externalActions]),
  );

  return uniqueElements([...fields, ...submits]);
}

function isNavigationSource(target: HTMLElement): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    const skip = new Set([
      "hidden",
      "submit",
      "button",
      "reset",
      "checkbox",
      "radio",
      "file",
    ]);
    return !skip.has(target.type);
  }
  return false;
}

function isSubmitAction(target: HTMLElement): boolean {
  if (target instanceof HTMLInputElement && target.type === "submit") return true;
  if (target instanceof HTMLButtonElement && target.type === "submit") return true;
  return target.matches("[data-form-enter-submit]");
}

export function handleFormEnterNavigation(event: KeyboardEvent): void {
  if (event.key !== "Enter") return;
  if (event.defaultPrevented) return;
  if (event.isComposing) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.isContentEditable) return;
  if (target.closest('[data-enter-nav="off"]')) return;
  if (target.matches("[data-group-model-input]")) return;

  if (target instanceof HTMLTextAreaElement && event.shiftKey) return;

  if (target.getAttribute("aria-expanded") === "true") return;
  if (target.closest('[role="listbox"], [role="menu"]')) return;

  const container = findNavigationContainer(target);
  if (!container) return;

  if (isSubmitAction(target)) {
    if (target instanceof HTMLButtonElement && target.type === "button") {
      event.preventDefault();
      target.click();
    }
    return;
  }

  if (!isNavigationSource(target)) return;

  const focusables = getEnterNavigationOrder(container);
  const currentIndex = focusables.indexOf(target);
  if (currentIndex === -1) return;

  const next = focusables[currentIndex + 1];
  if (!next) return;

  event.preventDefault();
  next.focus();
}
