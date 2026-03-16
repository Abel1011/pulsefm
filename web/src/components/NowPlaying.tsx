"use client";

import { useRadio } from "./RadioProvider";
import type { ConfidenceLevel } from "@/types/radio";

const confidenceConfig: Record<ConfidenceLevel, { label: string; className: string }> = {
  confirmed: { label: "Confirmed", className: "bg-live-dim text-live" },
  developing: { label: "Developing", className: "bg-breaking-dim text-breaking" },
  rumor: { label: "Rumor", className: "bg-on-air-dim text-on-air" },
};

function elapsed(ms: number): string {
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export default function NowPlaying() {
  const { state } = useRadio();
  const seg = state.currentSegment;
  const station = state.currentStation;

  if (!seg) {
    return (
      <div className="text-center max-w-lg mx-auto space-y-4 animate-fade-in-up">
        {state.isLive ? (
          <>
            <span className="font-accent text-sm text-text-muted italic">Now on air</span>
            <h2 className="font-heading text-xl sm:text-2xl md:text-3xl font-bold tracking-tight leading-tight">
              {station.name}
            </h2>
            <p className="font-body text-sm text-text-muted leading-relaxed">
              {station.tagline}
            </p>
          </>
        ) : (
          <>
            <span className="font-accent text-sm text-text-dim italic">Off air</span>
            <h2 className="font-heading text-xl sm:text-2xl md:text-3xl font-bold tracking-tight leading-tight text-text-muted">
              {station.name}
            </h2>
            <p className="font-body text-sm text-text-dim leading-relaxed">
              The station is currently offline. Stay tuned — we&apos;ll be back soon.
            </p>
          </>
        )}
      </div>
    );
  }

  const conf = confidenceConfig[seg.confidence];

  return (
    <div className="text-center max-w-lg mx-auto space-y-4 animate-fade-in-up">
      {/* Label */}
      <span className="font-accent text-sm text-text-muted italic">Now on air</span>

      {/* Title */}
      <h2 className="font-heading text-xl sm:text-2xl md:text-3xl font-bold tracking-tight leading-tight">
        {seg.title}
      </h2>

      {/* Topic */}
      <p className="font-body text-sm text-text-muted leading-relaxed">
        {seg.topic}
      </p>

      {/* Meta */}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold font-body ${conf.className}`}>
          {conf.label}
        </span>
        {seg.sources.map((s, i) => (
          <span key={i} className="text-xs text-text-dim font-body">
            {i > 0 && "·"} {s.label}
          </span>
        ))}
        <span className="text-xs text-text-dim">· {elapsed(seg.startedAt)}</span>
      </div>
    </div>
  );
}
