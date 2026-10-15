"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { Check } from "lucide-react";

import { AcrylicPointer, POINTER_SIZE } from "./AcrylicPointer";
import { useAiAssistant } from "../context/AiAssistantContext";
import { getGuideAimRect, pointerAimForRect } from "../lib/pointer-aim";
import { resolveGuidedElement } from "../lib/screen-snapshot";
import { AiOrb } from "./AiOrb";

const ORB = 60;
/** Cursor within this distance (px) nudges the docked orb toward the pointer. */
const PROXIMITY_RADIUS = 150;
const PROXIMITY_MAX_OFFSET = 12;
const RIGHT_SAFE = 88;
const VIEW_MARGIN = 14;
const ORB_CROSSFADE = {
  duration: 0.48,
  ease: [0.22, 1, 0.36, 1] as const,
};

const POINTER_SPRING = { stiffness: 420, damping: 38, mass: 0.42 };

type PointerFace = "left" | "right";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function isRightmostTarget(rect: DOMRect) {
  const maxRight = window.innerWidth - RIGHT_SAFE;
  return (
    rect.right >= maxRight - 4 ||
    window.innerWidth - rect.right < POINTER_SIZE + 30
  );
}

function pointerBesideRect(rect: DOMRect) {
  const fromLeft = isRightmostTarget(rect);
  const face: PointerFace = fromLeft ? "right" : "left";
  const aimed = pointerAimForRect(rect, face);

  const x = clamp(
    aimed.x,
    VIEW_MARGIN,
    window.innerWidth - RIGHT_SAFE - POINTER_SIZE,
  );
  const y = clamp(
    aimed.y,
    VIEW_MARGIN,
    window.innerHeight - POINTER_SIZE - VIEW_MARGIN,
  );

  return { x, y, face };
}

