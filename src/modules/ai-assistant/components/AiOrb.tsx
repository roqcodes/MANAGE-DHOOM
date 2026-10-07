"use client";

import React from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { AssistantState } from "../context/AiAssistantContext";

export interface AiOrbProps {
  size?: number;
  className?: string;
  state?: AssistantState;
  /** Tighter glow for header/inline use inside overflow-hidden panels */
  compact?: boolean;
  /** Motion + morph */
  animated?: boolean;
  /** Slower, subtler motion for the docked orb when chat is closed and idle */
  animationPace?: "default" | "ambient";
  isActive?: boolean;
  isThinking?: boolean;
}

/**
 * 2026 Fluid Volumetric Neural Orb.
 * Deforms non-circularly using living organic SVG morphing and multi-pole
 * border-radius shifts.
 * Dynamic reactive states:
 * - "idle": Gentle organic breathing fluid
 * - "user-typing": Eager reactive contraction, expectant shimmer
 * - "thinking": Rapid morphing & chaotic magnetic perturbation
 * - "assistant-typing": Rhythmic communicative heartbeat pulse
 * - "guiding-pointing": Focused directional elongation towards action
 * - "guiding-scanning": Wide perception aperture scan
 * - "finished": Serene crystalline stabilization
 */
export const AiOrb: React.FC<AiOrbProps> = ({
  size = 48,
  className = "",
  state = "idle",
  compact = false,
  animated = false,
  animationPace = "default",
  isActive = false,
  isThinking = false,
}) => {
  const reduceMotion = useReducedMotion();
  const motionOn = animated && !reduceMotion;

  // Resolve effective state if passed through legacy props
  const effectiveState: AssistantState = isThinking
    ? "thinking"
    : state !== "idle"
      ? state
      : isActive
        ? "thinking"
        : "idle";

  const ambientIdle =
    motionOn && animationPace === "ambient" && effectiveState === "idle";

  // State-driven fluid morph parameters (border-radius deformation sets)
  const morphVariants: Variants = {
    idle: {
      borderRadius: ambientIdle
        ? [
            "58% 42% 32% 68% / 58% 32% 68% 42%",
            "42% 58% 62% 38% / 52% 58% 32% 58%",
            "58% 42% 58% 42% / 68% 32% 52% 58%",
            "58% 42% 32% 68% / 58% 32% 68% 42%",
          ]
        : [
            "60% 40% 30% 70% / 60% 30% 70% 40%",
            "30% 60% 70% 40% / 50% 60% 30% 60%",
            "60% 40% 60% 40% / 70% 30% 50% 60%",
            "60% 40% 30% 70% / 60% 30% 70% 40%",
          ],
      scale: ambientIdle ? [1, 1.02, 0.99, 1] : [1, 1.05, 0.98, 1],
      rotate: ambientIdle ? [0, 45, 90, 135, 180] : [0, 90, 180, 360],
      transition: {
        repeat: Infinity,
        duration: ambientIdle ? 32 : 9,
        ease: "easeInOut",
      },
    },
    "user-typing": {
      borderRadius: [
        "45% 55% 65% 35% / 40% 60% 40% 60%",
        "55% 45% 35% 65% / 60% 40% 60% 40%",
        "40% 60% 50% 50% / 50% 50% 60% 40%",
        "45% 55% 65% 35% / 40% 60% 40% 60%",
      ],
      scale: [0.97, 1.04, 0.99, 0.97],
      rotate: [0, 120, 240, 360],
      transition: {
        repeat: Infinity,
        duration: 3.8,
        ease: "easeInOut",
      },
    },
    thinking: {
      borderRadius: [
        "70% 30% 50% 50% / 30% 60% 40% 70%",
        "20% 80% 30% 70% / 70% 30% 70% 30%",
        "50% 50% 80% 20% / 40% 70% 30% 60%",
        "30% 70% 40% 60% / 60% 40% 60% 40%",
        "70% 30% 50% 50% / 30% 60% 40% 70%",
      ],
      scale: [1, 1.18, 0.92, 1.12, 1],
      rotate: [0, 180, 360],
      transition: {
        repeat: Infinity,
        duration: 2.2,
        ease: "easeInOut",
      },
    },
    "assistant-typing": {
      borderRadius: [
        "50% 50% 40% 60% / 60% 40% 50% 50%",
        "45% 55% 60% 40% / 50% 60% 40% 50%",
        "55% 45% 50% 50% / 40% 50% 60% 50%",
        "50% 50% 40% 60% / 60% 40% 50% 50%",
      ],
      scale: [1, 1.08, 0.96, 1.05, 1],
      rotate: [0, 90, 270, 360],
      transition: {
        repeat: Infinity,
        duration: 2.6,
        ease: "easeInOut",
      },
    },
    "guiding-pointing": {
      borderRadius: [
        "75% 25% 40% 60% / 35% 65% 35% 65%",
        "80% 20% 50% 50% / 40% 60% 40% 60%",
        "75% 25% 40% 60% / 35% 65% 35% 65%",
      ],
      scale: [1.02, 1.12, 1.02],
      rotate: [-12, -22, -12],
      transition: {
        repeat: Infinity,
        duration: 2.4,
        ease: "easeInOut",
      },
    },
    "guiding-scanning": {
      borderRadius: [
        "35% 65% 60% 40% / 55% 45% 55% 45%",
        "65% 35% 40% 60% / 45% 55% 45% 55%",
        "35% 65% 60% 40% / 55% 45% 55% 45%",
      ],
      scale: [0.95, 1.14, 0.95],
      rotate: [0, 180, 360],
      transition: {
        repeat: Infinity,
        duration: 3.2,
        ease: "linear",
      },
    },
    finished: {
      borderRadius: [
        "50% 50% 50% 50% / 50% 50% 50% 50%",
        "42% 58% 55% 45% / 55% 45% 58% 42%",
        "50% 50% 50% 50% / 50% 50% 50% 50%",
      ],
      scale: [1, 1.08, 1],
      rotate: [0, 8, -4, 0],
      transition: {
        repeat: Infinity,
        duration: 3,
        ease: "easeInOut",
      },
    },
  };

  // State-reactive outer chromatic glow colors
  const glowStyle = React.useMemo(() => {
    switch (effectiveState) {
      case "user-typing":
        return "radial-gradient(circle, rgba(14,165,233,0.55) 0%, rgba(99,102,241,0.35) 50%, transparent 80%)";
      case "thinking":
        return "radial-gradient(circle, rgba(236,72,153,0.6) 0%, rgba(139,92,246,0.5) 45%, rgba(6,182,212,0.3) 75%, transparent 100%)";
      case "assistant-typing":
        return "radial-gradient(circle, rgba(99,102,241,0.65) 0%, rgba(56,189,248,0.45) 50%, transparent 80%)";
      case "guiding-pointing":
        return "radial-gradient(circle, rgba(56,189,248,0.7) 0%, rgba(99,102,241,0.4) 55%, transparent 80%)";
      case "guiding-scanning":
        return "radial-gradient(circle, rgba(168,85,247,0.65) 0%, rgba(14,165,233,0.4) 50%, transparent 85%)";
      case "finished":
        return "radial-gradient(circle, rgba(16,185,129,0.7) 0%, rgba(52,211,153,0.3) 60%, transparent 85%)";
      default:
        return "radial-gradient(circle, rgba(99,102,241,0.45) 0%, rgba(168,85,247,0.35) 45%, rgba(56,189,248,0.18) 75%, transparent 100%)";
    }
  }, [effectiveState]);

  return (
    <div
      className={`relative select-none items-center justify-center flex ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Outer ambient radiant energy */}
      <motion.div
        className={`pointer-events-none absolute opacity-70 blur-2xl ${
          compact ? "inset-0" : "inset-[-25%]"
        }`}
        style={{ background: glowStyle }}
        animate={
          motionOn
            ? effectiveState === "thinking"
              ? { scale: [1, 1.35, 0.95, 1.25, 1], opacity: [0.65, 0.95, 0.6] }
              : effectiveState === "user-typing"
                ? { scale: [0.98, 1.15, 0.98], opacity: [0.55, 0.8, 0.55] }
                : ambientIdle
                  ? { scale: [1, 1.04, 0.98, 1], opacity: [0.4, 0.52, 0.4] }
                  : { scale: [1, 1.08, 0.96, 1], opacity: [0.45, 0.65, 0.45] }
            : undefined
        }
        transition={{
          repeat: motionOn ? Infinity : 0,
          duration:
            effectiveState === "thinking"
              ? 1.8
              : ambientIdle
                ? 14
                : 4.5,
          ease: "easeInOut",
        }}
      />

      {/* The Liquid Asymmetric Deforming Glass Capsule */}
      <motion.div
        className="relative size-full overflow-hidden border border-white/50 bg-slate-950/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.4),inset_0_2px_10px_rgba(255,255,255,0.45)] backdrop-blur-xl"
        variants={morphVariants}
        animate={motionOn ? effectiveState : false}
        initial={false}
        style={
          motionOn
            ? undefined
            : {
                borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%",
              }
        }
      >
        {/* Layer 1: Swirling primary iridescent fluid */}
        <motion.div
          className="absolute -inset-1/2 opacity-85"
          style={{
            background:
              effectiveState === "thinking"
                ? "conic-gradient(from 0deg at 50% 50%, #ec4899, #8b5cf6, #06b6d4, #f59e0b, #ec4899)"
                : effectiveState === "user-typing"
                  ? "conic-gradient(from 0deg at 50% 50%, #06b6d4, #3b82f6, #6366f1, #06b6d4)"
                  : effectiveState === "guiding-pointing"
                    ? "conic-gradient(from 0deg at 50% 50%, #38bdf8, #818cf8, #c084fc, #38bdf8)"
                    : effectiveState === "finished"
                    ? "conic-gradient(from 0deg at 50% 50%, #10b981, #059669, #34d399, #06b6d4, #10b981)"
                    : "conic-gradient(from 0deg at 50% 50%, #4f46e5, #06b6d4, #a855f7, #ec4899, #3b82f6, #4f46e5)",
            filter: "blur(12px)",
          }}
          animate={motionOn ? { rotate: [0, 360] } : undefined}
          transition={{
            repeat: motionOn ? Infinity : 0,
            duration:
              effectiveState === "thinking"
                ? 2
                : effectiveState === "user-typing"
                  ? 3.5
                  : ambientIdle
                    ? 28
                    : 7,
            ease: "linear",
          }}
        />

        {/* Layer 2: Counter-drifting sub-surface nucleus */}
        <motion.div
          className="absolute -inset-1/3 opacity-75 mix-blend-screen"
          style={{
            background:
              "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.95) 0%, rgba(147,197,253,0.7) 30%, rgba(216,180,254,0.4) 65%, transparent 85%)",
            filter: "blur(6px)",
          }}
          animate={
            motionOn
              ? {
                  rotate: [360, 0],
                  x: ["-8%", "8%", "-6%", "-8%"],
                  y: ["6%", "-8%", "6%", "6%"],
                }
              : undefined
          }
          transition={{
            repeat: motionOn ? Infinity : 0,
            duration: effectiveState === "thinking" ? 2.5 : ambientIdle ? 22 : 6,
            ease: "easeInOut",
          }}
        />

        {/* Layer 3: High-energy synaptic reaction core */}
        <motion.div
          className="absolute inset-[18%] rounded-full bg-gradient-to-tr from-white/95 via-sky-200/80 to-purple-200/40 mix-blend-overlay blur-[2px]"
          animate={
            motionOn
              ? effectiveState === "thinking"
                ? { scale: [0.8, 1.4, 0.7, 1.3, 0.8], opacity: [0.8, 1, 0.7, 1] }
                : effectiveState === "assistant-typing"
                  ? { scale: [0.9, 1.18, 0.88, 1.1, 0.9], opacity: [0.75, 1, 0.75] }
                  : { scale: [0.92, 1.08, 0.92], opacity: [0.7, 0.9, 0.7] }
              : undefined
          }
          transition={{
            repeat: motionOn ? Infinity : 0,
            duration: effectiveState === "thinking" ? 1.4 : ambientIdle ? 10 : 3,
            ease: "easeInOut",
          }}
        />

        {/* Specular glass reflection crests */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/55 via-transparent to-black/35" />
        <div className="pointer-events-none absolute left-[10%] top-[8%] h-[35%] w-[55%] rounded-full bg-gradient-to-b from-white/75 to-transparent blur-[1px] transform -rotate-12" />
      </motion.div>

      {/* Orbiting nano photon tracer */}
      {motionOn && !compact && (
        <motion.div
          className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible"
          animate={{ rotate: [0, 360] }}
          transition={{
            repeat: Infinity,
            duration:
              effectiveState === "thinking"
                ? 1.5
                : effectiveState === "user-typing"
                  ? 3
                  : ambientIdle
                    ? 20
                    : 6,
            ease: "linear",
          }}
        >
          <div
            className={`size-1.5 -translate-y-[calc(50%+2px)] rounded-full ${
              effectiveState === "thinking"
                ? "bg-pink-400 shadow-[0_0_10px_#f472b6,0_0_15px_#fff]"
                : effectiveState === "user-typing"
                  ? "bg-sky-400 shadow-[0_0_10px_#38bdf8,0_0_15px_#fff]"
                  : effectiveState === "finished"
                    ? "bg-emerald-300 shadow-[0_0_10px_#34d399,0_0_15px_#fff]"
                    : "bg-cyan-300 shadow-[0_0_8px_#38bdf8,0_0_12px_#fff]"
            }`}
          />
        </motion.div>
      )}
    </div>
  );
};
