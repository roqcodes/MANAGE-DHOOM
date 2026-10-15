"use client";

import { motion, useReducedMotion } from "framer-motion";

import type { AssistantPresent, UiBlock } from "../../lib/parse-ui";
import { AI_MOTION_EASE } from "../assistant-action-ui";
import { PresentLineChart } from "./PresentLineChart";
import { PresentEntityCard } from "./PresentEntityCard";
import { PresentMetrics } from "./PresentMetrics";
import { PresentTable } from "./PresentTable";

function PresentBlock({ block }: { block: UiBlock }) {
  switch (block.type) {
    case "metrics":
      return <PresentMetrics block={block} />;
    case "entity":
      return <PresentEntityCard block={block} />;
    case "table":
      return <PresentTable block={block} />;
    case "chart":
      return <PresentLineChart block={block} />;
    default:
      return null;
  }
}

export function AssistantPresentStack({ present }: { present: AssistantPresent }) {
  const reduceMotion = useReducedMotion();
  const blocks = present.blocks;

  if (blocks.length === 0) return null;

  return (
    <div className="mt-2.5 flex w-full flex-col gap-2">
      {blocks.map((block, index) => (
        <motion.div
          key={`${block.type}-${index}`}
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: reduceMotion ? 0 : 0.28,
            delay: reduceMotion ? 0 : index * 0.05,
            ease: AI_MOTION_EASE,
          }}
        >
          <PresentBlock block={block} />
        </motion.div>
      ))}
    </div>
  );
}
