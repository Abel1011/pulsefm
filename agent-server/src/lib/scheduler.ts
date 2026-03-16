import type { ScheduleStore } from './schedule-store.js'
import type { ScheduleBlock, TopicConfig, GuestBlockConfig, MusicConfig } from '../types/schedule.js'

export interface SchedulerDeps {
  store: ScheduleStore
  /** Ensure the presenter session is connected (lazy init) */
  ensurePresenter(): Promise<void>
  /** Inject a topic into the presenter */
  injectTopic(config: TopicConfig): void
  /** Start a guest segment */
  startGuest(config: GuestBlockConfig): Promise<void>
  /** Stop active guest segment */
  stopGuest(): void
  /** Play a music track */
  playMusic(config: MusicConfig): void
  /** Stop current music */
  stopMusic(): void
  /** Inject a break message */
  injectBreak(message: string): void
  /** Open phone lines for listener calls */
  openCalls(topic?: string): void
  /** Close phone lines */
  closeCalls(): void
  /** Broadcast a WS message to all clients */
  broadcast(message: string): void
}

function todayDate(): string {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

function nowHHmm(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  const nh = Math.floor(total / 60) % 24
  const nm = total % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

export class Scheduler {
  private interval: ReturnType<typeof setInterval> | null = null
  private deps: SchedulerDeps
  private activeBlockId: string | null = null
  private activeBlockEndTime: string | null = null
  private activeBlockType: string | null = null

  constructor(deps: SchedulerDeps) {
    this.deps = deps
  }

  start(intervalMs = 15_000) {
    if (this.interval) return
    this.interval = setInterval(() => this.tick(), intervalMs)
    // Run immediately once
    this.tick()
    console.log('[scheduler] started')
  }

  async stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    // Reset active block back to pending so it can be resumed on next start
    if (this.activeBlockId) {
      const date = todayDate()
      await this.deps.store.updateBlock(date, this.activeBlockId, { status: 'pending' })
      console.log(`[scheduler] reset active block ${this.activeBlockId} to pending`)
    }
    this.activeBlockId = null
    this.activeBlockEndTime = null
    this.activeBlockType = null
    console.log('[scheduler] stopped')
  }

  /** Whether the scheduler currently has an active block running */
  hasActiveBlock(): boolean {
    return this.activeBlockId !== null
  }

  /** Get the type of the currently active block (if any) */
  getActiveBlockType(): string | null {
    return this.activeBlockType
  }

  /** Check if there's a pending block starting within the next N minutes */
  async hasUpcomingBlock(withinMinutes: number): Promise<boolean> {
    const date = todayDate()
    const now = nowHHmm()
    const cutoff = addMinutes(now, withinMinutes)
    const schedule = await this.deps.store.getSchedule(date)
    return schedule.blocks.some(
      (b) => b.status === 'pending' && b.startTime >= now && b.startTime <= cutoff
    )
  }

  /** Force-execute a specific block now, regardless of its startTime */
  async executeBlock(date: string, blockId: string) {
    const schedule = await this.deps.store.getSchedule(date)
    const block = schedule.blocks.find((b) => b.id === blockId)
    if (!block || block.status !== 'pending') return
    await this.runBlock(date, block)
  }

  private async tick() {
    const date = todayDate()
    const now = nowHHmm()
    const schedule = await this.deps.store.getSchedule(date)

    // Check if active block has ended
    if (this.activeBlockId && this.activeBlockEndTime && now >= this.activeBlockEndTime) {
      await this.completeBlock(date, this.activeBlockId)
    }

    // Recover orphaned active blocks (e.g. after stop/start)
    if (!this.activeBlockId) {
      const orphaned = schedule.blocks.filter((b) => b.status === 'active')
      for (const block of orphaned) {
        await this.deps.store.updateBlock(date, block.id, { status: 'pending' })
        this.broadcastBlockUpdate(block.id, { ...block, status: 'pending' })
        console.log(`[scheduler] recovered orphaned active block: ${block.title}`)
      }
    }

    // Find the next pending block whose time has arrived
    if (!this.activeBlockId) {
      const pending = schedule.blocks
        .filter((b) => b.status === 'pending' && b.startTime <= now)
        .sort((a, b) => a.startTime.localeCompare(b.startTime))

      if (pending.length > 0) {
        // Execute the first ready block; skip any that are past their window
        const block = pending[pending.length - 1] // Most recent pending
        // Skip blocks that came before the chosen one
        for (const skipped of pending.slice(0, -1)) {
          await this.deps.store.updateBlock(date, skipped.id, { status: 'skipped' })
          this.broadcastBlockUpdate(skipped.id, { ...skipped, status: 'skipped' })
        }
        await this.runBlock(date, block)
      }
    }
  }

  private async runBlock(date: string, block: ScheduleBlock) {
    console.log(`[scheduler] executing block: ${block.title} (${block.type})`)

    // Ensure presenter is ready for blocks that need it
    if (block.type === 'topic' || block.type === 'guest' || block.type === 'calls' || block.type === 'break') {
      await this.deps.ensurePresenter()
    }

    // Mark active
    const updated = await this.deps.store.updateBlock(date, block.id, { status: 'active' })
    this.activeBlockId = block.id
    this.activeBlockEndTime = addMinutes(block.startTime, block.durationMinutes)
    this.activeBlockType = block.type
    if (updated) this.broadcastBlockUpdate(block.id, updated)

    const config = block.config

    switch (block.type) {
      case 'topic':
        this.deps.injectTopic(config as TopicConfig)
        break
      case 'guest':
        await this.deps.startGuest(config as GuestBlockConfig)
        break
      case 'music':
        this.deps.playMusic(config as MusicConfig)
        break
      case 'break':
        this.deps.injectBreak(
          (config as { message?: string }).message ?? 'We will be right back after a short break.'
        )
        break
      case 'calls':
        this.deps.openCalls((config as { topic?: string }).topic)
        break
    }
  }

  private async completeBlock(date: string, blockId: string) {
    const schedule = await this.deps.store.getSchedule(date)
    const block = schedule.blocks.find((b) => b.id === blockId)
    if (!block) return

    // Type-specific cleanup
    if (block.type === 'guest') {
      this.deps.stopGuest()
    } else if (block.type === 'music') {
      this.deps.stopMusic()
    } else if (block.type === 'calls') {
      this.deps.closeCalls()
    }

    const updated = await this.deps.store.updateBlock(date, blockId, { status: 'completed' })
    this.activeBlockId = null
    this.activeBlockEndTime = null
    this.activeBlockType = null
    if (updated) this.broadcastBlockUpdate(blockId, updated)
    console.log(`[scheduler] completed block: ${block.title}`)
  }

  private broadcastBlockUpdate(blockId: string, block: ScheduleBlock) {
    this.deps.broadcast(
      JSON.stringify({ type: 'schedule-update', blockId, block })
    )
  }
}
