"use client";

import { useRadio } from "./RadioProvider";
import type { SourceType } from "@/types/radio";
import { Rss, MessageCircle } from "lucide-react";

const sourceIcons: Record<SourceType, React.ReactNode> = {
  twitter: <span className="font-heading text-[10px] font-bold">X</span>,
  rss: <Rss className="w-3 h-3" />,
  reddit: <MessageCircle className="w-3 h-3" />,
};

export default function SourceBar() {
  const { state } = useRadio();

  return (
    <div className="flex items-center gap-4">
      {state.sources.map((src) => (
        <div key={src.type} className="flex items-center gap-2 text-text-dim">
          <span className={`w-1 h-1 rounded-full ${src.active ? "bg-live" : "bg-text-dim"}`} />
          <span className="text-text-muted">{sourceIcons[src.type]}</span>
          <span className="font-body text-[11px]">{src.label}</span>
        </div>
      ))}
    </div>
  );
}
