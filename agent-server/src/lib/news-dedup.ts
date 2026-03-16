import { GoogleGenAI } from '@google/genai'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { NewsCandidate } from '../types/news.js'

const EMBEDDING_MODEL = 'text-embedding-004'
const DUPLICATE_THRESHOLD = 0.85
const RELATED_THRESHOLD = 0.70

interface StoredEmbedding {
  candidateId: string
  headline: string
  vector: number[]
  storedAt: number
}

export interface DedupResult {
  unique: NewsCandidate[]
  duplicates: { candidate: NewsCandidate; matchedId: string; similarity: number }[]
  related: { candidate: NewsCandidate; matchedId: string; similarity: number }[]
}

export class NewsDedup {
  private ai: GoogleGenAI
  private dataDir: string
  private cache: Map<string, StoredEmbedding[]> = new Map()

  constructor(apiKey: string, dataDir: string) {
    this.ai = new GoogleGenAI({ apiKey })
    this.dataDir = dataDir
  }

  private embeddingsPath(stationId: string): string {
    return path.join(this.dataDir, stationId, 'embeddings.json')
  }

  private async loadEmbeddings(stationId: string): Promise<StoredEmbedding[]> {
    if (this.cache.has(stationId)) return this.cache.get(stationId)!
    const fp = this.embeddingsPath(stationId)
    if (!existsSync(fp)) return []
    try {
      const raw = await readFile(fp, 'utf-8')
      const data = JSON.parse(raw) as StoredEmbedding[]
      this.cache.set(stationId, data)
      return data
    } catch {
      return []
    }
  }

  private async saveEmbeddings(stationId: string, embeddings: StoredEmbedding[]): Promise<void> {
    const dir = path.join(this.dataDir, stationId)
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    // Keep max 1000 embeddings, pruning oldest
    const trimmed = embeddings.slice(-1000)
    this.cache.set(stationId, trimmed)
    await writeFile(this.embeddingsPath(stationId), JSON.stringify(trimmed), 'utf-8')
  }

  private async getEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []
    const result = await this.ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: texts.map((t) => ({ role: 'user', parts: [{ text: t }] })),
    })
    // The response contains embeddings array
    if (result.embeddings) {
      return result.embeddings.map((e) => e.values ?? [])
    }
    return []
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0
    let dot = 0, normA = 0, normB = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB)
    return denom === 0 ? 0 : dot / denom
  }

  private findBestMatch(vector: number[], existing: StoredEmbedding[]): { id: string; similarity: number } | null {
    let bestSim = 0
    let bestId = ''
    for (const entry of existing) {
      const sim = this.cosineSimilarity(vector, entry.vector)
      if (sim > bestSim) {
        bestSim = sim
        bestId = entry.candidateId
      }
    }
    return bestSim >= RELATED_THRESHOLD ? { id: bestId, similarity: bestSim } : null
  }

  async deduplicate(stationId: string, candidates: NewsCandidate[]): Promise<DedupResult> {
    if (candidates.length === 0) return { unique: [], duplicates: [], related: [] }

    const existing = await this.loadEmbeddings(stationId)
    const texts = candidates.map((c) => `${c.headline}. ${c.summary}`)

    let vectors: number[][]
    try {
      vectors = await this.getEmbeddings(texts)
    } catch (err) {
      console.warn('[news-dedup] embedding failed, passing all candidates through:', err)
      return { unique: candidates, duplicates: [], related: [] }
    }

    if (vectors.length !== candidates.length) {
      console.warn(`[news-dedup] vector count mismatch: ${vectors.length} vs ${candidates.length}`)
      return { unique: candidates, duplicates: [], related: [] }
    }

    const result: DedupResult = { unique: [], duplicates: [], related: [] }
    const newEmbeddings: StoredEmbedding[] = []

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i]
      const vector = vectors[i]
      // Check against both existing embeddings and newly added ones in this batch
      const allEmbeddings = [...existing, ...newEmbeddings]
      const match = this.findBestMatch(vector, allEmbeddings)

      if (match && match.similarity >= DUPLICATE_THRESHOLD) {
        result.duplicates.push({ candidate, matchedId: match.id, similarity: match.similarity })
      } else if (match && match.similarity >= RELATED_THRESHOLD) {
        result.related.push({ candidate, matchedId: match.id, similarity: match.similarity })
        // Still add related items — they bring new info
        newEmbeddings.push({ candidateId: candidate.id, headline: candidate.headline, vector, storedAt: Date.now() })
        result.unique.push(candidate)
      } else {
        newEmbeddings.push({ candidateId: candidate.id, headline: candidate.headline, vector, storedAt: Date.now() })
        result.unique.push(candidate)
      }
    }

    if (newEmbeddings.length > 0) {
      await this.saveEmbeddings(stationId, [...existing, ...newEmbeddings])
    }

    console.log(`[news-dedup] ${candidates.length} candidates: ${result.unique.length} unique, ${result.duplicates.length} duplicates, ${result.related.length} related`)
    return result
  }
}
