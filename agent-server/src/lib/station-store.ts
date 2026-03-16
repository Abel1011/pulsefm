import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { StationConfig } from '../types/station.js'

export interface StationStore {
  listStations(): Promise<StationConfig[]>
  getStation(id: string): Promise<StationConfig | null>
  createStation(config: StationConfig): Promise<StationConfig>
  updateStation(id: string, partial: Partial<StationConfig>): Promise<StationConfig | null>
  deleteStation(id: string): Promise<boolean>
}

export class JsonFileStationStore implements StationStore {
  private dir: string

  constructor(dataDir: string) {
    this.dir = dataDir
  }

  private filePath(): string {
    return path.join(this.dir, 'stations.json')
  }

  private async ensureDir(): Promise<void> {
    if (!existsSync(this.dir)) {
      await mkdir(this.dir, { recursive: true })
    }
  }

  private async readAll(): Promise<StationConfig[]> {
    const fp = this.filePath()
    if (!existsSync(fp)) return []
    const raw = await readFile(fp, 'utf-8')
    return JSON.parse(raw) as StationConfig[]
  }

  private async writeAll(stations: StationConfig[]): Promise<void> {
    await this.ensureDir()
    await writeFile(this.filePath(), JSON.stringify(stations, null, 2), 'utf-8')
  }

  async listStations(): Promise<StationConfig[]> {
    return this.readAll()
  }

  async getStation(id: string): Promise<StationConfig | null> {
    const all = await this.readAll()
    return all.find((s) => s.id === id) ?? null
  }

  async createStation(config: StationConfig): Promise<StationConfig> {
    const all = await this.readAll()
    all.push(config)
    await this.writeAll(all)
    return config
  }

  async updateStation(id: string, partial: Partial<StationConfig>): Promise<StationConfig | null> {
    const all = await this.readAll()
    const idx = all.findIndex((s) => s.id === id)
    if (idx === -1) return null
    all[idx] = { ...all[idx], ...partial, id }
    await this.writeAll(all)
    return all[idx]
  }

  async deleteStation(id: string): Promise<boolean> {
    const all = await this.readAll()
    const before = all.length
    const filtered = all.filter((s) => s.id !== id)
    if (filtered.length === before) return false
    await this.writeAll(filtered)
    return true
  }
}
