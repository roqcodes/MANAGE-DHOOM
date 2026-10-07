"use client";

import { useMemo } from "react";
import { motion, useTransform, type MotionValue } from "framer-motion";

const PARTICLE_COUNT = 14;

type OrbCursorParticlesProps = {
  size: number;
  /** Pointer pull in orb-local px (sprung); orb center is 0,0 */
  pullX: MotionValue<number>;
  pullY: MotionValue<number>;
};

type ParticleSpec = {
  id: number;
  trail: number;
  spread: number;
  dot: number;
  tone: string;
};

function Particle({
  spec,
  size,
  pullX,
  pullY,
  pullMag,
}: {
  spec: ParticleSpec;
  size: number;
  pullX: MotionValue<number>;
  pullY: MotionValue<number>;
  pullMag: MotionValue<number>;
}) {
  const half = spec.dot / 2;
  const x = useTransform([pullX, pullY], ([px, py]: number[]) => {
    const len = Math.hypot(px, py);
    if (len < 0.5) return size / 2 - half;
    const nx = px / len;
    const ny = py / len;
    const perpX = -ny * spec.spread;
    return size / 2 + nx * len * spec.trail + perpX - half;
  });

  const y = useTransform([pullX, pullY], ([px, py]: number[]) => {
    const len = Math.hypot(px, py);
    if (len < 0.5) return size / 2 - half;
    const nx = px / len;
    const ny = py / len;
    const perpY = nx * spec.spread;
    return size / 2 + ny * len * spec.trail + perpY - half;
  });

  const opacity = useTransform(pullMag, [0, 6, 28, 64], [0, 0.15, 0.85, 1]);
  const scale = useTransform(pullMag, [0, 20, 64], [0.2, 0.85, 1.15]);

  return (
    <motion.span
      className={`pointer-events-none absolute rounded-full ${spec.tone} shadow-[0_0_6px_rgba(125,211,252,0.9)]`}
      style={{
        width: spec.dot,
        height: spec.dot,
        left: 0,
        top: 0,
        x,
        y,
        opacity,
        scale,
      }}
      aria-hidden
    />
  );
}

/**
 * Fast streak particles that rush from the orb toward the pointer (orb stays put).
 */
export function OrbCursorParticles({ size, pullX, pullY }: OrbCursorParticlesProps) {
  const pullMag = useTransform([pullX, pullY], ([px, py]: number[]) =>
    Math.hypot(px, py),
  );

  const specs = useMemo<ParticleSpec[]>(() => {
    const tones = [
      "bg-cyan-300/95",
      "bg-sky-300/90",
      "bg-violet-300/85",
      "bg-indigo-200/90",
    ];
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const phase = (i / PARTICLE_COUNT) * Math.PI * 2;
      return {
        id: i,
        trail: 0.42 + (i % 7) * 0.085,
        spread: Math.sin(phase * 2.3) * (3 + (i % 4)),
        dot: 2 + (i % 3),
        tone: tones[i % tones.length],
      };
    });
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-visible"
      aria-hidden
    >
      {specs.map((spec) => (
        <Particle
          key={spec.id}
          spec={spec}
          size={size}
          pullX={pullX}
          pullY={pullY}
          pullMag={pullMag}
        />
      ))}
    </div>
  );
}
