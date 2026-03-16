import type { NewsStore } from './news-store.js'
import type { StationStore } from './station-store.js'
import type { RssScanner } from './agents/rss-scanner.js'
import type { RedditScout } from './agents/reddit-scout.js'
import type { TrendingScout } from './agents/trending-scout.js'
import type { NewsDataScanner } from './agents/newsdata-scanner.js'
import type { EditorAgent } from './agents/editor-agent.js'
import type { ArticleEnricher } from './agents/article-enricher.js'
import type { NewsDedup } from './news-dedup.js'
import type { RssSourceConfig, RedditSourceConfig, GeminiSearchConfig, NewsDataConfig } from '../types/station.js'
import type { EditorialBrief } from '../types/news.js'

export interface AutoPilotDeps {
  newsStore: NewsStore
  stationStore: StationStore
  rssScanner: RssScanner
  redditScout: RedditScout
  trendingScout: TrendingScout
  newsDataScanner: NewsDataScanner
  editorAgent: EditorAgent
  articleEnricher: ArticleEnricher
  newsDedup?: NewsDedup
  onBriefsReady: (stationId: string, briefs: EditorialBrief[]) => void
}

export interface AutoPilotConfig {
  stationId: string
  scanIntervalMs: number   // how often to scan sources (default 5 min)
  processIntervalMs: number // how often to run editor agent (default 7 min)
}

const DEFAULT_CONFIG: Omit<AutoPilotConfig, 'stationId'> = {
  scanIntervalMs: 60 * 60_000,
  processIntervalMs: 65 * 60_000,
}

export class AutoPilot {
  private deps: AutoPilotDeps
  private config: AutoPilotConfig
  private scanTimer: ReturnType<typeof setInterval> | null = null
  private processTimer: ReturnType<typeof setInterval> | null = null
  private scanning = false
  private processing = false

  constructor(deps: AutoPilotDeps, config: Partial<AutoPilotConfig> & { stationId: string }) {
    this.deps = deps
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  start(): void {
    if (this.scanTimer) return
    console.log(`[auto-pilot] started for "${this.config.stationId}" — scan every ${this.config.scanIntervalMs / 1000}s, process every ${this.config.processIntervalMs / 1000}s`)

    this.scanTimer = setInterval(() => this.scan(), this.config.scanIntervalMs)
    this.processTimer = setInterval(() => this.process(), this.config.processIntervalMs)

    // Run first scan immediately, process after a short delay
    this.scan()
    setTimeout(() => this.process(), 30_000)
  }

  stop(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer)
      this.scanTimer = null
    }
    if (this.processTimer) {
      clearInterval(this.processTimer)
      this.processTimer = null
    }
    console.log('[auto-pilot] stopped')
  }

  isRunning(): boolean {
    return this.scanTimer !== null
  }

  async scan(): Promise<void> {
    if (this.scanning) return
    this.scanning = true
    const stationId = this.config.stationId

    try {
      const station = await this.deps.stationStore.getStation(stationId)
      if (!station) {
        console.warn(`[auto-pilot] station "${stationId}" not found, skipping scan`)
        return
      }

      const enabledSources = station.sources.filter((s) => s.enabled)
      const rssSources = enabledSources.filter((s) => s.type === 'rss').map((s) => s.config as RssSourceConfig)
      const redditSources = enabledSources.filter((s) => s.type === 'reddit').map((s) => s.config as RedditSourceConfig)
      const geminiSources = enabledSources.filter((s) => s.type === 'gemini-search').map((s) => s.config as GeminiSearchConfig)
      const newsDataSources = enabledSources.filter((s) => s.type === 'newsdata').map((s) => s.config as NewsDataConfig)

      const results = await Promise.allSettled([
        rssSources.length > 0 ? this.deps.rssScanner.scan(rssSources) : Promise.resolve([]),
        redditSources.length > 0 ? this.deps.redditScout.scan(redditSources) : Promise.resolve([]),
        ...geminiSources.map((cfg) => this.deps.trendingScout.scan(cfg)),
        newsDataSources.length > 0 ? this.deps.newsDataScanner.scan(newsDataSources) : Promise.resolve([]),
      ])

      const allCandidates = results
        .filter((r) => r.status === 'fulfilled')
        .flatMap((r) => r.value)

      const errors = results.filter((r) => r.status === 'rejected')
      if (errors.length > 0) {
        console.warn(`[auto-pilot] ${errors.length} scanner(s) failed`)
      }

      if (allCandidates.length > 0) {
        let toStore = allCandidates
        if (this.deps.newsDedup) {
          const dedupResult = await this.deps.newsDedup.deduplicate(stationId, allCandidates)
          toStore = dedupResult.unique
          if (dedupResult.duplicates.length > 0) {
            console.log(`[auto-pilot] dedup filtered ${dedupResult.duplicates.length} duplicates, ${dedupResult.related.length} related`)
          }
        }
        if (toStore.length > 0) {
          await this.deps.newsStore.addCandidates(stationId, toStore)
        }
      }

      console.log(`[auto-pilot] scan complete — ${allCandidates.length} candidates found`)
    } catch (err) {
      console.error('[auto-pilot] scan error:', err)
    } finally {
      this.scanning = false
    }
  }

  async process(): Promise<void> {
    if (this.processing) return
    this.processing = true
    const stationId = this.config.stationId

    try {
      const since = Date.now() - 3_600_000
      const candidates = await this.deps.newsStore.getCandidates(stationId, { since })

      if (candidates.length === 0) {
        console.log('[auto-pilot] no recent candidates to process')
        return
      }

      const briefs = await this.deps.editorAgent.process(candidates)

      if (briefs.length === 0) {
        console.log('[auto-pilot] editor produced 0 briefs')
        return
      }

      await this.deps.newsStore.addBriefs(stationId, briefs)
      console.log(`[auto-pilot] processed ${candidates.length} candidates into ${briefs.length} briefs`)

      // Notify — the callback decides whether to inject into presenter
      this.deps.onBriefsReady(stationId, briefs)

      // Background enrichment (fire-and-forget)
      this.enrichBriefs(stationId, briefs, candidates).catch((err) =>
        console.error('[auto-pilot] enrichment error:', err),
      )
    } catch (err) {
      console.error('[auto-pilot] process error:', err)
    } finally {
      this.processing = false
    }
  }

  private async enrichBriefs(
    stationId: string,
    briefs: EditorialBrief[],
    candidates: import('../types/news.js').NewsCandidate[],
  ): Promise<void> {
    let enriched = 0
    for (const brief of briefs) {
      try {
        const result = await this.deps.articleEnricher.enrichBrief(brief, candidates)
        const now = Date.now()
        result.lastUpdatedAt = now
        const log = result.activityLog ?? []
        log.push({ timestamp: now, action: 'report-ready' as const })
        if (result.sources.length > brief.sources.length || result.confidence !== brief.confidence) {
          log.push({ timestamp: now, action: 'researched' as const, detail: 'Auto-research via auto-pilot' })
        }
        result.activityLog = log
        result.needsResearch = false
        await this.deps.newsStore.updateBrief(stationId, result)
        enriched++
      } catch (err) {
        console.warn(`[auto-pilot] enrichment failed for "${brief.headline.slice(0, 40)}": ${(err as Error).message}`)
      }
    }
    console.log(`[auto-pilot] enrichment: ${enriched}/${briefs.length} briefs`)
  }
}