export const SmartOrb = () => {
  const {
    isOpen,
    setIsOpen,
    guideActive,
    guidePoint,
    guideThinking,
    guideFinished,
    assistantState,
  } = useAiAssistant();
  const reduceMotion = useReducedMotion();

  const [pointerFace, setPointerFace] = useState<PointerFace>("left");
  const [pointerPlaced, setPointerPlaced] = useState(false);
  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 });
  const [targetBox, setTargetBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    borderRadius: string;
  } | null>(null);
  const [successRing, setSuccessRing] = useState<{
    id: number;
    left: number;
    top: number;
    width: number;
    height: number;
    borderRadius: string;
  } | null>(null);
  const trackedElRef = useRef<HTMLElement | null>(null);
  const guidePointRef = useRef(guidePoint);
  guidePointRef.current = guidePoint;

  const ambientDockedOrb =
    !isOpen &&
    !guideActive &&
    !guideFinished &&
    assistantState === "idle";

  const mode: "idle" | "thinking" | "pointing" | "finished" = guideFinished
    ? "finished"
    : guideThinking
      ? "thinking"
      : guideActive && guidePoint
        ? "pointing"
        : guideActive
          ? "thinking"
          : "idle";

  const guideTrackKey = guidePoint
    ? `${guidePoint.id ?? ""}\0${guidePoint.label ?? ""}\0${guidePoint.href ?? ""}`
    : "";

  const resolveTrackTarget = useCallback((point: NonNullable<typeof guidePoint>) => {
    return resolveGuidedElement({
      id: point.id,
      label: point.label,
      href: point.href,
    });
  }, []);

  const syncPointerFromElement = useCallback((el: HTMLElement) => {
    const rawRect = el.getBoundingClientRect();
    const aimRect = getGuideAimRect(el);
    const next = pointerBesideRect(aimRect);

    // Compute the computed border-radius of target so the subtle ring matches perfectly
    let computedRadius = "10px";
    try {
      const style = window.getComputedStyle(el);
      if (style.borderRadius && style.borderRadius !== "0px") {
        computedRadius = style.borderRadius;
      }
    } catch {
      // fallback
    }

    setPointerPos({ x: next.x, y: next.y });
    setPointerFace(next.face);
    setTargetBox({
      left: rawRect.left,
      top: rawRect.top,
      width: rawRect.width,
      height: rawRect.height,
      borderRadius: computedRadius,
    });
    setPointerPlaced(true);
  }, []);

  useLayoutEffect(() => {
    if (!guideActive || guideFinished || !guidePoint) {
      trackedElRef.current = null;
      setPointerPlaced(false);
      setTargetBox(null);
      return;
    }

    trackedElRef.current = null;
    setPointerPlaced(false);
    setTargetBox(null);

    let raf = 0;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;
    let onLayout: (() => void) | null = null;

    const refresh = () => {
      const point = guidePointRef.current;
      if (!point || cancelled) return;

      let el = trackedElRef.current;
      if (!el?.isConnected) {
        el = resolveTrackTarget(point);
        trackedElRef.current = el;
      }
      if (!el) return;
      syncPointerFromElement(el);
    };

    const bindObservers = (el: HTMLElement) => {
      trackedElRef.current = el;
      refresh();

      onLayout = () => refresh();
      resizeObserver = new ResizeObserver(onLayout);
      resizeObserver.observe(el);
      if (el.parentElement) {
        resizeObserver.observe(el.parentElement);
      }

      const sidebar = document.querySelector('[data-bh-admin-sidebar="true"]');
      if (sidebar) {
        mutationObserver = new MutationObserver(onLayout);
        mutationObserver.observe(sidebar, {
          attributes: true,
          childList: true,
          subtree: true,
        });
      }

      window.addEventListener("scroll", onLayout, true);
      window.addEventListener("resize", onLayout);
    };

    const point = guidePointRef.current;
    const initial = point ? resolveTrackTarget(point) : null;
    if (initial) {
      bindObservers(initial);
    } else {
      const deadline = Date.now() + 3200;
      const retry = () => {
        if (cancelled) return;
        const p = guidePointRef.current;
        const el = p ? resolveTrackTarget(p) : null;
        if (el) {
          bindObservers(el);
          return;
        }
        if (Date.now() < deadline) {
          raf = window.requestAnimationFrame(retry);
        }
      };
      raf = window.requestAnimationFrame(retry);
    }

    return () => {
      cancelled = true;
      if (raf) window.cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      if (onLayout) {
        window.removeEventListener("scroll", onLayout, true);
        window.removeEventListener("resize", onLayout);
      }
    };
  }, [guideActive, guideFinished, guideTrackKey, resolveTrackTarget, syncPointerFromElement]);

  const isCursor = mode === "pointing" || mode === "thinking";
  const dockedOrbVisible = !isOpen;

  // Listen for clicks on the targeted element to flash an emerald green success ring
  useEffect(() => {
    if (!guideActive || !trackedElRef.current || !targetBox) return;

    const targetEl = trackedElRef.current;
    const handleTargetClick = () => {
      const rect = targetEl.getBoundingClientRect();
      let computedRadius = targetBox.borderRadius;
      try {
        const style = window.getComputedStyle(targetEl);
        if (style.borderRadius && style.borderRadius !== "0px") {
          computedRadius = style.borderRadius;
        }
      } catch {
        // fallback
      }

      setSuccessRing({
        id: Date.now(),
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        borderRadius: computedRadius,
      });
    };

    targetEl.addEventListener("click", handleTargetClick, true);
    return () => {
      targetEl.removeEventListener("click", handleTargetClick, true);
    };
  }, [guideActive, targetBox]);

  const dockedAnchorRef = useRef<HTMLDivElement>(null);

  const proxTargetX = useMotionValue(0);
  const proxTargetY = useMotionValue(0);
  const proxX = useSpring(proxTargetX, { stiffness: 140, damping: 22, mass: 0.35 });
  const proxY = useSpring(proxTargetY, { stiffness: 140, damping: 22, mass: 0.35 });

  const handleProximityMove = useCallback(
    (event: PointerEvent) => {
      const anchor = dockedAnchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = event.clientX - cx;
      const dy = event.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > PROXIMITY_RADIUS || dist < 0.5) {
        proxTargetX.set(0);
        proxTargetY.set(0);
        return;
      }
      const t = 1 - dist / PROXIMITY_RADIUS;
      let strength = t * t * PROXIMITY_MAX_OFFSET;
      if (dist < ORB * 0.55) {
        strength *= dist / (ORB * 0.55);
      }
      const nx = dx / dist;
      const ny = dy / dist;
      proxTargetX.set(nx * strength);
      proxTargetY.set(ny * strength);
    },
    [proxTargetX, proxTargetY],
  );

  useEffect(() => {
    if (!dockedOrbVisible || reduceMotion) {
      proxTargetX.set(0);
      proxTargetY.set(0);
      return;
    }

    window.addEventListener("pointermove", handleProximityMove, {
      passive: true,
    });
    return () =>
      window.removeEventListener("pointermove", handleProximityMove);
  }, [
    dockedOrbVisible,
    reduceMotion,
    handleProximityMove,
    proxTargetX,
    proxTargetY,
  ]);

  const showGuidePointer = isCursor && pointerPlaced;
  // Stop the subtle cyan/blue pulse while the guide is processing (thinking state)
  const showTargetGlow =
    mode === "pointing" && pointerPlaced && targetBox !== null;

  const pointerMoveTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, ...POINTER_SPRING };

  return (
    <>
      {/* Green expansion ring flash on successful target click (slow, organic water ripple wave) */}
      <AnimatePresence>
        {successRing ? (
          <div
            key={`success-ripple-group-${successRing.id}`}
            className="pointer-events-none fixed z-[195]"
            style={{
              left: successRing.left - 4,
              top: successRing.top - 4,
              width: successRing.width + 8,
              height: successRing.height + 8,
            }}
          >
            {/* Primary soft water ripple crest */}
            <motion.div
              initial={{
                opacity: 0.95,
                scale: 0.98,
                boxShadow:
                  "0 0 0 1.5px rgba(16, 185, 129, 0.9), 0 0 20px 2px rgba(16, 185, 129, 0.5), inset 0 0 8px 1px rgba(52, 211, 153, 0.35)",
              }}
              animate={{
                opacity: 0,
                scale: 1.16,
                boxShadow:
                  "0 0 0 2.5px rgba(52, 211, 153, 0), 0 0 45px 12px rgba(16, 185, 129, 0), inset 0 0 18px 4px rgba(52, 211, 153, 0)",
              }}
              transition={{
                duration: 1.45,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="absolute inset-0"
              style={{
                borderRadius: `calc(${successRing.borderRadius} + 4px)`,
              }}
            />

            {/* Secondary delayed harmonic outer ripple wave */}
            <motion.div
              initial={{
                opacity: 0,
                scale: 0.99,
                boxShadow:
                  "0 0 0 1px rgba(52, 211, 153, 0.65), 0 0 12px 1px rgba(16, 185, 129, 0.3)",
              }}
              animate={{
                opacity: [0, 0.7, 0],
                scale: 1.25,
                boxShadow:
                  "0 0 0 1.5px rgba(110, 231, 183, 0), 0 0 35px 8px rgba(16, 185, 129, 0)",
              }}
              transition={{
                delay: 0.12,
                duration: 1.6,
                ease: [0.18, 0.9, 0.32, 1],
              }}
              onAnimationComplete={() => setSuccessRing(null)}
              className="absolute inset-0"
              style={{
                borderRadius: `calc(${successRing.borderRadius} + 4px)`,
              }}
            />
          </div>
        ) : null}
      </AnimatePresence>

      {/* Minimal subtle animated glow indicator around targeted element */}
      <AnimatePresence>
        {showTargetGlow ? (
          <motion.div
            key="guide-target-glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="pointer-events-none fixed z-[190]"
            style={{
              left: targetBox.left - 3,
              top: targetBox.top - 3,
              width: targetBox.width + 6,
              height: targetBox.height + 6,
              borderRadius: `calc(${targetBox.borderRadius} + 3px)`,
            }}
          >
            <motion.div
              animate={
                reduceMotion
                  ? { opacity: 0.6 }
                  : {
                      boxShadow: [
                        "0 0 0 1px rgba(56, 189, 248, 0.35), 0 0 8px -1px rgba(56, 189, 248, 0.2)",
                        "0 0 0 1px rgba(99, 102, 241, 0.55), 0 0 14px 1px rgba(99, 102, 241, 0.35)",
                        "0 0 0 1px rgba(56, 189, 248, 0.35), 0 0 8px -1px rgba(56, 189, 248, 0.2)",
                      ],
                    }
              }
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { repeat: Infinity, duration: 2.2, ease: "easeInOut" }
              }
              className="size-full bg-transparent"
              style={{
                borderRadius: `calc(${targetBox.borderRadius} + 3px)`,
              }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showGuidePointer ? (
          <motion.div
            key="guide-pointer"
            className="pointer-events-none fixed left-0 top-0 z-[200]"
            style={{ width: POINTER_SIZE, height: POINTER_SIZE }}
            initial={false}
            animate={{
              x: pointerPos.x,
              y: pointerPos.y,
              opacity: 1,
              scale: 1,
            }}
            exit={{ opacity: 0, scale: 0.82 }}
            transition={{
              x: pointerMoveTransition,
              y: pointerMoveTransition,
              opacity: ORB_CROSSFADE,
              scale: ORB_CROSSFADE,
            }}
          >
            <AcrylicPointer
              face={pointerFace}
              thinking={mode === "thinking"}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!isOpen ? (
        <div
          ref={dockedAnchorRef}
          className="pointer-events-none fixed bottom-6 right-6 z-[200]"
        >
          <motion.div
            className="pointer-events-none"
            style={{
              x: dockedOrbVisible && !reduceMotion ? proxX : 0,
              y: dockedOrbVisible && !reduceMotion ? proxY : 0,
            }}
          >
            <motion.button
              type="button"
              aria-label={
                mode === "finished"
                  ? "Guide finished"
                  : "Open assistant"
              }
              onClick={() => {
                if (mode === "idle") setIsOpen(true);
              }}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.94 }}
              className="pointer-events-auto ai-orb-trigger group relative flex items-center justify-center rounded-full"
              style={{ width: ORB, height: ORB }}
            >
              <AnimatePresence mode="wait" initial={false}>
                {mode === "finished" ? (
                  <motion.div
                    key="orb-finished"
                    className="relative flex size-full items-center justify-center"
                    initial={{ opacity: 0, scale: 0.88 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9, filter: "blur(6px)" }}
                    transition={ORB_CROSSFADE}
                  >
                    <AiOrb size={ORB} state="finished" animated />
                    <motion.div
                      initial={{ scale: 0, rotate: -45, opacity: 0 }}
                      animate={{ scale: 1, rotate: 0, opacity: 1 }}
                      exit={{ scale: 0.6, opacity: 0, rotate: 20 }}
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 20,
                        delay: 0.1,
                      }}
                      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
                    >
                      <div className="flex size-7 items-center justify-center rounded-full border border-white/60 bg-emerald-500/90 text-white shadow-[0_0_15px_rgba(16,185,129,0.9),inset_0_1px_3px_rgba(255,255,255,0.7)] backdrop-blur-md">
                        <Check size={16} strokeWidth={3} />
                      </div>
                    </motion.div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="orb-normal"
                    className="flex size-full items-center justify-center"
                    initial={{ opacity: 0, scale: 0.88 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={ORB_CROSSFADE}
                  >
                    <AiOrb
                      size={ORB}
                      state={assistantState}
                      animated
                      animationPace={ambientDockedOrb ? "ambient" : "default"}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {mode === "idle" && (
                <div className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:-translate-x-1">
                  <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground shadow-xl backdrop-blur-xl dark:bg-slate-900/90">
                    <span className="size-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span>
                      {assistantState === "querying"
                        ? "Crunching numbers"
                        : assistantState === "insight"
                          ? "Got it"
                          : "DHOOM AI"}
                    </span>
                  </div>
                </div>
              )}
            </motion.button>
          </motion.div>
        </div>
      ) : null}
    </>
  );
};
