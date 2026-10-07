"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type GuideLogKind = "info" | "look" | "point" | "ok" | "stop";

export type GuideLog = {
  id: string;
  text: string;
  kind: GuideLogKind;
};

export type GuidePoint = {
  id: string;
  say: string;
  label: string;
  /** Stable route when the target is a nav link (avoids stale `e*` ids). */
  href?: string;
};

export type AssistantState =
  | "idle"
  | "user-typing"
  | "thinking"
  | "assistant-typing"
  | "guiding-pointing"
  | "guiding-scanning"
  | "finished";

interface AiAssistantState {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  chatHistory: ChatTurn[];
  addMessage: (role: "user" | "assistant", content: string) => void;
  clearChatHistory: () => void;
  guideActive: boolean;
  guideGoal: string;
  guidePoint: GuidePoint | null;
  guideThinking: boolean;
  startGuide: (goal: string, firstPoint?: GuidePoint | null) => void;
  setGuidePoint: (point: GuidePoint | null) => void;
  setGuideThinking: (thinking: boolean) => void;
  stopGuide: () => void;
  guideScanToken: number;
  guideLogs: GuideLog[];
  pushGuideLog: (text: string, kind?: GuideLogKind) => void;
  finishGuide: (summary?: string) => void;
  guideFinished: boolean;
  // Dynamic 2026 Interaction States
  isUserTyping: boolean;
  setIsUserTyping: (typing: boolean) => void;
  isAiResponding: boolean;
  setIsAiResponding: (responding: boolean) => void;
  assistantState: AssistantState;
}

const AiAssistantContext = createContext<AiAssistantState | undefined>(
  undefined,
);

export const AiAssistantProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [guideActive, setGuideActive] = useState(false);
  const [guideGoal, setGuideGoal] = useState("");
  const [guidePoint, setGuidePointState] = useState<GuidePoint | null>(null);
  const [guideThinking, setGuideThinking] = useState(false);
  const [guideScanToken, setGuideScanToken] = useState(0);
  const [guideLogs, setGuideLogs] = useState<GuideLog[]>([]);
  const [guideFinished, setGuideFinished] = useState(false);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [isAiResponding, setIsAiResponding] = useState(false);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const assistantState: AssistantState = useMemo(() => {
    if (guideFinished) return "finished";
    if (guideActive) {
      if (guideThinking) return "guiding-scanning";
      if (guidePoint) return "guiding-pointing";
      return "guiding-scanning";
    }
    if (isAiResponding) return "assistant-typing";
    if (guideThinking) return "thinking";
    if (isUserTyping) return "user-typing";
    return "idle";
  }, [
    guideFinished,
    guideActive,
    guideThinking,
    guidePoint,
    isAiResponding,
    isUserTyping,
  ]);

  const pushGuideLog = useCallback((text: string, kind: GuideLogKind = "info") => {
    const line: GuideLog = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text,
      kind,
    };
    setGuideLogs((prev) => [...prev.slice(-5), line]);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("buyhub_ai_chat");
    if (saved) {
      try {
        setChatHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("buyhub_ai_chat", JSON.stringify(chatHistory));
  }, [chatHistory, hydrated]);

  const addMessage = useCallback((role: "user" | "assistant", content: string) => {
    setChatHistory((prev) => [...prev, { role, content }]);
  }, []);

  const clearChatHistory = useCallback(() => {
    setChatHistory([]);
    localStorage.removeItem("buyhub_ai_chat");
  }, []);

  const startGuide = useCallback(
    (goal: string, firstPoint?: GuidePoint | null) => {
      if (finishTimer.current) {
        clearTimeout(finishTimer.current);
        finishTimer.current = null;
      }
      setGuideGoal(goal);
      setGuideActive(true);
      setGuideFinished(false);
      setGuideThinking(false);
      setGuidePointState(firstPoint ?? null);
      setGuideLogs([
        {
          id: "start",
          text: `Helping with: ${goal}`,
          kind: "info",
        },
      ]);
      setIsOpen(false);
      if (!firstPoint) {
        setGuideScanToken((n) => n + 1);
      } else {
        setGuideLogs((prev) => [
          ...prev,
          {
            id: "first-point",
            text: firstPoint.label
              ? `Tap “${firstPoint.label}”`
              : firstPoint.say || "Tap the highlighted control",
            kind: "point",
          },
        ]);
      }
    },
    [],
  );

  const setGuidePoint = useCallback((point: GuidePoint | null) => {
    setGuidePointState(point);
  }, []);

  const stopGuide = useCallback(() => {
    if (finishTimer.current) {
      clearTimeout(finishTimer.current);
      finishTimer.current = null;
    }
    setGuideActive(false);
    setGuideFinished(false);
    setGuideGoal("");
    setGuidePointState(null);
    setGuideThinking(false);
    setGuideLogs([]);
  }, []);

  const finishGuide = useCallback(
    (summary?: string) => {
      setGuideThinking(false);
      setGuidePointState(null);
      setGuideFinished(true);
      setGuideLogs([]);
      if (finishTimer.current) clearTimeout(finishTimer.current);
      finishTimer.current = setTimeout(() => {
        setGuideActive(false);
        setGuideFinished(false);
        setGuideGoal("");
        setGuideLogs([]);
        finishTimer.current = null;
      }, 3400);
    },
    [],
  );

  const value = useMemo(
    () => ({
      isOpen,
      setIsOpen,
      chatHistory,
      addMessage,
      clearChatHistory,
      guideActive,
      guideGoal,
      guidePoint,
      guideThinking,
      startGuide,
      setGuidePoint,
      setGuideThinking,
      stopGuide,
      guideScanToken,
      guideLogs,
      pushGuideLog,
      finishGuide,
      guideFinished,
      isUserTyping,
      setIsUserTyping,
      isAiResponding,
      setIsAiResponding,
      assistantState,
    }),
    [
      isOpen,
      chatHistory,
      addMessage,
      clearChatHistory,
      guideActive,
      guideGoal,
      guidePoint,
      guideThinking,
      startGuide,
      setGuidePoint,
      stopGuide,
      guideScanToken,
      guideLogs,
      pushGuideLog,
      finishGuide,
      guideFinished,
      isUserTyping,
      isAiResponding,
      assistantState,
    ],
  );

  return (
    <AiAssistantContext.Provider value={value}>
      {children}
    </AiAssistantContext.Provider>
  );
};

export const useAiAssistant = () => {
  const context = useContext(AiAssistantContext);
  if (context === undefined) {
    throw new Error("useAiAssistant must be used within an AiAssistantProvider");
  }
  return context;
};
