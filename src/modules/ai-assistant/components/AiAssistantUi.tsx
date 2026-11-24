"use client";

import React from "react";

import { useAiAssistantPreference } from "../context/AiAssistantPreferenceContext";
import { useGuideLoop } from "../hooks/useGuideLoop";
import { ChatWindow } from "./ChatWindow";
import { GuideActivityDock } from "./GuideActivityDock";
import { SmartOrb } from "./SmartOrb";

function AiAssistantUiEnabled() {
  useGuideLoop();
  return (
    <>
      <SmartOrb />
      <GuideActivityDock />
      <ChatWindow />
    </>
  );
}

/** Orb, guide dock, and chat rail (requires AiAssistantProvider above). */
export function AiAssistantUi() {
  const { enabled } = useAiAssistantPreference();
  if (!enabled) return null;
  return <AiAssistantUiEnabled />;
}