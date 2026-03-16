import { GoogleGenAI } from '@google/genai'
import type { GroundingChunk } from '@google/genai'
import type { EditorialBrief, SourceType } from '../../types/news.js'

const SYSTEM_PROMPT = `You are a research agent for "Pulse", a live AI radio station focused on AI, startups, and technology. You receive a news brief that needs deeper investigation. Use Google Search to find the latest, most detailed information about this topic.

CRITICAL DATE RULE: Only include information and sources published within the last 3 days. Ignore outdated articles, old product launches, or stale announcements — even if they appear in search results. If the story turns out to be old news (not from the last 3 days), say so clearly.

Research the story and write:
1. A comprehensive 4-6 sentence summary with the latest details, context, and implications. Conversational and radio-ready.
2. 2-5 key facts as bullet points.
3. On the very last line, write exactly one of: CONFIDENCE: confirmed | CONFIDENCE: developing | CONFIDENCE: rumor

Do NOT include source URLs — they are extracted automatically from grounding metadata.`

interface ResolvedChunk {
  uri: string
  title: string
}

export class ResearchAgent {
  private ai: GoogleGenAI

  constructor(apiKey: string) {
    const savedLocation = process.env.GOOGLE_CLOUD_LOCATION
    process.env.GOOGLE_CLOUD_LOCATION = 'global'
    this.ai = new GoogleGenAI({ apiKey })
    if (savedLocation !== undefined) process.env.GOOGLE_CLOUD_LOCATION = savedLocation
    else delete process.env.GOOGLE_CLOUD_LOCATION
  }

  async research(brief: EditorialBrief): Promise<EditorialBrief> {
    const cutoffDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    const prompt = [
      `Today is ${today}. Research this news story in depth.`,
      `IMPORTANT: Only look for information published between ${cutoffDate} and ${today}. Discard anything older.`,
      `Headline: ${brief.headline}`,
      `Current summary: ${brief.summary}`,
      `Current confidence: ${brief.confidence}`,
      `Sources so far: ${brief.sources.map((s) => s.label).join(', ') || 'none'}`,
    ].join('\n')

    const response = await this.ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ googleSearch: {} }],
        temperature: 0.3,
      },
    })

    const metadata = response.candidates?.[0]?.groundingMetadata
    const chunks = metadata?.groundingChunks ?? []
    const supports = metadata?.groundingSupports ?? []

    // Build summary from grounding supports (real grounded text, not hallucinated)
    const groundedText = supports.map((s) => s.segment?.text ?? '').join(' ').trim()
    if (!groundedText) return brief

    // Resolve Google redirect URLs to real source URLs
    const resolvedChunks = await resolveAllChunks(chunks)

    // Build updated sources from resolved grounding chunks
    const updatedSources = [...brief.sources]
    for (const chunk of resolvedChunks) {
      if (!chunk.uri) continue
      const exists = updatedSources.some((s) => s.url === chunk.uri)
      if (!exists) {
        updatedSources.push({ label: chunk.title, url: chunk.uri, type: 'gemini-search' as SourceType })
      }
    }

    // Extract confidence from the grounded text
    const confidenceMatch = groundedText.match(/CONFIDENCE:\s*(confirmed|developing|rumor)/i)
    const confidence = confidenceMatch ? validateConfidence(confidenceMatch[1].toLowerCase()) : null

    // Clean summary: remove the confidence line
    const summary = groundedText.replace(/\s*CONFIDENCE:\s*(confirmed|developing|rumor)\s*/gi, '').trim()

    // Check for image URLs in grounding chunks
    const imageChunks = chunks
      .filter((c) => c.image?.imageUri)
      .map((c) => c.image!.imageUri!)

    return {
      ...brief,
      summary,
      sources: updatedSources,
      confidence: confidence ?? brief.confidence,
      imageUrl: imageChunks[0] || brief.imageUrl,
      imageUrls: mergeImageUrls(brief.imageUrls, imageChunks[0] || null),
    }
  }
}

function validateConfidence(val: string): 'confirmed' | 'developing' | 'rumor' | null {
  if (val === 'confirmed' || val === 'developing' || val === 'rumor') return val
  return null
}

function mergeImageUrls(existing?: string[], newUrl?: string | null): string[] {
  const set = new Set(existing ?? [])
  if (newUrl) set.add(newUrl)
  return [...set]
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
