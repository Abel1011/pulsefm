"use client";

import { useRadio } from "./RadioProvider";
import { useMedia } from "./MediaProvider";
import { PhoneOff, Mic, Video, Radio, AlertCircle } from "lucide-react";
import { useRef, useEffect } from "react";

function VideoPreview({ className }: { className?: string }) {
  const { stream, camOff } = useMedia();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream || camOff) return null;

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={className}
    />
  );
}

export default function ConnectingOverlay() {
  const { state, service } = useRadio();
  const { error } = useMedia();

  if (state.callerStatus !== "connecting") return null;

  const isVideo = state.callerMode === "video";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-base/85 backdrop-blur-xl" />

      <div className="relative z-10 flex flex-col items-center gap-8 p-8 animate-fade-in-up">
        {/* Media error banner */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-on-air/10 border border-on-air/20">
            <AlertCircle className="w-4 h-4 text-on-air flex-shrink-0" />
            <span className="font-body text-xs text-on-air">{error}</span>
          </div>
        )}

        {/* Visual: Presenter + Caller */}
        <div className="flex items-center gap-12">
          {/* Presenter */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-full glass-strong flex items-center justify-center">
              <Radio className="w-7 h-7 text-on-air" />
            </div>
            <span className="font-accent text-sm text-text-muted">
              {state.currentStation.name}
            </span>
          </div>

          {/* Connection dots */}
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-on-air animate-pulse-live"
                style={{ animationDelay: `${i * 0.3}s` }}
              />
            ))}
          </div>

          {/* Caller */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-full glass-strong flex items-center justify-center overflow-hidden">
              {isVideo ? (
                <>
                  <VideoPreview className="w-full h-full object-cover scale-x-[-1]" />
                  {/* Fallback icon while stream loads */}
                  <Video className="w-7 h-7 text-text-muted absolute" />
                </>
              ) : (
                <Mic className="w-7 h-7 text-text-muted" />
              )}
            </div>
            <span className="font-accent text-sm text-text-muted">
              {state.callerName || "You"}
            </span>
          </div>
        </div>

        <p className="font-heading text-lg font-bold text-on-air animate-pulse">
          Connecting to {state.currentStation.name}...
        </p>

        <button
          onClick={() => service.endCall()}
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-white/5 border border-white/10 text-text-muted font-heading text-xs font-bold tracking-wider uppercase transition-all hover:bg-white/10 active:scale-95"
        >
          <PhoneOff className="w-4 h-4" strokeWidth={2} />
          Cancel
        </button>
      </div>
    </div>
  );
}
