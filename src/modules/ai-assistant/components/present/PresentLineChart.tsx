"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";

import type { UiChartBlock } from "../../lib/parse-ui";
import { AI_MOTION_EASE } from "../assistant-action-ui";
import { formatChartValue } from "./present-format";
import { PresentShell } from "./PresentShell";

const W = 320;
const H = 112;
const PAD = { t: 10, r: 8, b: 26, l: 8 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;

function pointCoords(
  index: number,
  count: number,
  value: number,
  min: number,
  max: number,
) {
  const x =
    count <= 1
      ? PAD.l + PLOT_W / 2
      : PAD.l + (index / (count - 1)) * PLOT_W;
  const span = max - min || 1;
  const norm = (value - min) / span;
  const y = PAD.t + PLOT_H - norm * PLOT_H;
  return { x, y };
}

export function PresentLineChart({ block }: { block: UiChartBlock }) {
  const reduceMotion = useReducedMotion();
  const gradId = useId().replace(/:/g, "");
  const items = block.items;
  const values = items.map((i) => i.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const coords = items.map((item, i) =>
    pointCoords(i, items.length, item.value, min, max),
  );
  const linePath = coords
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${PAD.t + PLOT_H} L ${coords[0].x.toFixed(1)} ${PAD.t + PLOT_H} Z`
      : "";

  return (
    <PresentShell title={block.title}>
      <div className="px-2 py-2.5" aria-label={block.title ?? "Trend chart"}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-[7.5rem] w-full text-sky-400"
          role="img"
          aria-hidden
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(56,189,248)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="rgb(56,189,248)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((frac) => {
            const y = PAD.t + PLOT_H * (1 - frac);
            return (
              <line
                key={frac}
                x1={PAD.l}
                x2={W - PAD.r}
                y1={y}
                y2={y}
                className="stroke-white/10"
                strokeWidth="1"
              />
            );
          })}
          {areaPath ? (
            <motion.path
              d={areaPath}
              fill={`url(#${gradId})`}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35, ease: AI_MOTION_EASE }}
            />
          ) : null}
          <motion.path
            d={linePath}
            fill="none"
            className="stroke-sky-400"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduceMotion ? false : { pathLength: 0, opacity: 0.6 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.55, ease: AI_MOTION_EASE }}
          />
          {coords.map((p, i) => (
            <motion.circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="3.5"
              className="fill-primary stroke-background"
              strokeWidth="1.5"
              initial={reduceMotion ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                delay: reduceMotion ? 0 : 0.08 * i,
                type: "spring",
                stiffness: 420,
                damping: 24,
              }}
            />
          ))}
          {items.map((item, i) => {
            const x = coords[i]?.x ?? PAD.l;
            const label =
              item.label.length > 10
                ? `${item.label.slice(0, 9)}…`
                : item.label;
            return (
              <text
                key={`${item.label}-${i}`}
                x={x}
                y={H - 6}
                textAnchor="middle"
                className="fill-muted-foreground text-[8px]"
              >
                {label}
              </text>
            );
          })}
        </svg>
        <ul className="mt-1 space-y-0.5 border-t border-white/8 pt-1.5">
          {items.map((item, i) => (
            <li
              key={`${item.label}-v-${i}`}
              className="flex items-baseline justify-between gap-2 text-[10px]"
            >
              <span className="truncate text-muted-foreground">{item.label}</span>
              <span className="shrink-0 tabular-nums font-medium text-foreground">
                {formatChartValue(item.value, block.valueFormat)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </PresentShell>
  );
}
