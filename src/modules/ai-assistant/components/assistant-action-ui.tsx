"use client";

import Link from "next/link";
import { motion, useReducedMotion, type Transition } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const AI_MOTION_EASE = [0.22, 1, 0.36, 1] as const;

export type AssistantActionVariant = "guide" | "open" | "nav";

type VariantTokens = {
  border: string;
  bg: string;
  text: string;
  iconWrap: string;
  glowRgb: string;
};

const VARIANT: Record<AssistantActionVariant, VariantTokens> = {
  guide: {
    border: "border-sky-400/30 hover:border-sky-400/55",
    bg:
      "bg-gradient-to-r from-sky-500/15 via-indigo-500/15 to-purple-500/15 hover:from-sky-500/24 hover:via-indigo-500/20 hover:to-purple-500/22",
    text: "text-sky-400",
    iconWrap: "bg-sky-400 text-slate-950",
    glowRgb: "56,189,248",
  },
  nav: {
    border: "border-sky-400/28 hover:border-sky-400/50",
    bg:
      "bg-gradient-to-r from-sky-500/12 via-indigo-500/12 to-purple-500/12 hover:from-sky-500/20 hover:via-indigo-500/16 hover:to-purple-500/18",
    text: "text-sky-400",
    iconWrap: "bg-sky-400 text-slate-950",
    glowRgb: "56,189,248",
  },
  open: {
    border: "border-primary/30 hover:border-primary/55",
    bg:
      "bg-gradient-to-r from-primary/14 via-rose-500/12 to-orange-500/10 hover:from-primary/22 hover:via-rose-500/18 hover:to-orange-500/14",
    text: "text-primary",
    iconWrap: "bg-primary text-primary-foreground shadow-[0_0_12px_-2px_rgba(235,32,95,0.45)]",
    glowRgb: "235,32,95",
  },
};

export type AssistantActionPulse = "intro" | "loop" | false;

function pulseTransition(
  pulse: AssistantActionPulse,
  reduceMotion: boolean | null,
): Transition {
  if (reduceMotion || !pulse) {
    return {
      opacity: { duration: 0.24, ease: AI_MOTION_EASE },
      y: { duration: 0.28, ease: AI_MOTION_EASE },
      scale: { type: "spring", stiffness: 420, damping: 28 },
    };
  }
  if (pulse === "loop") {
    return {
      scale: { repeat: Infinity, duration: 2.6, ease: "easeInOut" },
      boxShadow: { repeat: Infinity, duration: 2.6, ease: "easeInOut" },
      opacity: { duration: 0.22, ease: "easeOut" },
    };
  }
  return {
    scale: { duration: 0.72, ease: "easeInOut" },
    boxShadow: { duration: 0.72, ease: "easeInOut" },
    opacity: { duration: 0.22, ease: "easeOut" },
  };
}

function pulseAnimate(
  pulse: AssistantActionPulse,
  glowRgb: string,
  reduceMotion: boolean | null,
) {
  if (reduceMotion || !pulse) {
    return { opacity: 1, y: 0, scale: 1 };
  }
  const soft = `0 0 10px rgba(${glowRgb},0.12)`;
  const bright = `0 0 26px rgba(${glowRgb},${pulse === "intro" ? 0.38 : 0.28})`;
  return {
    opacity: 1,
    y: 0,
    scale: pulse === "intro" ? [1, 1.055, 1] : [1, 1.028, 1],
    boxShadow: [soft, bright, soft],
  };
}

const shellClass =
  "relative flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset] backdrop-blur-md transition-[border-color,background-color] disabled:pointer-events-none disabled:opacity-55";

export function AssistantActionButton({
  variant = "guide",
  label,
  subtitle,
  icon,
  onClick,
  href,
  disabled,
  loading,
  pulse = false,
  className,
  type = "button",
  layout = "row",
}: {
  variant?: AssistantActionVariant;
  label: string;
  subtitle?: string;
  icon: ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  loading?: boolean;
  pulse?: AssistantActionPulse;
  className?: string;
  type?: "button" | "submit";
  layout?: "row" | "stack";
}) {
  const reduceMotion = useReducedMotion();
  const v = VARIANT[variant];
  const isStack = layout === "stack" && Boolean(subtitle);

  const content = (
    <>
      <span
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-105",
          v.iconWrap,
        )}
      >
        {loading ? (
          <Loader2 size={11} className="animate-spin" aria-hidden />
        ) : (
          icon
        )}
      </span>
      <span className={cn("min-w-0 flex-1 text-left", isStack && "flex flex-col gap-0.5")}>
        <span className={cn("truncate leading-none", v.text)}>{label}</span>
        {subtitle ? (
          <span className="text-[10px] font-normal leading-snug text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
    </>
  );

  const classes = cn(
    shellClass,
    "group mt-2.5 w-full",
    isStack && "items-start py-2",
    v.border,
    v.bg,
    className,
  );

  const motionProps = {
    initial: { opacity: 0, y: 6, scale: 0.96 },
    animate: pulseAnimate(pulse, v.glowRgb, reduceMotion),
    whileHover: reduceMotion ? undefined : { scale: 1.02, y: -0.5 },
    whileTap: reduceMotion ? undefined : { scale: 0.97 },
    transition: pulseTransition(pulse, reduceMotion),
  };

  if (href) {
    return (
      <motion.div {...motionProps} className="w-full">
        <Link
          href={href}
          className={cn(classes, "hover:no-underline")}
          onClick={onClick}
        >
          {content}
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      {...motionProps}
      className={classes}
    >
      {content}
    </motion.button>
  );
}

export function AssistantSuggestChip({
  children,
  onClick,
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={
        reduceMotion
          ? undefined
          : {
              scale: 1.03,
              borderColor: "rgba(235,32,95,0.35)",
            }
      }
      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
      transition={{
        type: "spring",
        stiffness: 460,
        damping: 26,
      }}
      className={cn(
        "group flex items-center gap-1.5 rounded-full border border-white/15 bg-white/40 px-2.5 py-1 text-left text-[11px] text-foreground/90 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-md transition-colors hover:bg-primary/10 hover:text-primary dark:border-white/5 dark:bg-white/[0.04] disabled:opacity-45",
        className,
      )}
    >
      <span
        className="size-1 shrink-0 rounded-full bg-primary/60 transition-all duration-200 group-hover:scale-125 group-hover:bg-primary"
        aria-hidden
      />
      <span>{children}</span>
    </motion.button>
  );
}
