"use client";

import React from "react";

import { AiAssistantProvider } from "../context/AiAssistantContext";
import { useGuideLoop } from "../hooks/useGuideLoop";
import { ChatWindow } from "./ChatWindow";
import { GuideActivityDock } from "./GuideActivityDock";
import { SmartOrb } from "./SmartOrb";

function GuideRuntime() {
  useGuideLoop();

  return (
    <>
      <SmartOrb />
      <GuideActivityDock />
      <ChatWindow />
    </>
  );
}

export const AiAssistantOverlay = () => {
  return (
    <AiAssistantProvider>
      <GuideRuntime />
    </AiAssistantProvider>
  );
};
