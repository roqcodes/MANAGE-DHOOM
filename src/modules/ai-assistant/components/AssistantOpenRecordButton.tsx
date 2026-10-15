"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

import type { AssistantOpenAction } from "../lib/parse-open";
import type { EntityOpenRequest } from "../lib/entity-open-request";
import { useAiAssistant } from "../context/AiAssistantContext";
import { useAdminAlert } from "@/modules/admin/components/admin-alert-provider";
import { AssistantActionButton } from "./assistant-action-ui";

async function fetchResolvedOpen(
  request: EntityOpenRequest,
): Promise<AssistantOpenAction> {
  const res = await fetch("/api/ai-assistant/resolve-record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      kind: request.kind,
      query: request.query,
      tokens: request.tokens,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : "Could not find that record",
    );
  }
  const data = json.data as AssistantOpenAction;
  if (!data?.href) throw new Error("Could not find that record");
  return data;
}

export function AssistantOpenRecordButton({
  ready,
  pending,
  className,
}: {
  ready?: AssistantOpenAction | null;
  pending?: EntityOpenRequest | null;
  className?: string;
}) {
  const router = useRouter();
  const { setIsOpen } = useAiAssistant();
  const { showError } = useAdminAlert();
  const [loading, setLoading] = useState(false);

  if (!ready?.href && !pending) return null;

  const name = pending?.displayName?.trim();
  const label =
    ready?.label ||
    (pending && name && !/^(something|like|open)$/i.test(name)
      ? `Open ${name}`
      : pending
        ? "Open customer"
        : "Open record");
  const subtitle =
    ready?.subtitle ||
    (pending && !ready
      ? `Finds the right ${pending.kindLabel} and opens it`
      : undefined);

  const go = (href: string) => {
    setIsOpen(false);
    router.push(href);
  };

  const onClick = async () => {
    if (ready?.href) {
      go(ready.href);
      return;
    }
    if (!pending || loading) return;
    setLoading(true);
    try {
      const resolved = await fetchResolvedOpen(pending);
      go(resolved.href);
    } catch (e) {
      showError(e, "Could not open record");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AssistantActionButton
      variant="open"
      layout="stack"
      label={label}
      subtitle={subtitle}
      loading={loading}
      onClick={() => void onClick()}
      className={className}
      icon={<ArrowUpRight size={9} strokeWidth={2.5} aria-hidden />}
    />
  );
}
