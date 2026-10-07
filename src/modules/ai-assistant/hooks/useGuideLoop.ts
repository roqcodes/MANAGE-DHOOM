"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { useAiAssistant } from "../context/AiAssistantContext";
import {
  inferGoalIntent,
  isGoalComplete,
  userAllowsHeaderQuickCreate,
} from "../lib/goal-intent";
import { evaluateUiGuideGuard } from "../lib/live-ui-state";
import { parsePointDirective } from "../lib/parse-point";
import { logAiProcessing } from "../lib/ai-processor-log";
import { completeGuideStepViaApi } from "../lib/guide-step-api";
import {
  isElementExposedInNavChrome,
  isNavSectionButton,
  isSidebarChromeElement,
  pickGuideNavTarget,
  tagElementForGuide,
} from "../lib/sidebar-nav-visibility";
import {
  AI_ID_ATTR,
  captureScreenSnapshot,
  elementMatchesGuideLabel,
  hrefFromElement,
  locatePointedElement,
  resolveGuidedElement,
  isAdminPageUiLoading,
  waitForSettledUi,
} from "../lib/screen-snapshot";

function guideErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || /timed out|too long/i.test(error.message)) {
      return "The guide step took too long. Try again in a moment.";
    }
    return error.message;
  }
  return "The live guide hit a snag. You can ask me to try again.";
}

function describeClick(event: MouseEvent, expectedId: string | null): string {
  const target = event.target;
  if (!(target instanceof Element)) {
    return `clicked somewhere else (expected ${expectedId ?? "nothing"})`;
  }
  const tagged = target.closest(`[${AI_ID_ATTR}]`);
  const id = tagged?.getAttribute(AI_ID_ATTR);
  const label =
    tagged instanceof HTMLElement
      ? tagged.innerText.replace(/\s+/g, " ").trim().slice(0, 60)
      : "";
  if (id && id === expectedId) {
    return `clicked the pointed control ${id} (${label})`;
  }
  if (id) {
    return `clicked a different control ${id} (${label}); expected ${expectedId}`;
  }
  return `clicked outside tagged controls; expected ${expectedId}`;
}

