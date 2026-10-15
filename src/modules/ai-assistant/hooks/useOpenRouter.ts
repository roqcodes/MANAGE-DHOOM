"use client";

import { useCallback, useState } from "react";

import { chatIncludesScreenPayload } from "../lib/chat-request-context";
import { userAllowsHeaderQuickCreate } from "../lib/goal-intent";
import { isDataQuestion } from "../lib/message-intent";
import { parseReportBlock } from "../lib/parse-report";
import { captureScreenSnapshot } from "../lib/screen-snapshot";
import { useAiAssistant } from "../context/AiAssistantContext";

export const useOpenRouter = () => {
  const [isLoading, setIsLoading] = useState(false);
  const {
    addMessage,
    chatHistory,
    setIsAiResponding,
    setIsUserTyping,
    setDataMood,
  } = useAiAssistant();

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim()) return;

      setIsUserTyping(false);
      addMessage("user", message);
      setIsLoading(true);
      setIsAiResponding(true);
      setDataMood(isDataQuestion(message) ? "querying" : "off");

      try {
        const includeScreen = chatIncludesScreenPayload("chat", message);
        const screen = includeScreen
          ? captureScreenSnapshot({
              includeHeaderQuickCreate: userAllowsHeaderQuickCreate(message),
            })
          : undefined;
        const historyForApi = [
          ...chatHistory,
          { role: "user" as const, content: message },
        ];

        const response = await fetch("/api/ai-assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "chat",
            message,
            goal: message,
            chatHistory: historyForApi.slice(0, -1),
            ...(screen ? { screen } : {}),
          }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const errText =
            typeof data.error === "string"
              ? data.error
              : "Sorry, I could not reach the AI service.";
          throw new Error(errText);
        }

        const reply = data.reply as string;
        addMessage("assistant", reply);
        if (parseReportBlock(reply).report) {
          setDataMood("insight");
          window.setTimeout(() => setDataMood("off"), 2800);
        } else {
          setDataMood("off");
        }
      } catch (error) {
        const msg =
          error instanceof Error
            ? error.message
            : "Sorry, I encountered an error. Please try again.";
        addMessage("assistant", msg);
        setDataMood("off");
      } finally {
        setIsLoading(false);
        setIsAiResponding(false);
      }
    },
    [
      addMessage,
      chatHistory,
      setIsAiResponding,
      setIsUserTyping,
      setDataMood,
    ],
  );

  return { sendMessage, isLoading };
};
