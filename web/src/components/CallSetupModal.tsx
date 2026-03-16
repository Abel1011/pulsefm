"use client";

import { useState } from "react";
import { Mic, Video, X, Phone } from "lucide-react";
import type { CallMode } from "@/types/radio";

interface Props {
  onStart: (name: string, mode: CallMode) => void;
  onClose: () => void;
}

export default function CallSetupModal({ onStart, onClose }: Props) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<CallMode>("audio");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onStart(trimmed, mode);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-base/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm glass-strong rounded-2xl p-6 animate-fade-in-up">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-dim hover:text-text transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-full bg-on-air/10 flex items-center justify-center mx-auto mb-3">
            <Phone className="w-5 h-5 text-on-air" />
          </div>
          <h3 className="font-heading text-lg font-bold tracking-tight">
            Join the conversation
          </h3>
          <p className="font-body text-sm text-text-muted mt-1">
            Call in live and talk to Pulse on air.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name input */}
          <div>
            <label
              htmlFor="caller-name"
              className="block font-heading text-[11px] font-bold tracking-wider uppercase text-text-muted mb-2"
            >
              Your name
            </label>
            <input
              id="caller-name"
              type="text"
              maxLength={30}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="How should Pulse call you?"
              autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 font-body text-sm text-text placeholder:text-text-dim outline-none focus:border-on-air/40 focus:ring-1 focus:ring-on-air/20 transition-all"
            />
          </div>

          {/* Mode selector */}
          <div>
            <label className="block font-heading text-[11px] font-bold tracking-wider uppercase text-text-muted mb-2">
              Call type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("audio")}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all duration-200 ${
                  mode === "audio"
                    ? "bg-on-air/10 border-on-air/30 text-on-air"
                    : "bg-white/3 border-white/8 text-text-muted hover:border-white/15"
                }`}
              >
                <Mic className="w-4 h-4" strokeWidth={1.5} />
                <span className="font-heading text-xs font-bold tracking-wide">
                  Audio
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMode("video")}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all duration-200 ${
                  mode === "video"
                    ? "bg-on-air/10 border-on-air/30 text-on-air"
                    : "bg-white/3 border-white/8 text-text-muted hover:border-white/15"
                }`}
              >
                <Video className="w-4 h-4" strokeWidth={1.5} />
                <span className="font-heading text-xs font-bold tracking-wide">
                  Video
                </span>
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-on-air text-white font-heading text-xs font-bold tracking-wider uppercase transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Phone className="w-3.5 h-3.5" strokeWidth={2} />
            Go live
          </button>
        </form>
      </div>
    </div>
  );
}