export function useGuideLoop() {
  const pathname = usePathname();
  const {
    guideActive,
    guideGoal,
    guidePoint,
    chatHistory,
    setGuidePoint,
    setGuideThinking,
    stopGuide,
    addMessage,
    setIsOpen,
    finishGuide,
    pushGuideLog,
    guideScanToken,
    guideFinished,
  } = useAiAssistant();

  const busyRef = useRef(false);
  const pointRef = useRef(guidePoint);
  const activeRef = useRef(guideActive);
  const goalRef = useRef(guideGoal);
  const pathRef = useRef(
    typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : pathname,
  );
  const finishedRef = useRef(guideFinished);

  pointRef.current = guidePoint;
  activeRef.current = guideActive;
  goalRef.current = guideGoal;
  finishedRef.current = guideFinished;

  const continueGuide = useCallback(
    async (lastEvent: string, pathWhenClicked?: string) => {
      if (!activeRef.current || busyRef.current || finishedRef.current) return;
      const goal = goalRef.current;
      if (!goal) return;

      busyRef.current = true;
      setGuideThinking(true);
      pushGuideLog(
        isAdminPageUiLoading()
          ? "Waiting for the page to finish loading…"
          : "Reading this page…",
        "look",
      );

      try {
        await waitForSettledUi(pathWhenClicked);
        const screen = captureScreenSnapshot({
          includeHeaderQuickCreate: userAllowsHeaderQuickCreate(goal),
        });
        const intent = inferGoalIntent(goal);

        if (isGoalComplete(intent, screen, lastEvent, goal)) {
          logAiProcessing({
            processor: "heuristic",
            context: "guide-goal-complete",
          });
          finishGuide(intent.doneLog);
          return;
        }

        const uiState = screen.uiState;
        if (uiState) {
          const guard = evaluateUiGuideGuard(goal, intent, screen, uiState);
          if (guard.action === "finish") {
            logAiProcessing({
              processor: "heuristic",
              context: "guide-goal-complete",
            });
            finishGuide(guard.summary);
            return;
          }
          if (guard.action === "block") {
            logAiProcessing({
              processor: "heuristic",
              context: "guide-ui-block",
            });
            if (guard.dismiss) {
              const el = document.querySelector<HTMLElement>(
                `[data-bh-ai-id="${guard.dismiss.id}"]`,
              );
              if (el) {
                el.scrollIntoView({
                  behavior: "auto",
                  block: "nearest",
                  inline: "nearest",
                });
              }
              setGuidePoint({
                id: guard.dismiss.id,
                say: guard.spoken,
                label: guard.dismiss.label,
              });
              pushGuideLog(
                `Close the open form first — tap “${guard.dismiss.label.trim()}”`,
                "point",
              );
              return;
            }
            pushGuideLog(guard.spoken, "info");
            addMessage("assistant", `${guard.spoken} [POINT:none]`);
            stopGuide();
            setIsOpen(true);
            return;
          }
        }

        const lastEventRich = `${lastEvent}. Now at ${screen.path}. ${screen.elements.length} controls visible.`;
        const reply = await completeGuideStepViaApi(
          goal,
          lastEventRich,
          screen,
          chatHistory,
        );
        const point = parsePointDirective(reply);

        if (point.done || !point.id) {
          if (point.spoken) addMessage("assistant", reply);
          finishGuide(point.spoken || "You're done");
          return;
        }

        const snapWanted = screen.elements.find((e) => e.id === point.id);

        let located = locatePointedElement(point.id, screen);

        if (!located && point.label) {
          const el = resolveGuidedElement({
            label: point.label,
            href: snapWanted?.href,
          });
          const id = el?.getAttribute(AI_ID_ATTR);
          if (el && id) located = { el, id };
        }

        if (
          located &&
          point.label &&
          !elementMatchesGuideLabel(located.el, point.label)
        ) {
          const fixed = resolveGuidedElement({
            label: point.label,
            href: snapWanted?.href,
          });
          if (fixed) {
            const id =
              fixed.getAttribute(AI_ID_ATTR) ?? tagElementForGuide(fixed);
            located = { el: fixed, id };
          }
        }

        if (located && !isElementExposedInNavChrome(located.el)) {
          located = null;
        }

        const navPick = pickGuideNavTarget(goal, screen.path, intent.kind);

        if (navPick?.kind === "done") {
          finishGuide(
            intent.kind === "open_page"
              ? "You're already on this page"
              : "You're on the right page",
          );
          return;
        }

        if (navPick?.kind === "section" && navPick.el) {
          located = {
            el: navPick.el,
            id: tagElementForGuide(navPick.el),
          };
        } else if (navPick?.kind === "page-link" && navPick.el) {
          located = {
            el: navPick.el,
            id: tagElementForGuide(navPick.el),
          };
        } else if (navPick?.kind === "create" && navPick.el) {
          located = {
            el: navPick.el,
            id: tagElementForGuide(navPick.el),
          };
        } else if (
          located &&
          isSidebarChromeElement(located.el) &&
          navPick?.el
        ) {
          located = {
            el: navPick.el,
            id: tagElementForGuide(navPick.el),
          };
        } else if (!located && navPick?.el) {
          located = {
            el: navPick.el,
            id: tagElementForGuide(navPick.el),
          };
        }

        if (!located) {
          addMessage(
            "assistant",
            "I lost the control on screen. Ask me again if you want me to keep pointing.",
          );
          stopGuide();
          setIsOpen(true);
          return;
        }

        located.el.scrollIntoView({
          behavior: "auto",
          block: "nearest",
          inline: "nearest",
        });
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => resolve());
          });
        });
        const label = (
          located.el.getAttribute("data-bh-nav-section") ||
          located.el.getAttribute("aria-label") ||
          located.el.innerText ||
          point.label ||
          "this control"
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 40);
        const href = hrefFromElement(located.el) ?? undefined;
        const say = isNavSectionButton(located.el)
          ? `Open ${label} in the sidebar`
          : `Tap “${label}”`;
        setGuidePoint({
          id: located.id,
          say,
          label,
          href,
        });
        pushGuideLog(say, "point");
      } catch (error) {
        pushGuideLog("Could not get the next step", "stop");
        addMessage("assistant", guideErrorMessage(error));
        stopGuide();
        setIsOpen(true);
      } finally {
        busyRef.current = false;
        setGuideThinking(false);
      }
    },
    [addMessage, chatHistory, finishGuide, pushGuideLog, setGuidePoint, setGuideThinking, setIsOpen, stopGuide],
  );

  useEffect(() => {
    if (!guideActive) return;

    const onClick = (event: MouseEvent) => {
      if (!activeRef.current || busyRef.current || finishedRef.current) return;
      if (!pointRef.current?.id) return;
      const assistant = (event.target as Element | null)?.closest?.(
        ".ai-assistant-root",
      );
      if (assistant) return;

      if (busyRef.current) return;

      const pathWhenClicked =
        window.location.pathname + window.location.search;
      const lastEvent = describeClick(event, pointRef.current.id);
      void continueGuide(lastEvent, pathWhenClicked);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [continueGuide, guideActive]);

  useEffect(() => {
    if (!guideActive || guideFinished) {
      pathRef.current =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : pathname;
      return;
    }
    const fullPath =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : pathname;
    if (fullPath === pathRef.current) return;
    const previousPath = pathRef.current;
    pathRef.current = fullPath;
    if (busyRef.current) return;
    void continueGuide(`navigated to ${fullPath}`, previousPath);
  }, [continueGuide, guideActive, guideFinished, pathname]);

  useEffect(() => {
    if (!guideActive || guideFinished || !guideScanToken) return;
    void continueGuide(
      "guide started; read the live screen and point at the first control",
    );
  }, [continueGuide, guideActive, guideFinished, guideScanToken]);

  useEffect(() => {
    if (!guideActive) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") stopGuide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [guideActive, stopGuide]);
}
