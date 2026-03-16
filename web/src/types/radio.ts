export type ConfidenceLevel = "confirmed" | "developing" | "rumor";

export type SourceType = "rss" | "reddit";

export type CallerStatus = "idle" | "connecting" | "live" | "ended";

export type CallMode = "audio" | "video";

export type CallRouting = "none" | "live" | "screener";

export interface Station {
  id: string;
  name: string;
  tagline: string;
  niche: string;
  color: string;
  listeners: number;
  isLive: boolean;
  isDefault?: boolean;
}

export interface NewsItem {
  id: string;
  headline: string;
  source: SourceType;
  sourceLabel: string;
  confidence: ConfidenceLevel;
  isBreaking: boolean;
  timestamp: number;
}

export interface ShowSegment {
  id: string;
  title: string;
  topic: string;
  sources: { label: string; type: SourceType }[];
  confidence: ConfidenceLevel;
  startedAt: number;
}

export interface SourceStatus {
  type: SourceType;
  label: string;
  active: boolean;
  lastUpdate: number;
  itemCount: number;
}

export interface RadioState {
  isLive: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  volume: number;
  currentSegment: ShowSegment | null;
  newsQueue: NewsItem[];
  sources: SourceStatus[];
  callerStatus: CallerStatus;
  callerName: string;
  callerMode: CallMode;
  callRouting: CallRouting;
  currentStation: Station;
  callsOpen: boolean;
  newsImage: { url: string; headline: string; imageUrls?: string[] } | null;
}
