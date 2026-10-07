"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";

const RING_EXIT = { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const };
const ARROW_RETURN = {
  type: "spring" as const,
  stiffness: 260,
  damping: 26,
  mass: 0.48,
};

export const POINTER_SIZE = 52;
export const ARROW_SVG_SIZE = 42;
export const ARROW_INSET = (POINTER_SIZE - ARROW_SVG_SIZE) / 2;

type Face = "left" | "right";

/** One canonical tilt; `face` only mirrors horizontally for symmetric left/right. */
export const POINTER_TILT_DEG = -45;
const POINTER_THINKING_TILT_DEG = -20;

/**
 * Modern Smooth Organic AI Pointer & Breathing Ring Morph.
 *
 * 1. Curvature & Softness:
 *    - Replaces harsh sharp triangle edges with soft, organic aerodynamic curves (curved chamfered tip, smooth waist, rounded barbs).
 * 2. New Loading/Thinking State (Replacing the 3 dots):
 *    - Replaced with a luminous, spinning celestial pulse ring + glowing ambient orb core that organically expands outward when thinking.
 */
export function AcrylicPointer({
  face,
  thinking = false,
}: {
  face: Face;
  thinking?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const mirrorX = face === "right";

  return (
    <div
      className="relative select-none pointer-events-none"
      style={{ width: POINTER_SIZE, height: POINTER_SIZE }}
    >
      {/* Arrow anchored to the POINTER_SIZE box (aim math assumes this frame). */}
      <motion.div
        initial={false}
        animate={
          thinking
            ? {
                opacity: 0,
                scale: 0.3,
                rotate: POINTER_THINKING_TILT_DEG,
                scaleX: mirrorX ? -1 : 1,
                filter: "blur(4px)",
              }
            : {
                opacity: 1,
                scale: 1,
                rotate: POINTER_TILT_DEG,
                scaleX: mirrorX ? -1 : 1,
                scaleY: 1,
                filter: "blur(0px)",
              }
        }
        transition={
          thinking
            ? { type: "spring", stiffness: 380, damping: 27 }
            : reduceMotion
              ? { duration: 0.25 }
              : {
                  opacity: { duration: 0.32, delay: 0.06 },
                  scale: ARROW_RETURN,
                  rotate: ARROW_RETURN,
                  filter: { duration: 0.28 },
                }
        }
        className="absolute z-10 origin-center"
        style={{
          left: ARROW_INSET,
          top: ARROW_INSET,
          width: ARROW_SVG_SIZE,
          height: ARROW_SVG_SIZE,
        }}
      >
        <svg
          width={ARROW_SVG_SIZE}
          height={ARROW_SVG_SIZE}
          viewBox="0 0 44 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="overflow-visible"
        >
          <defs>
            <linearGradient
              id="pointer-grad-pure"
              x1="22"
              y1="5"
              x2="22"
              y2="38"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="50%" stopColor="#6366F1" />
              <stop offset="100%" stopColor="#A855F7" />
            </linearGradient>

            <linearGradient
              id="pointer-edge-pure"
              x1="22"
              y1="5"
              x2="22"
              y2="38"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#BAE6FD" stopOpacity="0.95" />
              <stop offset="55%" stopColor="#C7D2FE" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#E9D5FF" stopOpacity="0.85" />
            </linearGradient>

            <linearGradient
              id="pointer-glaze"
              x1="22"
              y1="6"
              x2="22"
              y2="28"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
              <stop offset="45%" stopColor="#E0E7FF" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Smooth, perfectly symmetric chevron body (slender & sleek, left flap == right flap around center x=22) */}
          <path
            d="M21.2 5.35C21.6 4.9 22.4 4.9 22.8 5.35C25.3 9.4 30.8 19.5 33.2 24.6C33.8 25.8 32.9 27.1 31.6 26.7L23.8 24.4C22.6 24.05 21.4 24.05 20.2 24.4L12.4 26.7C11.1 27.1 10.2 25.8 10.8 24.6C13.2 19.5 18.7 9.4 21.2 5.35Z"
            fill="url(#pointer-grad-pure)"
            stroke="url(#pointer-edge-pure)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Symmetrical specular glaze highlight */}
          <path
            d="M21.3 6.9C21.7 6.45 22.3 6.45 22.7 6.9C24.8 10.4 29.4 18.8 31.0 22.9C31.4 23.7 30.7 24.4 29.9 24.2L23.3 22.3C22.5 22.05 21.5 22.05 20.7 22.3L14.1 24.2C13.3 24.4 12.6 23.7 13.0 22.9C14.6 18.8 19.2 10.4 21.3 6.9Z"
            fill="url(#pointer-glaze)"
          />
        </svg>
      </motion.div>

      {/* Luminous Glowing Pulse Ring & Core Orb (Replaces the 3 dots) */}
      <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
        {/* Outer glowing ripple wave */}
        <motion.div
          initial={false}
          animate={
            thinking
              ? {
                  opacity: reduceMotion ? 0.8 : [0.15, 0.75, 0.15],
                  scale: reduceMotion ? 1 : [0.85, 1.35, 0.85],
                  rotate: reduceMotion ? 0 : 360,
                }
              : {
                  opacity: 0,
                  scale: 0.2,
                  rotate: 0,
                }
          }
          transition={
            thinking
              ? {
                  opacity: { repeat: Infinity, duration: 1.8, ease: "easeInOut" },
                  scale: { repeat: Infinity, duration: 1.8, ease: "easeInOut" },
                  rotate: { repeat: Infinity, duration: 3, ease: "linear" },
                }
              : { opacity: RING_EXIT, scale: RING_EXIT, rotate: { duration: 0.35 } }
          }
          className="absolute size-7 rounded-full border border-sky-400/60 bg-gradient-to-tr from-sky-400/20 via-indigo-500/20 to-purple-500/25 blur-[0.5px]"
        />

        {/* Inner spinning gradient orbital track with notch indicator */}
        <motion.div
          initial={false}
          animate={
            thinking
              ? {
                  opacity: 1,
                  scale: 1,
                  rotate: 360,
                }
              : {
                  opacity: 0,
                  scale: 0.3,
                  rotate: 0,
                }
          }
          transition={
            thinking
              ? {
                  opacity: { duration: 0.2 },
                  scale: { type: "spring", stiffness: 350, damping: 25 },
                  rotate: { repeat: Infinity, duration: 1.1, ease: "linear" },
                }
              : {
                  opacity: RING_EXIT,
                  scale: RING_EXIT,
                  rotate: { duration: 0.3 },
                }
          }
          className="absolute size-5 rounded-full border-2 border-transparent border-t-sky-400 border-r-indigo-400"
        />

        {/* Pulsing center micro-orb */}
        <motion.div
          initial={false}
          animate={
            thinking
              ? {
                  opacity: 1,
                  scale: reduceMotion ? 1 : [0.9, 1.25, 0.9],
                }
              : {
                  opacity: 0,
                  scale: 0.2,
                }
          }
          transition={
            thinking
              ? {
                  opacity: { duration: 0.18 },
                  scale: { repeat: Infinity, duration: 1.1, ease: "easeInOut" },
                }
              : { opacity: RING_EXIT, scale: RING_EXIT }
          }
          className="absolute size-2.5 rounded-full bg-gradient-to-br from-white via-sky-300 to-indigo-500 shadow-[0_0_8px_rgba(56,189,248,0.9)]"
        />
      </div>
    </div>
  );
}
