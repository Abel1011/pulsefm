"use client";

import { useRadio } from "./RadioProvider";
import { useMedia } from "./MediaProvider";
import AudioWaveform from "./AudioWaveform";
import {
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Maximize2,
  Minimize2,
  Headphones,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function LiveCallPanel() {
  const { state, service } = useRadio();
  const {
    stream,
    muted,
    camOff,
    expanded,
    toggleMute,
    toggleCamera,
    toggleExpanded,
  } = useMedia();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  // Elapsed timer
  useEffect(() => {
    if (state.callerStatus !== "live") return;
    startRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [state.callerStatus]);

  // Attach stream to video element (re-attach on mode switch)
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, expanded]);

  if (state.callerStatus !== "live") return null;

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`;
  const isVideo = state.callerMode === "video";
  const isScreener = state.callRouting === "screener";
  const badgeLabel = isScreener ? "Screener" : "On Air";
  const badgeColor = isScreener ? "text-amber-400" : "text-on-air";
  const badgeBg = isScreener ? "bg-amber-400/15" : "bg-on-air/15";
  const badgeDot = isScreener ? "bg-amber-400" : "bg-on-air";

  // ── Expanded split-screen panel ──
  if (expanded) {
    return (
      <div className="fixed right-0 top-14 bottom-[42px] w-full lg:w-[min(440px,45vw)] z-30 flex flex-col animate-slide-in-right">
        {/* Background */}
        <div className="absolute inset-0 bg-base/95 backdrop-blur-2xl border-l border-white/6" />

        <div className="relative z-10 flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/6">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleExpanded}
                className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-text-muted hover:text-text hover:bg-white/10 transition-all"
                aria-label="Minimize"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${badgeBg}`}>
                  <span className="relative flex h-1.5 w-1.5">
                    <span className={`absolute inline-flex h-full w-full rounded-full ${badgeDot} animate-pulse-live`} />
                    <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${badgeDot}`} />
                  </span>
                  <span className={`font-heading text-[9px] font-bold tracking-wider uppercase ${badgeColor}`}>
                    {badgeLabel}
                  </span>
                </div>
                <span className="font-body text-xs text-text-muted tabular-nums">
                  {timeStr}
                </span>
              </div>
            </div>
          </div>

          {/* Main area */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6 overflow-auto">
            {/* Large video / avatar */}
            <div className="relative w-full max-w-xs aspect-square rounded-2xl overflow-hidden bg-surface flex items-center justify-center">
              {isVideo && !camOff && stream ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-surface-light/60 to-surface">
                  <span className="font-heading text-5xl font-bold text-text/15">
                    {state.callerName.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}

              {/* Camera off overlay */}
              {isVideo && camOff && (
                <div className="absolute inset-0 flex items-center justify-center bg-surface/80">
                  <VideoOff className="w-8 h-8 text-text-dim" />
                </div>
              )}
            </div>

            {/* Audio waveform */}
            <div className="w-full max-w-xs h-12">
              <AudioWaveform barCount={32} className="w-full h-full" />
            </div>

            {/* Caller info */}
            <div className="text-center">
              <h3 className="font-heading text-xl font-bold tracking-tight">
                {state.callerName}
              </h3>
              <p className="font-body text-sm text-text-muted mt-1">
                {isScreener ? "Talking to the station operator" : `On air with ${state.currentStation.name}`}
              </p>
            </div>
          </div>

          {/* Controls footer */}
          <div className="flex items-center justify-center gap-4 px-6 py-5 border-t border-white/6">
            <button
              onClick={toggleMute}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                muted
                  ? "bg-on-air/15 text-on-air"
                  : "bg-white/5 text-text-muted hover:text-text hover:bg-white/10"
              }`}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? (
                <MicOff className="w-5 h-5" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </button>

            {isVideo && (
              <button
                onClick={toggleCamera}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                  camOff
                    ? "bg-on-air/15 text-on-air"
                    : "bg-white/5 text-text-muted hover:text-text hover:bg-white/10"
                }`}
                aria-label={camOff ? "Turn camera on" : "Turn camera off"}
              >
                {camOff ? (
                  <VideoOff className="w-5 h-5" />
                ) : (
                  <Video className="w-5 h-5" />
                )}
              </button>
            )}

            <button
              onClick={() => service.endCall()}
              className="w-14 h-14 rounded-full bg-on-air flex items-center justify-center text-white transition-all hover:brightness-110 active:scale-90"
              aria-label="Hang up"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Compact floating bar ──
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-fade-in-up">
      <div className="glass-strong rounded-2xl p-3 flex items-center gap-3 shadow-2xl">
        {/* Camera / Avatar preview */}
        <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-white/5 flex items-center justify-center flex-shrink-0">
          {isVideo && !camOff && stream ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
              <span className="font-heading text-sm font-bold text-text-muted">
                {state.callerName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          {/* Live indicator */}
          <div className={`absolute top-1 left-1 flex items-center gap-1 px-1.5 py-0.5 rounded ${isScreener ? 'bg-amber-500/80' : 'bg-on-air/80'}`}>
            <span className="relative flex h-1 w-1">
              <span className="absolute inline-flex h-full w-full rounded-full bg-white animate-pulse-live" />
              <span className="relative inline-flex h-1 w-1 rounded-full bg-white" />
            </span>
            <span className="font-heading text-[7px] font-bold tracking-wider uppercase text-white">
              {isScreener ? 'Call' : 'Live'}
            </span>
          </div>
        </div>

        {/* Small waveform */}
        <div className="w-14 h-8 flex-shrink-0">
          <AudioWaveform barCount={10} className="w-full h-full" />
        </div>

        {/* Info */}
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="font-heading text-xs font-bold tracking-wide truncate">
            {state.callerName}
          </span>
          <span className="font-body text-[11px] text-text-muted tabular-nums">
            {timeStr} · {isScreener ? 'Screener' : 'On air'}
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5 ml-2">
          <button
            onClick={toggleMute}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
              muted
                ? "bg-on-air/15 text-on-air"
                : "bg-white/5 text-text-muted hover:text-text hover:bg-white/10"
            }`}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? (
              <MicOff className="w-3.5 h-3.5" strokeWidth={2} />
            ) : (
              <Mic className="w-3.5 h-3.5" strokeWidth={2} />
            )}
          </button>

          {isVideo && (
            <button
              onClick={toggleCamera}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                camOff
                  ? "bg-on-air/15 text-on-air"
                  : "bg-white/5 text-text-muted hover:text-text hover:bg-white/10"
              }`}
              aria-label={camOff ? "Turn camera on" : "Turn camera off"}
            >
              {camOff ? (
                <VideoOff className="w-3.5 h-3.5" strokeWidth={2} />
              ) : (
                <Video className="w-3.5 h-3.5" strokeWidth={2} />
              )}
            </button>
          )}

          <button
            onClick={() => service.endCall()}
            className="w-9 h-9 rounded-full bg-on-air flex items-center justify-center text-white transition-all hover:brightness-110 active:scale-90"
            aria-label="Hang up"
          >
            <PhoneOff className="w-3.5 h-3.5" strokeWidth={2} />
          </button>

          {/* Separator + Expand */}
          <div className="w-px h-5 bg-white/10 mx-0.5" />
          <button
            onClick={toggleExpanded}
            className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-text-muted hover:text-text hover:bg-white/10 transition-all"
            aria-label="Expand"
          >
            <Maximize2 className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
