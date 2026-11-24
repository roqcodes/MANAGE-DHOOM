"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  AI_CHAT_RAIL_WIDTH_PX,
  aiChatRailWidthPx,
  setAiChatRailWidthPx,
} from "../lib/ai-chat-rail-layout";

export const AI_CHAT_RAIL_MIN_PX = 280;
export const AI_CHAT_RAIL_MAX_PX = 720;
const AI_CHAT_RAIL_STORAGE_KEY = "dhoom-ai-rail-width";

export function clampAiChatRailWidth(
  px: number,
  viewportW = typeof window !== "undefined" ? window.innerWidth : 1200,
): number {
  const max = Math.min(AI_CHAT_RAIL_MAX_PX, Math.floor(viewportW * 0.55));
  return Math.min(max, Math.max(AI_CHAT_RAIL_MIN_PX, Math.round(px)));
}

export function readStoredAiChatRailWidth(): number {
  if (typeof window === "undefined") return AI_CHAT_RAIL_WIDTH_PX;
  try {
    const raw = localStorage.getItem(AI_CHAT_RAIL_STORAGE_KEY);
    const n = raw ? Number.parseFloat(raw) : NaN;
    return Number.isFinite(n)
      ? clampAiChatRailWidth(n)
      : AI_CHAT_RAIL_WIDTH_PX;
  } catch {
    return AI_CHAT_RAIL_WIDTH_PX;
  }
}

function writeStoredAiChatRailWidth(px: number) {
  try {
    localStorage.setItem(AI_CHAT_RAIL_STORAGE_KEY, String(px));
  } catch {
    /* ignore */
  }
}

export function useAiChatRailResize(splitRail: boolean, isOpen: boolean) {
  const [widthPx, setWidthPx] = useState(AI_CHAT_RAIL_WIDTH_PX);
  const [isResizing, setIsResizing] = useState(false);
  const widthRef = useRef(widthPx);
  widthRef.current = widthPx;

  useEffect(() => {
    if (splitRail) setWidthPx(readStoredAiChatRailWidth());
  }, [splitRail]);

  useEffect(() => {
    if (!isOpen) {
      setAiChatRailWidthPx(0);
      return;
    }
    if (splitRail) {
      setAiChatRailWidthPx(widthPx);
    } else {
      setAiChatRailWidthPx(0);
    }
    return () => setAiChatRailWidthPx(0);
  }, [isOpen, splitRail, widthPx]);

  const applyPresetWidth = useCallback((expanded: boolean) => {
    const w = clampAiChatRailWidth(aiChatRailWidthPx(expanded));
    setWidthPx(w);
    writeStoredAiChatRailWidth(w);
    if (isOpen && splitRail) setAiChatRailWidthPx(w);
  }, [isOpen, splitRail]);

  const onResizeHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!splitRail) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      setIsResizing(true);
      document.documentElement.setAttribute("data-ai-chat-resizing", "true");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const startX = e.clientX;
      const startW = widthRef.current;

      const onMove = (ev: PointerEvent) => {
        const next = clampAiChatRailWidth(startW + (startX - ev.clientX));
        setWidthPx(next);
        setAiChatRailWidthPx(next);
      };

      const finish = () => {
        el.releasePointerCapture(e.pointerId);
        setIsResizing(false);
        document.documentElement.removeAttribute("data-ai-chat-resizing");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        writeStoredAiChatRailWidth(widthRef.current);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    },
    [splitRail],
  );

  return {
    widthPx,
    isResizing,
    onResizeHandlePointerDown,
    applyPresetWidth,
  };
}