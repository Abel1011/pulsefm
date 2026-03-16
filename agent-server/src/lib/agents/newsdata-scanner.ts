import type { NewsCandidate } from '../../types/news.js'
import type { NewsDataConfig } from '../../types/station.js'

const API_BASE = 'https://newsdata.io/api/1/latest'

interface NewsDataArticle {
  article_id: string
  title: string
  description: string | null
  content: string | null
  link: string
  source_id: string
  source_name: string
  image_url: string | null
  pubDate: string | null
  category: string[]
}

interface NewsDataResponse {
  status: string
  totalResults: number
  results: NewsDataArticle[]
  nextPage?: string
}

export class NewsDataScanner {
  private apiKey: string
  private seenIds = new Set<string>()

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async scan(configs: NewsDataConfig[]): Promise<NewsCandidate[]> {
    if (!this.apiKey) return []

    const candidates: NewsCandidate[] = []

    const results = await Promise.allSettled(
      configs.map((cfg) => this.fetchNews(cfg))
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        candidates.push(...result.value)
      }
    }

    return candidates
  }

  private async fetchNews(config: NewsDataConfig): Promise<NewsCandidate[]> {
    const params = new URLSearchParams({
      apikey: this.apiKey,
      q: config.keywords.join(' OR '),
      language: config.language || 'en',
      image: '1',
      prioritydomain: 'top',
    })

    if (config.categories && config.categories.length > 0) {
      params.set('category', config.categories.join(','))
    }

    const res = await fetch(`${API_BASE}?${params}`, {
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      throw new Error(`NewsData API: ${res.status} ${res.statusText}`)
    }

    const data = (await res.json()) as NewsDataResponse

    if (data.status !== 'success' || !data.results) return []

    const candidates: NewsCandidate[] = []

    for (const article of data.results) {
      if (!article.article_id || this.seenIds.has(article.article_id)) continue
      if (!article.title) continue

      this.seenIds.add(article.article_id)

      candidates.push({
        id: `newsdata-${article.article_id}`,
        headline: article.title.trim(),
        summary: (article.description || article.content || article.title).slice(0, 500),
        url: article.link || '',
        source: 'newsdata',
        sourceLabel: article.source_name || article.source_id || 'NewsData',
        detectedAt: article.pubDate ? new Date(article.pubDate).getTime() : Date.now(),
        rawScore: 60,
        imageUrl: article.image_url || undefined,
        imageUrls: article.image_url ? [article.image_url] : [],
      })
    }

    return candidates
  }

  resetSeen(): void {
    this.seenIds.clear()
  }
}
