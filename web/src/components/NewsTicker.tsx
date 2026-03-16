"use client";

import { useRadio } from "./RadioProvider";
import { Zap } from "lucide-react";

export default function NewsTicker() {
  const { state } = useRadio();
  const items = state.newsQueue;

  if (items.length === 0) return null;

  const hasBreaking = items.some((n) => n.isBreaking);
  const doubled = [...items, ...items];

  return (
    <div className="relative overflow-hidden border-t border-border bg-base/80 backdrop-blur-sm">
      {/* Breaking label */}
      {hasBreaking && (
        <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center gap-1.5 bg-on-air px-4">
          <Zap className="w-3 h-3 text-white" fill="currentColor" />
          <span className="font-heading text-[10px] font-bold tracking-widest uppercase text-white">
            Breaking
          </span>
        </div>
      )}

      <div
        className="animate-ticker flex whitespace-nowrap py-3"
        style={{ paddingLeft: hasBreaking ? "120px" : "0" }}
      >
        {doubled.map((item, i) => (
          <span key={`${item.id}-${i}`} className="inline-flex items-center gap-3 mx-8">
            {item.isBreaking && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-on-air animate-pulse-live" />
            )}
            <span className={`font-body text-sm ${item.isBreaking ? "font-semibold text-text" : "text-text-muted"}`}>
              {item.headline}
            </span>
            <span className="text-[11px] text-text-dim font-body">
              {item.sourceLabel}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
