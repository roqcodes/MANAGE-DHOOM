"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  ArrowUp,
  Check,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  Play,
  Trash2,
  X,
  Zap,
} from "lucide-react";

import { useAiAssistant } from "../context/AiAssistantContext";
import { useOpenRouter } from "../hooks/useOpenRouter";
import { FormattedSpoken } from "../lib/format-spoken";
import { parsePointDirective, parseSuggestDirective } from "../lib/parse-point";
import {
  dropLabelsCoveredByRoutePills,
  parseAssistantMessage,
} from "../lib/parse-assistant-message";
import { presentIncludesEntityDeepLinks } from "../lib/parse-ui";
import { inferEntityOpenRequest } from "../lib/entity-open-request";
import {
  isDataQuestion,
  wantsEntityOpen,
  wantsOnScreenGuide,
} from "../lib/message-intent";
import { needsAppNavKnowledge } from "../lib/sitemap-context";
import { isAdminRecordDetailHref } from "../lib/parse-open";
import { extractAdminRoutes } from "../lib/spoken-routes";
import { AssistantActionButton, AssistantSuggestChip } from "./assistant-action-ui";
import { AssistantOpenRecordButton } from "./AssistantOpenRecordButton";
import { AiOrb } from "./AiOrb";
import { AssistantPresentStack } from "./present/AssistantPresentStack";
import { AssistantRoutePills } from "./AssistantRoutePills";
import { useAdminAlert } from "@/modules/admin/components/admin-alert-provider";

const CHAT_MESSAGE_INDEX_ATTR = "data-chat-message-index";
const MESSAGE_STAGGER_MS = 72;
const MESSAGE_ENTER_DURATION_S = 0.34;

function measureFirstVisibleMessageIndex(scroller: HTMLElement | null): number {
  if (!scroller) return 0;
  const { top, bottom } = scroller.getBoundingClientRect();
  const nodes = scroller.querySelectorAll(`[${CHAT_MESSAGE_INDEX_ATTR}]`);
  for (const node of nodes) {
    const el = node as HTMLElement;
    const idx = Number.parseInt(el.getAttribute(CHAT_MESSAGE_INDEX_ATTR) ?? "0", 10);
    const rect = el.getBoundingClientRect();
    if (rect.bottom > top + 2 && rect.top < bottom - 2) {
      return idx;
    }
  }
  return Math.max(0, nodes.length - 1);
}

const PROMPT_SUGGESTIONS = [
  { label: "Add product", query: "How do I add a new product with variants?" },
  {
    label: "Top salesman",
    query: "Who is the best performing salesman this month?",
  },
  { label: "Sales pipeline", query: "Where do I track pending sales orders and quotes?" },
  { label: "Bill edits", query: "Who edited a purchase bill recently?" },
];

