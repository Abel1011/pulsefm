"use client";

import { useEffect, useRef } from "react";
import { useMedia } from "./MediaProvider";

export default function AudioWaveform({
  barCount = 20,
  className = "",
}: {
  barCount?: number;
  className?: string;
}) {
  const { analyser, muted } = useMedia();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const smoothedRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    const dataArray = analyser
      ? new Uint8Array(analyser.frequencyBinCount)
      : null;

    if (!smoothedRef.current || smoothedRef.current.length !== barCount) {
      smoothedRef.current = new Float32Array(barCount);
    }
    const smoothed = smoothedRef.current;

    function tick() {
      rafRef.current = requestAnimationFrame(tick);

      const rect = canvas!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = rect.width;
      const h = rect.height;
      const pw = Math.round(w * dpr);
      const ph = Math.round(h * dpr);

      if (canvas!.width !== pw || canvas!.height !== ph) {
        canvas!.width = pw;
        canvas!.height = ph;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (analyser && dataArray && !muted) {
        analyser.getByteFrequencyData(dataArray);
      }

      const gap = 2;
      const barW = Math.max(2, (w - gap * (barCount - 1)) / barCount);
      const r = Math.min(barW / 2, 2);

      for (let i = 0; i < barCount; i++) {
        let target = 0.06;
        if (dataArray && !muted) {
          const idx = Math.floor((i / barCount) * dataArray.length);
          target = Math.max(0.06, dataArray[idx] / 255);
        }
        smoothed[i] += (target - smoothed[i]) * 0.25;

        const barH = Math.max(2, smoothed[i] * h * 0.9);
        const x = i * (barW + gap);
        const y = (h - barH) / 2;

        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, r);
        ctx.fillStyle = `rgba(229, 77, 46, ${0.3 + smoothed[i] * 0.6})`;
        ctx.fill();
      }
    }

    tick();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser, barCount, muted]);

  return <canvas ref={canvasRef} className={`block ${className}`} />;
}
