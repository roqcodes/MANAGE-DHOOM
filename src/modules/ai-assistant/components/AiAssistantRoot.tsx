"use client";

import type { ReactNode } from "react";

import {
  AiAssistantPreferenceProvider,
  useAiAssistantPreference,
} from "../context/AiAssistantPreferenceContext";
import { AiAssistantOverlay } from "./AiAssistantOverlay";

function AiAssistantOverlayGate() {
  const { enabled } = useAiAssistantPreference();
  if (!enabled) return null;
  return <AiAssistantOverlay />;
}

export function AiAssistantRoot({ children }: { children: ReactNode }) {
  return (
    <AiAssistantPreferenceProvider>
      {children}
      <AiAssistantOverlayGate />
    </AiAssistantPreferenceProvider>
  );
}