export const ChatWindow = () => {
  const {
    isOpen,
    setIsOpen,
    chatHistory,
    startGuide,
    clearChatHistory,
    setIsUserTyping,
    isAiResponding,
    assistantState,
    guideActive,
  } = useAiAssistant();
  const { sendMessage, isLoading } = useOpenRouter();
  const { confirm } = useAdminAlert();
  const reduceMotion = useReducedMotion();
  const [input, setInput] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const prevHistoryLenRef = useRef(0);
  const openStaggerDoneRef = useRef(false);
  const staggerTimeoutsRef = useRef<number[]>([]);
  const [entranceAnchor, setEntranceAnchor] = useState(0);
  /** Highest message index revealed in the current tail stagger (-1 = none yet). */
  const [revealedThroughIndex, setRevealedThroughIndex] = useState(-1);

  const clearMessageStaggerTimeouts = () => {
    for (const id of staggerTimeoutsRef.current) {
      window.clearTimeout(id);
    }
    staggerTimeoutsRef.current = [];
  };

  const scheduleTailReveal = (fromIdx: number, toIdx: number) => {
    if (fromIdx > toIdx) return;
    clearMessageStaggerTimeouts();
    if (reduceMotion) {
      setRevealedThroughIndex(toIdx);
      return;
    }
    for (let i = fromIdx; i <= toIdx; i++) {
      const id = window.setTimeout(() => {
        setRevealedThroughIndex(i);
      }, (i - fromIdx) * MESSAGE_STAGGER_MS);
      staggerTimeoutsRef.current.push(id);
    }
  };

  const beginOpenMessageStagger = (anchor: number, lastIndex: number) => {
    clearMessageStaggerTimeouts();
    setEntranceAnchor(anchor);
    if (reduceMotion) {
      setRevealedThroughIndex(lastIndex);
      return;
    }
    // First in-view bubble on the same frame as the modal; rest stagger after.
    setRevealedThroughIndex(anchor <= lastIndex ? anchor : anchor - 1);
    if (anchor + 1 <= lastIndex) {
      scheduleTailReveal(anchor + 1, lastIndex);
    }
  };

  const pinMessagesToBottom = () => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [guideCtaOpenPulse, setGuideCtaOpenPulse] = useState(false);
  const chatWasOpenRef = useRef(false);

  const hasActionableGuideCta = useMemo(() => {
    if (guideActive || isAiResponding || isLoading) return false;
    const last = chatHistory[chatHistory.length - 1];
    if (!last || last.role !== "assistant") return false;
    const prevUser = [...chatHistory].reverse().find((m) => m.role === "user");
    if (!prevUser) return false;
    const pointMeta = parsePointDirective(last.content);
    return wantsOnScreenGuide(prevUser.content) && Boolean(pointMeta?.id);
  }, [chatHistory, guideActive, isAiResponding, isLoading]);

  useEffect(() => {
    if (!isOpen) {
      chatWasOpenRef.current = false;
      setGuideCtaOpenPulse(false);
      return;
    }
    const justOpened = !chatWasOpenRef.current;
    chatWasOpenRef.current = true;
    if (!justOpened || !hasActionableGuideCta) return;

    setGuideCtaOpenPulse(true);
    const t = window.setTimeout(() => setGuideCtaOpenPulse(false), 900);
    return () => window.clearTimeout(t);
  }, [isOpen, hasActionableGuideCta]);

  // Close when clicking outside modal
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDownOutside = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Ignore if click was inside modal or on the orb trigger
      if (modalRef.current?.contains(target)) return;
      if (target.closest(".ai-orb-trigger")) return;
      setIsOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDownOutside);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDownOutside);
    };
  }, [isOpen, setIsOpen]);

  const hasConversation = chatHistory.length > 0;

  useEffect(() => {
    if (!isOpen) {
      clearMessageStaggerTimeouts();
      setEntranceAnchor(0);
      setRevealedThroughIndex(-1);
      prevHistoryLenRef.current = 0;
      openStaggerDoneRef.current = false;
    }
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !hasConversation) return;
    pinMessagesToBottom();
  }, [
    isOpen,
    hasConversation,
    chatHistory,
    isLoading,
    isAiResponding,
    isExpanded,
  ]);

  useLayoutEffect(() => {
    if (!isOpen || !hasConversation || openStaggerDoneRef.current) {
      return;
    }
    openStaggerDoneRef.current = true;
    pinMessagesToBottom();
    const lastIndex = chatHistory.length - 1;
    const anchor = reduceMotion
      ? 0
      : measureFirstVisibleMessageIndex(messagesScrollRef.current);
    beginOpenMessageStagger(anchor, lastIndex);
    prevHistoryLenRef.current = chatHistory.length;
  }, [hasConversation, isExpanded, isOpen, reduceMotion, chatHistory.length]);

  useLayoutEffect(() => {
    if (!isOpen || !hasConversation || !openStaggerDoneRef.current) return;
    const len = chatHistory.length;
    const prev = prevHistoryLenRef.current;
    if (len > prev) {
      pinMessagesToBottom();
      scheduleTailReveal(prev, len - 1);
    }
    prevHistoryLenRef.current = len;
  }, [chatHistory.length, hasConversation, isOpen, isLoading]);

  useEffect(() => {
    return () => clearMessageStaggerTimeouts();
  }, []);

  // Auto-focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;

    // Trigger dynamic user-typing state
    if (val.trim()) {
      setIsUserTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        setIsUserTyping(false);
      }, 1400);
    } else {
      setIsUserTyping(false);
    }
  };

  const handleShowOnScreen = (userAsk: string) => {
    startGuide(userAsk.trim(), null);
  };

  const submitMessage = (textToSend?: string) => {
    const query = (textToSend ?? input).trim();
    if (!query || isLoading) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setIsUserTyping(false);
    sendMessage(query);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  };

  const handleCopyMessage = (idx: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1800);
  };

  const handleClearHistory = async () => {
    if (chatHistory.length === 0) return;
    const ok = await confirm({
      title: "Clear conversation?",
      message: "Clear this conversation history?",
      confirmLabel: "Clear",
      destructive: true,
    });
    if (ok) {
      clearChatHistory();
    }
  };

  const handleExportChat = () => {
    if (chatHistory.length === 0) return;
    const exportedAt = new Date().toISOString();
    const lines = [
      "# DHOOM AI Copilot Session",
      `Exported: ${exportedAt}`,
      "",
      ...chatHistory.map((msg) => {
        const role = msg.role === "user" ? "You" : "DHOOM AI";
        const body = parsePointDirective(msg.content).spoken || msg.content;
        return `### ${role}\n${body}\n`;
      }),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `buyhub-ai-${exportedAt.slice(0, 10)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={modalRef}
          initial={{
            opacity: 0,
            scale: 0.15,
            borderRadius: "3rem",
          }}
          animate={{
            opacity: 1,
            scale: 1,
            borderRadius: "2rem",
          }}
          exit={{
            opacity: 0,
            scale: 0.15,
            borderRadius: "3rem",
          }}
          transition={{
            type: "spring",
            stiffness: 340,
            damping: 28,
            mass: 0.6,
          }}
          style={{
            originX: 1,
            originY: 1,
            willChange: "transform, opacity, border-radius",
          }}
          className={`fixed bottom-6 right-6 z-50 flex max-h-[calc(100vh-3.5rem)] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-[2rem] border border-white/20 bg-background/60 text-foreground shadow-[0_24px_65px_-12px_rgba(0,0,0,0.48),0_0_0_1px_rgba(255,255,255,0.12)_inset] backdrop-blur-2xl transition-[width,height] duration-300 ease-out dark:border-white/10 dark:bg-slate-950/65 dark:shadow-[0_28px_80px_-10px_rgba(0,0,0,0.85)] [transform:translateZ(0)] ${
            isExpanded ? "h-[680px] w-[560px]" : "h-[600px] w-[352px]"
          }`}
        >
          <LayoutGroup id="buyhub-chat-orb">
          {/* ================= Modern Header (inset below outer rim) ================= */}
          <header className="relative z-20 flex shrink-0 items-center justify-between gap-2 overflow-hidden rounded-t-[2rem] border-b border-white/10 bg-background/95 px-3.5 pb-2.5 pt-3.5 backdrop-blur-xl dark:bg-slate-950/90">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {hasConversation ? (
                <motion.div
                  layoutId="buyhub-chat-orb"
                  className="relative flex size-8 shrink-0 items-center justify-center"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                >
                  <AiOrb size={28} state={assistantState} compact animated />
                </motion.div>
              ) : null}
              <h3 className="min-w-0 truncate text-xs font-semibold tracking-tight text-foreground">
                DHOOM AI
              </h3>
            </div>

            {/* Header Clean Glass Actions */}
            <div className="flex shrink-0 items-center gap-0.5 rounded-full border border-white/10 bg-white/5 p-0.5 backdrop-blur-md dark:bg-black/20">
              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                className="rounded-full p-1.5 text-muted-foreground transition hover:bg-white/15 hover:text-foreground"
                title={isExpanded ? "Standard view" : "Expand window"}
                aria-label="Toggle size"
              >
                {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
              <button
                type="button"
                onClick={handleExportChat}
                disabled={chatHistory.length === 0}
                className="rounded-full p-1.5 text-muted-foreground transition hover:bg-white/15 hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                title="Export session"
                aria-label="Export chat"
              >
                <Download size={13} />
              </button>
              <button
                type="button"
                onClick={handleClearHistory}
                disabled={chatHistory.length === 0 || isLoading}
                className="rounded-full p-1.5 text-muted-foreground transition hover:bg-rose-500/15 hover:text-rose-400 disabled:pointer-events-none disabled:opacity-30"
                title="Reset conversation"
                aria-label="Clear chat"
              >
                <Trash2 size={13} />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full p-1.5 text-muted-foreground transition hover:bg-white/15 hover:text-foreground"
                title="Close"
                aria-label="Close assistant"
              >
                <X size={14} />
              </button>
            </div>
          </header>

          {/* ================= Empty vs conversation ================= */}
          {!hasConversation ? (
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-4">
              <div
                className="pointer-events-none absolute top-1/2 left-1/2 -z-10 h-56 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tr from-cyan-500/10 via-indigo-500/10 to-purple-500/15 blur-3xl"
                aria-hidden
              />
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <motion.div
                  layoutId="buyhub-chat-orb"
                  className="flex items-center justify-center"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                >
                  <AiOrb size={54} state={assistantState} />
                </motion.div>
                <h4 className="mt-3.5 text-sm font-semibold text-foreground">
                  How can I help you today?
                </h4>
                <p className="mt-1 max-w-[240px] text-[11px] leading-relaxed text-muted-foreground">
                  Ask live questions, pull custom reports, or launch on-screen guides.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                  {PROMPT_SUGGESTIONS.map((item) => (
                    <AssistantSuggestChip
                      key={item.label}
                      onClick={() => submitMessage(item.query)}
                    >
                      {item.label}
                    </AssistantSuggestChip>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          </LayoutGroup>

          {hasConversation ? (
          <div
            ref={messagesScrollRef}
            className="relative z-0 min-h-0 flex-1 overflow-x-hidden overflow-y-auto scroll-pt-3 px-4 pb-3.5 pt-4 scrollbar-thin scrollbar-thumb-white/10"
          >
            <div className="relative space-y-3.5">
              <div
                className="pointer-events-none absolute -bottom-10 -right-10 -z-10 h-72 w-72 rounded-full bg-gradient-to-tl from-indigo-500/20 via-sky-500/15 to-purple-500/10 blur-3xl"
                aria-hidden
              />

            {chatHistory.map((msg, idx) => {
              const isUser = msg.role === "user";
              const { spoken } = parsePointDirective(msg.content);
              const pointMeta = !isUser ? parsePointDirective(msg.content) : null;
              const prevUser = [...chatHistory.slice(0, idx)]
                .reverse()
                .find((m) => m.role === "user");

              const parsedAssistant = !isUser
                ? parseAssistantMessage(msg.content)
                : null;
              const prevAsk = prevUser?.content ?? "";
              const showQuickOpenPills =
                (needsAppNavKnowledge(prevAsk) || wantsOnScreenGuide(prevAsk)) &&
                !isDataQuestion(prevAsk) &&
                !/\b(his|her|their)\s+(email|e-?mail|phone|mobile|number|address)\b/i.test(
                  prevAsk,
                );
              const routeHrefsForStrip = !isUser
                ? [
                    ...(parsedAssistant?.routeHrefs ?? []),
                    ...extractAdminRoutes(msg.content),
                  ].filter((href, i, arr) => arr.indexOf(href) === i)
                : [];
              const rawSpoken = !isUser
                ? parsedAssistant
                  ? dropLabelsCoveredByRoutePills(
                      parsedAssistant.spoken,
                      routeHrefsForStrip,
                    )
                  : spoken || msg.content
                : msg.content;
              const present = parsedAssistant?.present ?? null;
              const openAction = parsedAssistant?.open ?? null;

              const entityOpenPending =
                !isUser && prevUser && wantsEntityOpen(prevUser.content)
                  ? inferEntityOpenRequest(
                      prevUser.content,
                      chatHistory.slice(0, idx),
                    )
                  : null;

              const canOpenRecord =
                !isUser &&
                !presentIncludesEntityDeepLinks(present) &&
                (Boolean(openAction?.href) || Boolean(entityOpenPending));

              const canShowOnScreen =
                !isUser &&
                Boolean(prevUser) &&
                wantsOnScreenGuide(prevUser!.content) &&
                Boolean(pointMeta?.id) &&
                !canOpenRecord;

              const isLatestAssistant =
                !isUser && idx === chatHistory.length - 1 && !isLoading;
              const suggestions = isLatestAssistant
                ? parseSuggestDirective(msg.content)
                : [];
              const routeHrefs = !isUser && showQuickOpenPills
                ? [
                    ...(parsedAssistant?.routeHrefs ?? []),
                    ...extractAdminRoutes(msg.content),
                  ]
                    .filter((href, i, arr) => arr.indexOf(href) === i)
                    .filter(
                      (href) =>
                        !canOpenRecord || !isAdminRecordDetailHref(href),
                    )
                    .slice(0, 2)
                : [];

              const pulseGuideCta =
                canShowOnScreen &&
                isLatestAssistant &&
                !guideActive &&
                !isAiResponding;
              const openPulseGuideCta =
                pulseGuideCta && guideCtaOpenPulse && !reduceMotion;
              const loopPulseGuideCta =
                pulseGuideCta && !guideCtaOpenPulse && !reduceMotion;

              const isPreAnchor = idx < entranceAnchor;
              const isMessageVisible =
                reduceMotion ||
                isPreAnchor ||
                idx <= revealedThroughIndex;

              return (
                <motion.div
                  key={idx}
                  data-chat-message-index={idx}
                  initial={false}
                  animate={{
                    opacity: isMessageVisible ? 1 : 0,
                    y: isMessageVisible ? 0 : 12,
                    scale: isMessageVisible ? 1 : 0.98,
                  }}
                  transition={{
                    duration: MESSAGE_ENTER_DURATION_S,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className={`group relative flex flex-col ${
                    isUser ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`flex max-w-[90%] ${
                      isUser ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div className="relative">
                      <div
                        className={`relative rounded-2xl p-3 text-xs leading-relaxed transition-all ${
                          isUser
                            ? "rounded-tr-xs bg-primary text-primary-foreground shadow-[0_4px_18px_-4px_rgba(235,32,95,0.25)]"
                            : "rounded-tl-xs border border-white/20 bg-white/40 text-foreground shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.05]"
                        }`}
                      >
                        <FormattedSpoken text={rawSpoken} />
                        {present ? <AssistantPresentStack present={present} /> : null}

                        {canOpenRecord ? (
                          <AssistantOpenRecordButton
                            ready={openAction}
                            pending={openAction ? null : entityOpenPending}
                          />
                        ) : null}

                        {canShowOnScreen ? (
                          <AssistantActionButton
                            variant="guide"
                            label="Guide on Screen"
                            pulse={
                              openPulseGuideCta
                                ? "intro"
                                : loopPulseGuideCta
                                  ? "loop"
                                  : false
                            }
                            onClick={() => handleShowOnScreen(prevUser!.content)}
                            icon={<Play size={8} fill="currentColor" aria-hidden />}
                          />
                        ) : null}
                      </div>

                      {/* Micro-hover copy action */}
                      {!isUser && (
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(idx, rawSpoken)}
                          className="absolute -bottom-2 right-2 rounded-full border border-white/15 bg-background/80 p-1 text-[9px] text-muted-foreground opacity-0 shadow-sm backdrop-blur-md transition-opacity group-hover:opacity-100 hover:text-foreground"
                          title="Copy text"
                        >
                          {copiedIdx === idx ? (
                            <Check size={10} className="text-emerald-500" />
                          ) : (
                            <Copy size={10} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {routeHrefs.length > 0 ? (
                    <AssistantRoutePills
                      hrefs={routeHrefs}
                      className="mt-2 w-full max-w-[90%]"
                    />
                  ) : null}

                  {/* Suggestion Chips */}
                  {suggestions.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.12 }}
                      className="mt-2.5 flex w-full flex-col gap-1"
                    >
                      <div className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">
                        <Zap size={9} className="text-amber-400" />
                        <span>Suggested next questions</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestions.map((q) => (
                          <AssistantSuggestChip
                            key={q}
                            onClick={() => submitMessage(q)}
                            disabled={isLoading}
                          >
                            {q}
                          </AssistantSuggestChip>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              );
            })}

            {/* AI Synthesizing Live Indicator */}
            {isLoading &&
              (reduceMotion ||
                revealedThroughIndex >= chatHistory.length - 1) && (
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: MESSAGE_ENTER_DURATION_S,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="flex items-center gap-2"
              >
                <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/30 px-3 py-2 backdrop-blur-xl dark:border-white/5 dark:bg-white/[0.04]">
                  <div className="flex gap-1">
                    <span className="size-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.3s]" />
                    <span className="size-1.5 rounded-full bg-sky-500 animate-bounce [animation-delay:-0.15s]" />
                    <span className="size-1.5 rounded-full bg-purple-500 animate-bounce" />
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {assistantState === "querying"
                      ? "Reading live books…"
                      : "Thinking it through…"}
                  </span>
                </div>
              </motion.div>
            )}
            </div>
          </div>
          ) : null}

          {/* ================= Glass Command Prompt Input ================= */}
          <footer className="relative shrink-0 overflow-hidden rounded-b-[2rem] border-t border-white/10 bg-background/80 p-3 backdrop-blur-xl dark:bg-slate-950/75">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitMessage();
              }}
              className="relative flex items-center overflow-hidden rounded-2xl border border-white/20 bg-white/50 shadow-[0_2px_14px_-2px_rgba(0,0,0,0.08)_inset] ring-1 ring-black/5 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60 dark:ring-white/5"
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Ask a live question or ‘guide me to…’"
                disabled={isLoading}
                className="max-h-24 w-full resize-none border-none bg-transparent px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
              />

              <div className="mr-2 flex items-center">
                <motion.button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  whileHover={
                    reduceMotion ? undefined : { scale: 1.06 }
                  }
                  whileTap={reduceMotion ? undefined : { scale: 0.92 }}
                  transition={{ type: "spring", stiffness: 480, damping: 24 }}
                  className="flex size-7 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_2px_10px_-2px_rgba(235,32,95,0.45)] disabled:pointer-events-none disabled:opacity-30"
                  aria-label="Send message"
                >
                  <ArrowUp size={14} strokeWidth={2.4} />
                </motion.button>
              </div>
            </form>
            <div className="mt-1 flex items-center justify-between px-1.5 text-[9px] text-muted-foreground/60">
              <span>Return ↵ to send</span>
              <span className="flex items-center gap-1">
                <span className="size-1 rounded-full bg-emerald-500" />
                Context Active
              </span>
            </div>
          </footer>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
