import type { ScreenSnapshot } from "./screen-snapshot";
import {
  inferTargetHrefFromGoal,
  isOnTargetHref,
} from "./sidebar-nav-visibility";

export type GoalKind = "open_create" | "open_page" | "explain_form" | "complete_save" | "generic";

export type GoalIntent = {
  kind: GoalKind;
  finishLine: string;
  doneLog: string;
};

const CREATE_RE =
  /\b(add|create|new|make)\b.+\b(product|item|sku|category|brand|order|invoice|customer|vendor|bill|employee|store|transfer|expense)\b|\b(add|create)\s+(a\s+)?(new\s+)?/i;

const FORM_RE =
  /\b(form|fields?|fill|what (do i|should i) (enter|put|type|fill)|explain the (form|fields)|each field)\b/i;

const SAVE_RE = /\b(save|submit|finish creating|complete the (product|item|form))\b/i;

const OPEN_PAGE_RE = /\b(where|open|go to|find|show me|take me to|navigate)\b/i;

const HEADER_QUICK_CREATE_RE =
  /\b(quick\s*create|header\s+create|from\s+(the\s+)?header|create\s+(button|menu|dropdown)|top\s+create|blue\s+create)\b/i;

const GOAL_ENTITY_RULES: { id: string; re: RegExp }[] = [
  { id: "product", re: /\b(products?|items?|sku|variant)\b/i },
  { id: "customer", re: /\b(customers?|client)\b/i },
  { id: "vendor", re: /\b(vendors?|suppliers?)\b/i },
  { id: "employee", re: /\b(employees?|staff|hr)\b/i },
  { id: "invoice", re: /\b(invoices?)\b/i },
  { id: "estimate", re: /\b(estimates?|quotes?)\b/i },
  { id: "order", re: /\b(sales?\s+orders?|purchase\s+orders?)\b/i },
  { id: "bill", re: /\b(bills?|purchase\s+bills?)\b/i },
  { id: "payment", re: /\b(payments?)\b/i },
  { id: "expense", re: /\b(expenses?)\b/i },
  { id: "store", re: /\b(stores?|warehouse)\b/i },
  { id: "transfer", re: /\b(transfers?|transfer\s+requests?)\b/i },
  { id: "inventory", re: /\b(inventory|stock)\b/i },
  { id: "category", re: /\b(categor(y|ies))\b/i },
  { id: "brand", re: /\b(brands?)\b/i },
];

const PATH_ENTITY_RULES: { id: string; segment: string }[] = [
  { id: "product", segment: "/products" },
  { id: "customer", segment: "/customers" },
  { id: "vendor", segment: "/vendors" },
  { id: "employee", segment: "/employees" },
  { id: "invoice", segment: "/invoices" },
  { id: "estimate", segment: "/estimates" },
  { id: "order", segment: "/sales-orders" },
  { id: "order", segment: "/purchase-orders" },
  { id: "bill", segment: "/purchase-bills" },
  { id: "payment", segment: "/payments" },
  { id: "expense", segment: "/expenses" },
  { id: "store", segment: "/stores" },
  { id: "transfer", segment: "/transfer" },
  { id: "inventory", segment: "/inventory" },
  { id: "category", segment: "/categories" },
  { id: "brand", segment: "/brands" },
];

export function goalEntityHints(goal: string): string[] {
  const g = goal.trim();
  const found = new Set<string>();
  for (const { id, re } of GOAL_ENTITY_RULES) {
    if (re.test(g)) found.add(id);
  }
  return [...found];
}

export function pathEntityHint(path: string): string | null {
  const base = path.split("?")[0];
  for (const { id, segment } of PATH_ENTITY_RULES) {
    if (base.includes(segment)) return id;
  }
  return null;
}

/** Header "CREATE" / Quick create menu — only when the user names it. */
export function userAllowsHeaderQuickCreate(goal: string): boolean {
  return HEADER_QUICK_CREATE_RE.test(goal.trim());
}

export function inferGoalIntent(goal: string): GoalIntent {
  const g = goal.trim();

  if (FORM_RE.test(g)) {
    return {
      kind: "explain_form",
      finishLine:
        "Done when the relevant form/dialog is open. Then give a SHORT brief of the main fields and stop. Do not walk every input.",
      doneLog: "Form is open — that's the finish line for this ask",
    };
  }

  if (SAVE_RE.test(g)) {
    return {
      kind: "complete_save",
      finishLine:
        "Done when the Save / Create button is visible and you've pointed at it once.",
      doneLog: "Save is in reach — you can wrap this up",
    };
  }

  if (CREATE_RE.test(g) && !FORM_RE.test(g)) {
    return {
      kind: "open_create",
      finishLine:
        "Done as soon as the create UI is open (New item / New Product modal, or equivalent New/Add dialog). Do NOT guide filling the form.",
      doneLog: "Create form is open — you're set",
    };
  }

  if (OPEN_PAGE_RE.test(g) && !CREATE_RE.test(g)) {
    return {
      kind: "open_page",
      finishLine:
        "Done when the user is on the list/page they asked for. Do not open create unless they asked to add.",
      doneLog: "You're on the right page",
    };
  }

  if (CREATE_RE.test(g)) {
    return {
      kind: "open_create",
      finishLine:
        "Done as soon as the create UI is open. Do not fill the form unless they asked about fields.",
      doneLog: "Create form is open — you're set",
    };
  }

  return {
    kind: "generic",
    finishLine:
      "Done when the user can complete the asked action without more pointing (destination visible). Prefer stopping early over over-guiding.",
    doneLog: "That's as far as this ask needs",
  };
}

export function isCreateDialogOpen(snapshot?: ScreenSnapshot | null): boolean {
  if (typeof document !== "undefined") {
    const dialog = document.querySelector<HTMLElement>(
      "[role='dialog'], [data-slot='dialog-content']",
    );
    if (dialog && dialog.getClientRects().length > 0) return true;
  }
  return Boolean(snapshot?.elements.some((el) => el.region === "dialog"));
}

export function isGoalComplete(
  intent: GoalIntent,
  snapshot: ScreenSnapshot,
  lastEvent: string,
  goal?: string,
): boolean {
  const dialog = isCreateDialogOpen(snapshot);
  const clickedCreate =
    /new item|new product|add your first|clicked the pointed/i.test(lastEvent);

  if (intent.kind === "open_create") {
    return dialog;
  }

  if (intent.kind === "explain_form") {
    return false;
  }

  if (intent.kind === "open_page") {
    if (goal) {
      const href = inferTargetHrefFromGoal(goal);
      if (href && isOnTargetHref(snapshot.path, href)) return true;
    }
    return /navigated to/i.test(lastEvent) && !clickedCreate;
  }

  return false;
}
