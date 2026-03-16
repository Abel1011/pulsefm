"use client";

import { useRadio } from "./RadioProvider";
import { useMemo } from "react";

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function AmbientGlow() {
  const { state } = useRadio();
  const color = state.currentStation.color;

  const styles = useMemo(
    () => ({
      primary: { backgroundColor: hexToRgba(color, 0.04) },
      secondary: { backgroundColor: hexToRgba(color, 0.02), animationDelay: "-2s" as const },
    }),
    [color],
  );

  return (
    <div className="pointer-events-none fixed inset-0">
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-150 rounded-full blur-[150px] animate-pulse-glow"
        style={styles.primary}
      />
      <div
        className="absolute top-1/3 left-2/3 w-75 h-75 rounded-full blur-[100px] animate-pulse-glow"
        style={styles.secondary}
      />
    </div>
  );
}
