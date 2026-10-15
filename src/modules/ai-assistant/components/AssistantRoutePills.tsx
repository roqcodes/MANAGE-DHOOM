"use client";

import { ArrowUpRight, PanelTopOpen } from "lucide-react";
import { motion } from "framer-motion";

import { AssistantActionButton } from "./assistant-action-ui";

import { getSitemapPage } from "../lib/app-sitemap";
import { MAX_ASSISTANT_ROUTE_PILLS } from "../lib/spoken-routes";

function uniqueHrefs(hrefs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const href of hrefs) {
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(href);
    if (out.length >= MAX_ASSISTANT_ROUTE_PILLS) break;
  }
  return out;
}

function RoutePill({ href }: { href: string }) {
  const page = getSitemapPage(href);
  const label = page?.name ?? href;

  return (
    <AssistantActionButton
      variant="nav"
      href={href}
      label={label}
      className="mt-0"
      icon={<ArrowUpRight size={9} strokeWidth={2.5} aria-hidden />}
    />
  );
}

export function AssistantRoutePills({
  hrefs,
  className,
}: {
  hrefs: string[];
  className?: string;
}) {
  const routes = uniqueHrefs(hrefs);
  if (routes.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={`flex w-full flex-col gap-1.5 ${className ?? "mt-1.5"}`}
      data-ai-route-pills
    >
      <div className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">
        <PanelTopOpen size={9} className="text-sky-400" />
        <span>Quick open</span>
      </div>
      <div
        className={`grid gap-1.5 ${routes.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
      >
        {routes.map((href) => (
          <RoutePill key={href} href={href} />
        ))}
      </div>
    </motion.div>
  );
}
