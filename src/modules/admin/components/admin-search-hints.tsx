"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const SEARCH_HINTS = [
  "Search orders by customer or reference…",
  "Find products, SKUs, and categories…",
  "Jump to admin pages and settings…",
  "Look up customers and vendors…",
  "Open purchase orders and inventory…",
] as const;

const HINT_INTERVAL_MS = 3200;

export function AdminSearchHintRotator() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % SEARCH_HINTS.length);
    }, HINT_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, []);

  return (
    <span className="relative block h-5 min-w-0 flex-1 overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={SEARCH_HINTS[index]}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 truncate text-left text-[13px] font-medium text-slate-400"
        >
          {SEARCH_HINTS[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
