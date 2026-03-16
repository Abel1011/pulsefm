"use client";

import { useState } from "react";
import { useRadio } from "./RadioProvider";
import { Phone, PhoneOff } from "lucide-react";
import CallSetupModal from "./CallSetupModal";
import type { CallMode } from "@/types/radio";

export default function CallInButton() {
  const { state, service } = useRadio();
  const [showSetup, setShowSetup] = useState(false);

  const isInCall = state.callerStatus === "connecting" || state.callerStatus === "live";
  const visible = state.isLive && (isInCall || state.callerStatus === "idle");

  function handleCallStart(name: string, mode: CallMode) {
    setShowSetup(false);
    service.startCall(name, mode);
  }

  return (
    <>
      {visible && (
        isInCall ? (
          <button
            onClick={() => service.endCall()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-on-air text-white font-heading text-[11px] font-bold tracking-wider uppercase transition-all duration-300 active:scale-95 hover:brightness-110"
          >
            <PhoneOff className="w-3.5 h-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">Hang up</span>
          </button>
        ) : (
          <button
            onClick={() => setShowSetup(true)}
            disabled={state.callerStatus === "ended"}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-text-muted hover:text-text hover:border-text-muted font-heading text-[11px] font-bold tracking-wider uppercase transition-all duration-300 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Phone className="w-3.5 h-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">Call in</span>
          </button>
        )
      )}

      {/* Modal rendered outside the callsOpen guard so it survives state changes */}
      {showSetup && (
        <CallSetupModal
          onStart={handleCallStart}
          onClose={() => setShowSetup(false)}
        />
      )}
    </>
  );
}
