"use client";

import { useRadio } from "./RadioProvider";
import { Play, Pause, Volume2, Volume1, VolumeX, Loader2 } from "lucide-react";
import { useRef, useCallback, useEffect, useState } from "react";

export default function PlayButton() {
  const { state, service } = useRadio();

  return (
    <button
      onClick={() => service.togglePlay()}
      className="w-16 h-16 sm:w-20 sm:h-20 rounded-full glass-strong flex items-center justify-center text-text/80 hover:text-on-air transition-all duration-300 hover:scale-105 active:scale-95"
      aria-label={state.isBuffering ? "Buffering" : state.isPlaying ? "Pause" : "Play"}
    >
      {state.isBuffering ? (
        <Loader2 className="w-6 h-6 sm:w-7 sm:h-7 animate-spin text-on-air" strokeWidth={1.5} />
      ) : state.isPlaying ? (
        <Pause className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={1.5} />
      ) : (
        <Play className="w-6 h-6 sm:w-7 sm:h-7 ml-1" strokeWidth={1.5} />
      )}
    </button>
  );
}

const NUM_BARS = 12;

export function VolumeControl() {
  const { state, service } = useRadio();
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [hovering, setHovering] = useState(false);

  const color = state.currentStation.color;
  const vol = state.volume;

  const VolumeIcon = vol === 0 ? VolumeX : vol < 0.5 ? Volume1 : Volume2;

  const setVolumeFromEvent = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      service.setVolume(ratio);
    },
    [service],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      draggingRef.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setVolumeFromEvent(e.clientX);
    },
    [setVolumeFromEvent],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      setVolumeFromEvent(e.clientX);
    },
    [setVolumeFromEvent],
  );

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  // Keyboard support
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        e.preventDefault();
        service.setVolume(Math.min(1, vol + 0.05));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        e.preventDefault();
        service.setVolume(Math.max(0, vol - 0.05));
      }
    },
    [service, vol],
  );

  // Active bars count
  const activeBars = Math.round(vol * NUM_BARS);

  return (
    <div
      className="flex items-center gap-2"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Mute toggle */}
      <button
        onClick={() => service.setVolume(vol > 0 ? 0 : 0.75)}
        className="text-text-muted hover:text-text transition-colors flex-shrink-0 flex items-center"
        aria-label={vol === 0 ? "Unmute" : "Mute"}
      >
        <VolumeIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
      </button>

      {/* Custom bar-graph volume slider */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(vol * 100)}
        className="relative flex items-center gap-[2px] h-4 cursor-pointer select-none outline-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {Array.from({ length: NUM_BARS }, (_, i) => {
          const isActive = i < activeBars;
          const heightPx = 4 + (i / (NUM_BARS - 1)) * 12;

          return (
            <div
              key={i}
              className="w-[3px] rounded-full transition-all duration-150"
              style={{
                height: `${heightPx}px`,
                backgroundColor: isActive ? color : "rgba(255,255,255,0.1)",
                boxShadow: isActive ? `0 0 ${3 + i * 0.5}px ${color}50` : "none",
                opacity: isActive ? 0.8 + (i / NUM_BARS) * 0.2 : 0.4,
              }}
            />
          );
        })}
      </div>

      {/* Volume percentage — visible on hover */}
      <span
        className="text-[9px] font-body tabular-nums w-5 text-right transition-opacity duration-200"
        style={{
          color: color,
          opacity: hovering || draggingRef.current ? 1 : 0,
        }}
      >
        {Math.round(vol * 100)}
      </span>
    </div>
  );
}
