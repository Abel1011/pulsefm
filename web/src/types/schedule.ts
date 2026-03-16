export interface TopicConfig {
  description: string
  injectionType: 'breaking' | 'soft'
  sources?: string[]
  imageUrls?: string[]
  turnPrompts?: string[]
}

export interface GuestBlockConfig {
  name: string
  expertise: string
  topic: string
  voice: string
}

export interface MusicConfig {
  trackFile?: string    // Legacy single-track field, mapped to playlist[0]
  playlist: string[]    // Ordered list of track filenames to play
  label: string
  loop?: boolean        // Loop playlist when it finishes before block ends (default true)
}

export interface BreakConfig {
  message?: string
}

export interface CallsConfig {
  topic?: string
}

export type BlockType = 'topic' | 'guest' | 'music' | 'break' | 'calls'
export type BlockStatus = 'pending' | 'active' | 'completed' | 'skipped'

export type BlockConfig = TopicConfig | GuestBlockConfig | MusicConfig | BreakConfig | CallsConfig

export interface ScheduleBlock {
  id: string
  type: BlockType
  title: string
  startTime: string // HH:mm
  durationMinutes: number
  status: BlockStatus
  config: BlockConfig
}

export interface DaySchedule {
  date: string // YYYY-MM-DD
  blocks: ScheduleBlock[]
}
