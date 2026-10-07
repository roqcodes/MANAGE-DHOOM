"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";

type OrbFluidPullProps = {
  size: number;
  /** 0 = retracted into orb, 1 = max reach toward cursor */
  strength: MotionValue<number>;
  angleDeg: MotionValue<number>;
};

/**
 * Gooey teardrop that extends from the orb toward the pointer and springs back on leave.
 */
export function OrbFluidPull({ size, strength, angleDeg }: OrbFluidPullProps) {
  const bodyW = useTransform(strength, [0, 1], [0, size * 0.38]);
  const bodyH = useTransform(strength, [0, 1], [0, size * 0.78]);
  const bodyX = useTransform(strength, [0, 1], [size * 0.28, size * 0.46]);
  const bodyOpacity = useTransform(strength, [0, 0.08, 1], [0, 0.35, 0.75]);

  const tipW = useTransform(strength, [0, 1], [0, size * 0.14]);
  const tipH = useTransform(strength, [0, 1], [0, size * 0.22]);
  const tipX = useTransform(strength, [0, 1], [size * 0.38, size * 0.62]);
  const tipOpacity = useTransform(strength, [0, 0.12, 1], [0, 0.5, 0.95]);

  const bridgeW = useTransform(strength, [0, 1], [0, size * 0.5]);
  const bridgeH = useTransform(strength, [0, 1], [0, size * 0.2]);
  const bridgeX = useTransform(strength, [0, 1], [size * 0.22, size * 0.34]);

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 overflow-visible"
      style={{ rotate: angleDeg }}
      aria-hidden
    >
      <motion.div
        className="absolute top-1/2 -translate-y-1/2 rounded-[42%_58%_48%_52%_/_38%_42%_58%_62%] bg-gradient-to-r from-indigo-500/55 via-violet-400/45 to-sky-300/35 blur-[7px]"
        style={{
          width: bridgeW,
          height: bridgeH,
          left: 0,
          x: bridgeX,
          opacity: bodyOpacity,
        }}
      />
      <motion.div
        className="absolute top-1/2 -translate-y-1/2 rounded-[38%_62%_55%_45%_/_32%_38%_62%_68%] bg-gradient-to-r from-violet-600/50 via-indigo-400/55 to-cyan-300/40 blur-[5px]"
        style={{
          width: bodyW,
          height: bodyH,
          left: 0,
          x: bodyX,
          opacity: bodyOpacity,
        }}
      />
      <motion.div
        className="absolute top-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-sky-200/70 to-cyan-100/50 blur-[2px]"
        style={{
          width: tipW,
          height: tipH,
          left: 0,
          x: tipX,
          opacity: tipOpacity,
        }}
      />
    </motion.div>
  );
}
