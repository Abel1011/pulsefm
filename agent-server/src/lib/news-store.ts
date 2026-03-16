import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { NewsCandidate, EditorialBrief, ActivityLogEntry } from '../types/news.js'

export interface NewsStore {
  addCandidates(stationId: string, candidates: NewsCandidate[]): Promise<void>
  getCandidates(stationId: string, opts?: { since?: number; limit?: number }): Promise<NewsCandidate[]>
  addBriefs(stationId: string, briefs: EditorialBrief[]): Promise<void>
  getBriefs(stationId: string, opts?: { since?: number; limit?: number; pendingOnly?: boolean }): Promise<EditorialBrief[]>
  markBriefUsed(stationId: string, briefId: string): Promise<void>
  sendBrief(stationId: string, briefId: string, method: string): Promise<EditorialBrief | null>
  addBriefLogEntry(stationId: string, briefId: string, entry: ActivityLogEntry): Promise<EditorialBrief | null>
  updateBrief(stationId: string, brief: EditorialBrief): Promise<void>
}

export class JsonFileNewsStore implements NewsStore {
  private baseDir: string
  private locks = new Map<string, Promise<void>>()

  constructor(dataDir: string) {
    this.baseDir = dataDir
  }

  // Simple file-level mutex to prevent concurrent read-modify-write corruption
  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    while (this.locks.has(key)) {
      await this.locks.get(key)
    }
    let resolve: () => void
    const promise = new Promise<void>((r) => { resolve = r })
    this.locks.set(key, promise)
    try {
      return await fn()
    } finally {
      this.locks.delete(key)
      resolve!()
    }
  }

  private stationDir(stationId: string): string {
    return path.join(this.baseDir, stationId)
  }

  private candidatesPath(stationId: string): string {
    return path.join(this.stationDir(stationId), 'candidates.json')
  }

  private briefsPath(stationId: string): string {
    return path.join(this.stationDir(stationId), 'briefs.json')
  }

  private async ensureDir(stationId: string): Promise<void> {
    const dir = this.stationDir(stationId)
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }
  }

  private async readJson<T>(fp: string): Promise<T[]> {
    if (!existsSync(fp)) return []
    const raw = await readFile(fp, 'utf-8')
    try {
      return JSON.parse(raw) as T[]
    } catch {
      console.warn(`[news-store] corrupted JSON in ${fp}, resetting`)
      return []
    }
  }

  private async writeJson<T>(fp: string, data: T[], stationId: string): Promise<void> {
    await this.ensureDir(stationId)
    await writeFile(fp, JSON.stringify(data, null, 2), 'utf-8')
  }

  async addCandidates(stationId: string, candidates: NewsCandidate[]): Promise<void> {
    const fp = this.candidatesPath(stationId)
    await this.withLock(fp, async () => {
      const existing = await this.readJson<NewsCandidate>(fp)
      const existingIds = new Set(existing.map((c) => c.id))
      const maxAge = Date.now() - 3 * 24 * 60 * 60 * 1000 // 3 days
      const newOnes = candidates.filter((c) => !existingIds.has(c.id) && c.detectedAt >= maxAge)
      if (newOnes.length === 0) return
      const merged = [...existing, ...newOnes]
      // Keep last 500 candidates max
      const trimmed = merged.slice(-500)
      await this.writeJson(fp, trimmed, stationId)
    })
  }

  async getCandidates(stationId: string, opts?: { since?: number; limit?: number }): Promise<NewsCandidate[]> {
    const all = await this.readJson<NewsCandidate>(this.candidatesPath(stationId))
    let result = all
    if (opts?.since) {
      result = result.filter((c) => c.detectedAt >= opts.since!)
    }
    if (opts?.limit) {
      result = result.slice(-opts.limit)
    }
    return result
  }

  async addBriefs(stationId: string, briefs: EditorialBrief[]): Promise<void> {
    const fp = this.briefsPath(stationId)
    await this.withLock(fp, async () => {
      const existing = await this.readJson<EditorialBrief>(fp)
      const existingIds = new Set(existing.map((b) => b.id))
      const newOnes = briefs.filter((b) => !existingIds.has(b.id))
      if (newOnes.length === 0) return
      const merged = [...existing, ...newOnes]
      const trimmed = merged.slice(-200)
      await this.writeJson(fp, trimmed, stationId)
    })
  }

  async getBriefs(stationId: string, opts?: { since?: number; limit?: number; pendingOnly?: boolean }): Promise<EditorialBrief[]> {
    const all = await this.readJson<EditorialBrief>(this.briefsPath(stationId))
    let result = all
    if (opts?.pendingOnly) {
      result = result.filter((b) => !b.used)
    }
    if (opts?.since) {
      result = result.filter((b) => b.generatedAt >= opts.since!)
    }
    if (opts?.limit) {
      result = result.slice(-opts.limit)
    }
    return result
  }

  async markBriefUsed(stationId: string, briefId: string): Promise<void> {
    const fp = this.briefsPath(stationId)
    await this.withLock(fp, async () => {
      const all = await this.readJson<EditorialBrief>(fp)
      const idx = all.findIndex((b) => b.id === briefId)
      if (idx === -1) return
      all[idx].used = true
      const log = all[idx].activityLog ?? []
      log.push({ timestamp: Date.now(), action: 'sent', detail: 'Marked as used' })
      all[idx].activityLog = log
      await this.writeJson(fp, all, stationId)
    })
  }

  async sendBrief(stationId: string, briefId: string, method: string): Promise<EditorialBrief | null> {
    const fp = this.briefsPath(stationId)
    return this.withLock(fp, async () => {
      const all = await this.readJson<EditorialBrief>(fp)
      const idx = all.findIndex((b) => b.id === briefId)
      if (idx === -1) return null
      const now = Date.now()
      all[idx].used = true
      all[idx].sentAt = all[idx].sentAt ?? now
      all[idx].sentCount = (all[idx].sentCount ?? 0) + 1
      const log = all[idx].activityLog ?? []
      log.push({ timestamp: now, action: 'sent', detail: `Sent as ${method}` })
      all[idx].activityLog = log
      await this.writeJson(fp, all, stationId)
      return all[idx]
    })
  }

  async addBriefLogEntry(stationId: string, briefId: string, entry: ActivityLogEntry): Promise<EditorialBrief | null> {
    const fp = this.briefsPath(stationId)
    return this.withLock(fp, async () => {
      const all = await this.readJson<EditorialBrief>(fp)
      const idx = all.findIndex((b) => b.id === briefId)
      if (idx === -1) return null
      const log = all[idx].activityLog ?? []
      log.push(entry)
      all[idx].activityLog = log
      all[idx].lastUpdatedAt = entry.timestamp
      await this.writeJson(fp, all, stationId)
      return all[idx]
    })
  }

  async updateBrief(stationId: string, brief: EditorialBrief): Promise<void> {
    const fp = this.briefsPath(stationId)
    await this.withLock(fp, async () => {
      const all = await this.readJson<EditorialBrief>(fp)
      const idx = all.findIndex((b) => b.id === brief.id)
      if (idx === -1) return
      all[idx] = brief
      await this.writeJson(fp, all, stationId)
    })
  }
}
