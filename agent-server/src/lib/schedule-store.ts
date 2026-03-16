import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { DaySchedule, ScheduleBlock } from '../types/schedule.js'

export interface ScheduleStore {
  getSchedule(date: string): Promise<DaySchedule>
  saveSchedule(schedule: DaySchedule): Promise<void>
  updateBlock(date: string, blockId: string, partial: Partial<ScheduleBlock>): Promise<ScheduleBlock | null>
  deleteBlock(date: string, blockId: string): Promise<boolean>
}

export class JsonFileScheduleStore implements ScheduleStore {
  private dir: string

  constructor(dataDir: string) {
    this.dir = dataDir
  }

  private filePath(date: string): string {
    return path.join(this.dir, `${date}.json`)
  }

  private async ensureDir(): Promise<void> {
    if (!existsSync(this.dir)) {
      await mkdir(this.dir, { recursive: true })
    }
  }

  async getSchedule(date: string): Promise<DaySchedule> {
    const fp = this.filePath(date)
    if (!existsSync(fp)) {
      return { date, blocks: [] }
    }
    const raw = await readFile(fp, 'utf-8')
    return JSON.parse(raw) as DaySchedule
  }

  async saveSchedule(schedule: DaySchedule): Promise<void> {
    await this.ensureDir()
    const fp = this.filePath(schedule.date)
    await writeFile(fp, JSON.stringify(schedule, null, 2), 'utf-8')
  }

  async updateBlock(date: string, blockId: string, partial: Partial<ScheduleBlock>): Promise<ScheduleBlock | null> {
    const schedule = await this.getSchedule(date)
    const idx = schedule.blocks.findIndex((b) => b.id === blockId)
    if (idx === -1) return null
    schedule.blocks[idx] = { ...schedule.blocks[idx], ...partial, id: blockId }
    await this.saveSchedule(schedule)
    return schedule.blocks[idx]
  }

  async deleteBlock(date: string, blockId: string): Promise<boolean> {
    const schedule = await this.getSchedule(date)
    const before = schedule.blocks.length
    schedule.blocks = schedule.blocks.filter((b) => b.id !== blockId)
    if (schedule.blocks.length === before) return false
    await this.saveSchedule(schedule)
    return true
  }
}
