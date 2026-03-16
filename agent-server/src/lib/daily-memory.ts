import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { ScheduleStore } from './schedule-store.js'

export class DailyMemory {
  private baseDir: string
  private scheduleStore: ScheduleStore

  constructor(dataDir: string, scheduleStore: ScheduleStore) {
    this.baseDir = path.join(dataDir, 'memory')
    this.scheduleStore = scheduleStore
  }

  private filePath(date: string): string {
    return path.join(this.baseDir, `${date}.md`)
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10)
  }

  private timestamp(): string {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  async addEntry(text: string, date?: string): Promise<void> {
    const d = date ?? this.today()
    const fp = this.filePath(d)

    if (!existsSync(this.baseDir)) {
      await mkdir(this.baseDir, { recursive: true })
    }

    const line = `- [${this.timestamp()}] ${text}\n`

    if (existsSync(fp)) {
      const existing = await readFile(fp, 'utf-8')
      await writeFile(fp, existing + line, 'utf-8')
    } else {
      const header = `# Pulse Daily Memory — ${d}\n\n`
      await writeFile(fp, header + line, 'utf-8')
    }
  }

  async getMemory(date?: string): Promise<string> {
    const d = date ?? this.today()
    const fp = this.filePath(d)
    if (!existsSync(fp)) return ''
    return readFile(fp, 'utf-8')
  }

  async buildContext(): Promise<string> {
    const date = this.today()
    const parts: string[] = []

    // Past: what happened today
    const memory = await this.getMemory(date)
    if (memory) {
      parts.push('=== SHOW MEMORY (what happened today) ===')
      parts.push(memory.replace(/^# .+\n\n/, ''))
    }

    // Future: what's coming up
    const schedule = await this.scheduleStore.getSchedule(date)
    const upcoming = schedule.blocks
      .filter((b) => b.status === 'pending')
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .slice(0, 5)

    if (upcoming.length > 0) {
      parts.push('=== COMING UP NEXT ===')
      for (const b of upcoming) {
        parts.push(`- [${b.startTime}] ${b.type}: ${b.title}`)
      }
    }

    return parts.join('\n')
  }
}
