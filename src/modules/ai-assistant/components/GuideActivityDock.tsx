"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  MousePointer2,
  Compass,
  X,
} from "lucide-react";

import { useAiAssistant, type GuideLogKind } from "../context/AiAssistantContext";

const KIND_META: Record<
  GuideLogKind,
  { icon: typeof Compass; color: string; dotColor: string }
> = {
  info: { icon: Compass, color: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/15", dotColor: "bg-indigo-500" },
  look: { icon: Eye, color: "text-sky-600 dark:text-sky-400 bg-sky-500/15", dotColor: "bg-sky-500" },
  point: { icon: MousePointer2, color: "text-amber-600 dark:text-amber-400 bg-amber-500/15", dotColor: "bg-amber-500" },
  ok: { icon: Check, color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/15", dotColor: "bg-emerald-500" },
  stop: { icon: X, color: "text-rose-600 dark:text-rose-400 bg-rose-500/15", dotColor: "bg-rose-500" },
};

function LogRow({ log }: { log: { id: string; text: string; kind: GuideLogKind } }) {
  const Meta = KIND_META[log.kind];
  const Icon = Meta.icon;
  return (
    <div className="flex items-center gap-2 rounded-xl py-1 px-1.5 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]">
      <span
        className={`flex size-4 shrink-0 items-center justify-center rounded-full ${Meta.color}`}
      >
        <Icon size={9} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium leading-tight text-slate-800 dark:text-slate-200">
        {log.text}
      </span>
    </div>
  );
}

/**
 * Premium White Acrylic Transparent Floating Walkthrough Pill.
 * Perfectly aligned on the same horizontal baseline as the 60px Docked Orb:
 * - Base: `bottom-6`
 * - Center aligned: `h-[50px]` with `my-[5px]` matching the `60px` orb height
 * - Placed immediately left of orb: `right-[94px]` with smooth responsive max width
 * - Luxury white frosted acrylic background: `bg-white/70 backdrop-blur-2xl`
 * - Delicate iridescent edge lighting matching BuyHub AI's cyan/indigo aura
 */
export function GuideActivityDock() {
  const { guideActive, guideFinished, guideLogs, stopGuide } = useAiAssistant();
  const [expanded, setExpanded] = useState(false);
  const visible = guideActive && !guideFinished;
  const latest = guideLogs[guideLogs.length - 1];
  const canExpand = guideLogs.length > 1;

  useEffect(() => {
    if (!visible) setExpanded(false);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && latest && (
        <motion.div
          initial={{ opacity: 0, x: 24, scale: 0.94, filter: "blur(8px)" }}
          animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, x: 18, scale: 0.94, filter: "blur(8px)" }}
          transition={{ type: "spring", stiffness: 360, damping: 27 }}
          className="pointer-events-auto fixed bottom-6 right-[94px] z-[200] max-w-[min(22rem,calc(100vw-8rem))]"
        >
          {/* Frosted White Acrylic Glass Surface */}
          <div className="relative overflow-hidden rounded-[26px] border border-white/80 bg-white/75 p-1.5 shadow-[0_16px_36px_-6px_rgba(30,41,59,0.18),0_0_0_1px_rgba(255,255,255,0.7)_inset,0_4px_16px_rgba(56,189,248,0.12)] backdrop-blur-2xl dark:border-white/20 dark:bg-slate-900/75 dark:shadow-[0_16px_40px_-8px_rgba(0,0,0,0.5),inset_0_1px_2px_rgba(255,255,255,0.25)]">
            {/* Subtle multi-chromatic gloss gradient ribbon */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-sky-400/10 via-indigo-400/5 to-purple-400/10 opacity-80" />

            {/* Main horizontal pill row — exactly 48px to vertically center with the 60px orb */}
            <div className="relative flex h-[46px] items-center gap-2.5 px-3">
              {/* Dual-ring luminous pulsing radar bead */}
              <span className="relative flex size-2.5 shrink-0 items-center justify-center">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-400/80 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-gradient-to-tr from-sky-400 to-indigo-500 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
              </span>

              {/* Step info block */}
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400/90">
                  Live Walkthrough
                </p>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={latest.id}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                  >
                    <p className="truncate text-xs font-semibold tracking-tight text-slate-800 dark:text-slate-100">
                      {latest.text}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Seamless Action buttons */}
              <div className="flex shrink-0 items-center gap-1 pl-1">
                {canExpand && (
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    aria-label={expanded ? "Collapse steps" : "Expand steps"}
                    className="flex size-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-900/5 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                )}

                <button
                  type="button"
                  onClick={stopGuide}
                  title="End Guide"
                  aria-label="End Guide"
                  className="flex size-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-rose-500/15 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-500/20 dark:hover:text-rose-300"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Expandable Step History dropdown with translucent separation */}
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: "easeInOut" }}
                  className="overflow-hidden border-t border-slate-200/60 pt-1.5 dark:border-white/10"
                >
                  <ul className="max-h-40 space-y-0.5 overflow-y-auto px-1 pb-1 pr-1.5 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-white/10">
                    {guideLogs.map((log) => (
                      <li key={log.id}>
                        <LogRow log={log} />
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
