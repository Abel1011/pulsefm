import type { SourceType } from './news.js'

export interface RssSourceConfig {
  feedUrl: string
  label: string
}

export interface RedditSourceConfig {
  subreddit: string
  sortBy: 'hot' | 'new' | 'rising'
  minUpvotes?: number
}

export interface GeminiSearchConfig {
  keywords: string[]
  searchIntervalMinutes: number
}

export interface NewsDataConfig {
  keywords: string[]
  language: string
  categories?: string[]
}

export type SourceConfigData = RssSourceConfig | RedditSourceConfig | GeminiSearchConfig | NewsDataConfig

export interface SourceConfig {
  id: string
  type: SourceType
  enabled: boolean
  config: SourceConfigData
}

export interface StationConfig {
  id: string
  name: string
  tagline: string
  niche: string
  color: string
  voice: string
  promptPersonality: string
  sources: SourceConfig[]
  createdAt: number
  isDefault?: boolean
}
