"use client";

import { useRadio } from "./RadioProvider";
import type { ConfidenceLevel } from "@/types/radio";

const dot: Record<ConfidenceLevel, string> = {
  confirmed: "bg-live",
  developing: "bg-breaking",
  rumor: "bg-on-air",
};

export default function UpNext() {
  const { state } = useRadio();
  const queue = state.newsQueue.filter((n) => !n.isBreaking).slice(0, 3);

  if (queue.length === 0) return null;

  return (
    <div className="space-y-3">
      <span className="font-heading text-[10px] font-bold tracking-widest uppercase text-text-dim">
        Up next
      </span>
      <ul className="space-y-2.5">
        {queue.map((item) => (
          <li key={item.id} className="flex items-start gap-2">
            <span className={`mt-1.5 w-1 h-1 rounded-full shrink-0 ${dot[item.confidence]}`} />
            <span className="font-body text-xs text-text-muted leading-snug line-clamp-2">
              {item.headline}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
