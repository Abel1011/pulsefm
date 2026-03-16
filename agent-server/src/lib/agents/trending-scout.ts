import { GoogleGenAI } from '@google/genai'
import type { GroundingChunk } from '@google/genai'
import type { NewsCandidate } from '../../types/news.js'
import type { GeminiSearchConfig } from '../../types/station.js'

const SYSTEM_PROMPT = `You are a news detection agent for a live AI radio station focused on AI, startups, and technology.

CRITICAL: Only report on stories published or announced within the last 3 days. Ignore older stories even if they appear in search results.

Write a report on the latest trending news about the given topics. For each distinct story, write a clear headline on its own line followed by a 2-3 sentence summary. Separate each story with a blank line. Cover up to 10 distinct stories ordered by importance and recency. Do NOT include URLs.`

interface GroundingSegment {
  text: string
  chunkIndices: number[]
}

interface ResolvedChunk {
  uri: string
  title: string
}

export class TrendingScout {
  private ai: GoogleGenAI

  constructor(apiKey: string) {
    const savedLocation = process.env.GOOGLE_CLOUD_LOCATION
    process.env.GOOGLE_CLOUD_LOCATION = 'global'
    this.ai = new GoogleGenAI({ apiKey })
    if (savedLocation !== undefined) process.env.GOOGLE_CLOUD_LOCATION = savedLocation
    else delete process.env.GOOGLE_CLOUD_LOCATION
  }

  async scan(config: GeminiSearchConfig): Promise<NewsCandidate[]> {
    const query = config.keywords.join(', ')

    const response = await this.ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: `Today is ${new Date().toISOString().slice(0, 10)}. Find the latest trending news and developments from the last 3 days about: ${query}`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ googleSearch: {} }],
        temperature: 0.3,
      },
    })

    const metadata = response.candidates?.[0]?.groundingMetadata
    const chunks = metadata?.groundingChunks ?? []
    const supports = metadata?.groundingSupports ?? []

    if (supports.length === 0) return []

    // Resolve Google redirect URLs to real source URLs
    const resolvedChunks = await resolveAllChunks(chunks)

    // Build segments from grounding supports
    const segments: GroundingSegment[] = supports
      .map((s) => ({
        text: s.segment?.text ?? '',
        chunkIndices: s.groundingChunkIndices ?? [],
      }))
      .filter((s) => s.text.length > 0)

    // Group adjacent segments that share grounding chunks into stories
    const stories = groupIntoStories(segments)

    return stories.map((group, i) => {
      const fullText = group.map((s) => s.text).join(' ').trim()

      // First sentence as headline, rest as summary
      const sentenceMatch = fullText.match(/^(.+?[.!?])\s/)
      const rawHeadline = sentenceMatch ? sentenceMatch[1] : fullText.slice(0, 120)
      const headline = rawHeadline.replace(/^\d+[\.\)]\s*/, '').replace(/\*\*/g, '').trim()
      const summary = sentenceMatch
        ? fullText.slice(sentenceMatch[0].length).trim() || headline
        : fullText

      // Collect unique source URLs from this story's chunks
      const chunkIndices = [...new Set(group.flatMap((s) => s.chunkIndices))]
      const sources = chunkIndices
        .map((idx) => resolvedChunks[idx])
        .filter((c): c is ResolvedChunk => !!c?.uri)

      const primary = sources[0]

      return {
        id: `gemini-${Date.now()}-${i}`,
        headline,
        summary,
        url: primary?.uri ?? '',
        source: 'gemini-search' as const,
        sourceLabel: primary?.title ?? 'Google Search',
        detectedAt: Date.now(),
        rawScore: 70 - i * 5,
      }
    })
  }
}

function groupIntoStories(segments: GroundingSegment[]): GroundingSegment[][] {
  if (segments.length === 0) return []
  const stories: GroundingSegment[][] = [[segments[0]]]

  for (let i = 1; i < segments.length; i++) {
    const curr = segments[i]
    const lastGroup = stories[stories.length - 1]
    const prevChunks = new Set(lastGroup.flatMap((s) => s.chunkIndices))
    const sharesChunk = curr.chunkIndices.some((idx) => prevChunks.has(idx))

    if (sharesChunk) {
      lastGroup.push(curr)
    } else {
      stories.push([curr])
    }
  }

  return stories
}

async function resolveAllChunks(chunks: GroundingChunk[]): Promise<ResolvedChunk[]> {
  return Promise.all(
    chunks.map(async (chunk) => {
      const rawUri = chunk.web?.uri ?? ''
      const title = chunk.web?.title ?? ''
      const uri = await resolveRedirectUrl(rawUri)
      return { uri, title }
    })
  )
}

async function resolveRedirectUrl(url: string): Promise<string> {
  if (!url || !url.includes('vertexaisearch.cloud.google.com')) return url
  try {
    const res = await fetch(url, { redirect: 'manual' })
    return res.headers.get('location') ?? url
  } catch {
    return url
  }
}
