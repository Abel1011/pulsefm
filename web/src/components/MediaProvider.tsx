"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { useRadio } from "./RadioProvider";

const CAPTURE_SAMPLE_RATE = 16000; // Gemini expects 16kHz PCM

interface MediaContextValue {
  stream: MediaStream | null;
  analyser: AnalyserNode | null;
  muted: boolean;
  camOff: boolean;
  error: string | null;
  expanded: boolean;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleExpanded: () => void;
}

const MediaContext = createContext<MediaContextValue | null>(null);

function downsample(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate) return input;
  const ratio = inputRate / outputRate;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    output[i] = input[Math.floor(i * ratio)];
  }
  return output;
}

function float32ToPcm16Base64(float32: Float32Array): string {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function MediaProvider({ children }: { children: React.ReactNode }) {
  const { state, service } = useRadio();
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const inCall =
    state.callerStatus === "connecting" || state.callerStatus === "live";
  const wantsVideo = state.callerMode === "video";

  // Acquire media when call starts
  useEffect(() => {
    if (!inCall) {
      // Release tracks when call ends
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setStream(null);
      setMuted(false);
      setCamOff(false);
      setError(null);
      setExpanded(false);
      return;
    }

    let cancelled = false;

    async function acquire() {
      try {
        const constraints: MediaStreamConstraints = {
          audio: true,
          video: wantsVideo ? { facingMode: "user", width: 320, height: 240 } : false,
        };
        const ms = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          ms.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = ms;
        setStream(ms);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Permission denied — please allow microphone access."
            : "Could not access media devices.";
        setError(msg);
      }
    }

    acquire();

    return () => {
      cancelled = true;
    };
  }, [inCall, wantsVideo]);

  // Create AudioContext + AnalyserNode from stream
  useEffect(() => {
    if (!stream) {
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
      setAnalyser(null);
      return;
    }

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const node = audioCtx.createAnalyser();
    node.fftSize = 64;
    node.smoothingTimeConstant = 0.4;
    source.connect(node);
    setAnalyser(node);

    return () => {
      source.disconnect();
      audioCtx.close();
      audioCtxRef.current = null;
    };
  }, [stream]);

  // Capture mic audio and send to backend as 16kHz 16-bit PCM
  useEffect(() => {
    if (!stream || !inCall) return;

    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    const nativeRate = audioCtx.sampleRate;

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const downsampled = downsample(input, nativeRate, CAPTURE_SAMPLE_RATE);
      const base64 = float32ToPcm16Base64(downsampled);
      service.sendCallerAudio(base64);
    };

    source.connect(processor);
    processor.connect(audioCtx.destination);

    return () => {
      processor.onaudioprocess = null;
      source.disconnect();
      processor.disconnect();
      audioCtx.close();
    };
  }, [stream, inCall, service]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close();
    };
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      streamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = !next;
      });
      return next;
    });
  }, []);

  const toggleCamera = useCallback(() => {
    setCamOff((prev) => {
      const next = !prev;
      streamRef.current?.getVideoTracks().forEach((t) => {
        t.enabled = !next;
      });
      return next;
    });
  }, []);

  const toggleExpanded = useCallback(() => setExpanded((prev) => !prev), []);

  return (
    <MediaContext.Provider
      value={{ stream, analyser, muted, camOff, error, expanded, toggleMute, toggleCamera, toggleExpanded }}
    >
      {children}
    </MediaContext.Provider>
  );
}

export function useMedia(): MediaContextValue {
  const ctx = useContext(MediaContext);
  if (!ctx) throw new Error("useMedia must be used within MediaProvider");
  return ctx;
}
