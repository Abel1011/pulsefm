import { Hono } from 'hono'
import type { NewsStore } from '../lib/news-store.js'
import type { StationStore } from '../lib/station-store.js'
import type { RssSourceConfig, RedditSourceConfig, GeminiSearchConfig, NewsDataConfig } from '../types/station.js'
import type { RssScanner } from '../lib/agents/rss-scanner.js'
import type { RedditScout } from '../lib/agents/reddit-scout.js'
import type { TrendingScout } from '../lib/agents/trending-scout.js'
import type { NewsDataScanner } from '../lib/agents/newsdata-scanner.js'
import type { EditorAgent } from '../lib/agents/editor-agent.js'
import type { ResearchAgent } from '../lib/agents/research-agent.js'
import type { ArticleEnricher } from '../lib/agents/article-enricher.js'
import type { NewsDedup } from '../lib/news-dedup.js'

export interface NewsRouteDeps {
  newsStore: NewsStore
  stationStore: StationStore
  rssScanner: RssScanner
  redditScout: RedditScout
  trendingScout: TrendingScout
  newsDataScanner: NewsDataScanner
  editorAgent: EditorAgent
  researchAgent: ResearchAgent
  articleEnricher: ArticleEnricher
  newsDedup?: NewsDedup
}

export function createNewsRoutes(deps: NewsRouteDeps) {
  const api = new Hono()

  // Get candidates for a station
  api.get('/:stationId/candidates', async (c) => {
    const stationId = c.req.param('stationId')
    const since = Number(c.req.query('since')) || undefined
    const limit = Number(c.req.query('limit')) || undefined
    const candidates = await deps.newsStore.getCandidates(stationId, { since, limit })
    return c.json(candidates)
  })

  // Get briefs for a station
  api.get('/:stationId/briefs', async (c) => {
    const stationId = c.req.param('stationId')
    const pendingOnly = c.req.query('pending') === 'true'
    const briefs = await deps.newsStore.getBriefs(stationId, { pendingOnly })
    return c.json(briefs)
  })

  // Trigger a scan for a station (run all enabled scouts)
  api.post('/:stationId/scan', async (c) => {
    const stationId = c.req.param('stationId')
    const station = await deps.stationStore.getStation(stationId)
    if (!station) return c.json({ error: 'Station not found' }, 404)

    const enabledSources = station.sources.filter((s) => s.enabled)
    const rssSources = enabledSources.filter((s) => s.type === 'rss').map((s) => s.config as RssSourceConfig)
    const redditSources = enabledSources.filter((s) => s.type === 'reddit').map((s) => s.config as RedditSourceConfig)
    const geminiSources = enabledSources.filter((s) => s.type === 'gemini-search').map((s) => s.config as GeminiSearchConfig)
    const newsDataSources = enabledSources.filter((s) => s.type === 'newsdata').map((s) => s.config as NewsDataConfig)

    const results = await Promise.allSettled([
      rssSources.length > 0 ? deps.rssScanner.scan(rssSources) : Promise.resolve([]),
      redditSources.length > 0 ? deps.redditScout.scan(redditSources) : Promise.resolve([]),
      ...geminiSources.map((cfg) => deps.trendingScout.scan(cfg)),
      newsDataSources.length > 0 ? deps.newsDataScanner.scan(newsDataSources) : Promise.resolve([]),
    ])

    const allCandidates = results
      .filter((r) => r.status === 'fulfilled')
      .flatMap((r) => r.value)

    let stored = allCandidates
    let dedupStats: { duplicates: number; related: number } | undefined

    if (allCandidates.length > 0 && deps.newsDedup) {
      const dedupResult = await deps.newsDedup.deduplicate(stationId, allCandidates)
      stored = dedupResult.unique
      dedupStats = { duplicates: dedupResult.duplicates.length, related: dedupResult.related.length }
    }

    if (stored.length > 0) {
      await deps.newsStore.addCandidates(stationId, stored)
    }

    const errors = results
      .filter((r) => r.status === 'rejected')
      .map((r) => String(r.reason))

    return c.json({
      found: allCandidates.length,
      stored: stored.length,
      dedup: dedupStats,
      errors: errors.length > 0 ? errors : undefined,
    })
  })

  // Process candidates through editor agent
  api.post('/:stationId/process', async (c) => {
    const stationId = c.req.param('stationId')
    const station = await deps.stationStore.getStation(stationId)
    if (!station) return c.json({ error: 'Station not found' }, 404)

    // Get recent unprocessed candidates (last hour by default)
    const since = Number(c.req.query('since')) || (Date.now() - 3_600_000)
    const candidates = await deps.newsStore.getCandidates(stationId, { since })

    if (candidates.length === 0) {
      return c.json({ briefs: 0, message: 'No candidates to process' })
    }

    // Phase 1: classify immediately so briefs appear in UI fast
    const briefs = await deps.editorAgent.process(candidates)

    if (briefs.length > 0) {
      await deps.newsStore.addBriefs(stationId, briefs)
    }

    // Phase 2: fire-and-forget background enrichment (fetch sources + report + auto-research)
    const briefCount = briefs.length
    ;(async () => {
      try {
        let enriched = 0
        let autoResearched = 0
        for (const brief of briefs) {
          try {
            const result = await deps.articleEnricher.enrichBrief(brief, candidates)
            const now = Date.now()
            result.lastUpdatedAt = now
            const log = result.activityLog ?? []
            const detail = result.report
              ? `Report ready — ${result.report.sourcesWithContent}/${result.report.sourcesReviewed} sources with content`
              : 'Enrichment completed'
            log.push({ timestamp: now, action: 'report-ready' as const, detail })
            if (result.report?.needsFollowUp) {
              log.push({ timestamp: now, action: 'enriched' as const, detail: result.report.followUpReason ?? 'Needs follow-up' })
            }
            // Track if auto-research happened (sources/confidence changed)
            if (result.sources.length > brief.sources.length || result.confidence !== brief.confidence) {
              log.push({ timestamp: now, action: 'researched' as const, detail: 'Auto-research: sources were thin' })
              autoResearched++
            }
            result.activityLog = log
            result.needsResearch = false
            await deps.newsStore.updateBrief(stationId, result)
            enriched++
          } catch (err) {
            console.warn(`[process] enrichment failed for "${brief.headline.slice(0, 40)}": ${(err as Error).message}`)
          }
        }
        console.log(`[process] background enrichment: ${enriched}/${briefs.length} briefs, ${autoResearched} auto-researched`)
      } catch (err) {
        console.error('[process] background enrichment failed:', err)
      }
    })()

    return c.json({ briefs: briefCount, enriching: true })
  })

  // Send brief to air — marks as sent + adds log entry
  api.post('/:stationId/briefs/:briefId/send', async (c) => {
    const stationId = c.req.param('stationId')
    const briefId = c.req.param('briefId')
    const body = await c.req.json<{ method?: string }>().catch(() => ({ method: undefined }))
    const method = body.method ?? 'breaking'
    const result = await deps.newsStore.sendBrief(stationId, briefId, method)
    if (!result) return c.json({ error: 'Brief not found' }, 404)
    return c.json(result)
  })

  // Mark brief as used (backward compat)
  api.patch('/:stationId/briefs/:briefId/used', async (c) => {
    const stationId = c.req.param('stationId')
    const briefId = c.req.param('briefId')
    await deps.newsStore.markBriefUsed(stationId, briefId)
    return c.json({ status: 'ok' })
  })

  // Research a brief — use Gemini + Google Search to find more info
  api.post('/:stationId/briefs/:briefId/research', async (c) => {
    const stationId = c.req.param('stationId')
    const briefId = c.req.param('briefId')
    const briefs = await deps.newsStore.getBriefs(stationId)
    const brief = briefs.find((b) => b.id === briefId)
    if (!brief) return c.json({ error: 'Brief not found' }, 404)

    const enriched = await deps.researchAgent.research(brief)
    const now = Date.now()
    enriched.lastUpdatedAt = now
    const log = enriched.activityLog ?? []
    log.push({ timestamp: now, action: 'researched', detail: 'Deep research via Google Search' })
    enriched.activityLog = log
    await deps.newsStore.updateBrief(stationId, enriched)
    return c.json(enriched)
  })

  // Conclude a brief — marks the story as finished
  api.post('/:stationId/briefs/:briefId/conclude', async (c) => {
    const stationId = c.req.param('stationId')
    const briefId = c.req.param('briefId')
    const now = Date.now()
    const result = await deps.newsStore.addBriefLogEntry(stationId, briefId, {
      timestamp: now,
      action: 'concluded',
      detail: 'Story marked as concluded',
    })
    if (!result) return c.json({ error: 'Brief not found' }, 404)
    return c.json(result)
  })

  return api
}
