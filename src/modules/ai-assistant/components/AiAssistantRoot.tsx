"use client";

import type { ReactNode } from "react";

import { AiAssistantProvider } from "../context/AiAssistantContext";
import { AiAssistantPreferenceProvider } from "../context/AiAssistantPreferenceContext";
import { AiAssistantUi } from "./AiAssistantUi";

export function AiAssistantRoot({ children }: { children: ReactNode }) {
  return (
    <AiAssistantPreferenceProvider>
      <AiAssistantProvider>
        <>
          {children}
          <AiAssistantUi />
        </>
      </AiAssistantProvider>
    </AiAssistantPreferenceProvider>
  );
}
