import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const SAMPLE_RATE = 24000
const BYTES_PER_SAMPLE = 2
const CHUNK_DURATION_MS = 100
const SAMPLES_PER_CHUNK = (SAMPLE_RATE * CHUNK_DURATION_MS) / 1000
const BYTES_PER_CHUNK = SAMPLES_PER_CHUNK * BYTES_PER_SAMPLE

export interface MusicPlayerDeps {
  broadcast(message: string): void
  mediaDir: string
}

export class MusicPlayer {
  private deps: MusicPlayerDeps
  private interval: ReturnType<typeof setInterval> | null = null
  private pcmBuffer: Buffer | null = null
  private offset = 0
  private currentTrack: string | null = null

  // Playlist state
  private playlist: string[] = []
  private playlistIndex = 0
  private looping = true

  constructor(deps: MusicPlayerDeps) {
    this.deps = deps
  }

  isPlaying(): boolean {
    return this.interval !== null
  }

  currentTrackName(): string | null {
    return this.currentTrack
  }

  /**
   * List available .wav tracks in the media directory.
   */
  listTracks(): string[] {
    if (!existsSync(this.deps.mediaDir)) return []
    return readdirSync(this.deps.mediaDir)
      .filter((f) => f.endsWith('.wav'))
      .sort()
  }

  /**
   * Play an ordered list of tracks. Loops when all finish (if loop=true).
   * Stops only when stopTrack() is called (e.g. by the scheduler on block end).
   */
  playPlaylist(filenames: string[], loop = true): boolean {
    if (filenames.length === 0) return false
    this.playlist = filenames
    this.playlistIndex = 0
    this.looping = loop
    return this.loadAndPlay(filenames[0])
  }

  /**
   * Play a single WAV file. Expects 24kHz 16-bit mono PCM WAV.
   * Sends base64 PCM chunks over WebSocket at real-time rate.
   */
  playTrack(filename: string): boolean {
    // Single-track call resets playlist context
    this.playlist = [filename]
    this.playlistIndex = 0
    this.looping = false
    return this.loadAndPlay(filename)
  }

  private loadAndPlay(filename: string): boolean {
    this.stopInterval()

    const filePath = path.join(this.deps.mediaDir, filename)
    if (!existsSync(filePath)) {
      console.error(`[music] file not found: ${filePath}`)
      return false
    }

    const fileBuffer = readFileSync(filePath)
    const pcm = extractPcmFromWav(fileBuffer)
    if (!pcm) {
      console.error(`[music] invalid WAV format: ${filename}`)
      return false
    }

    this.pcmBuffer = pcm
    this.offset = 0
    this.currentTrack = filename
    console.log(`[music] playing: ${filename} (${(pcm.length / SAMPLE_RATE / BYTES_PER_SAMPLE).toFixed(1)}s)`)

    this.interval = setInterval(() => {
      if (!this.pcmBuffer) {
        this.stopTrack()
        return
      }

      const end = Math.min(this.offset + BYTES_PER_CHUNK, this.pcmBuffer.length)
      const chunk = this.pcmBuffer.subarray(this.offset, end)
      this.offset = end

      if (chunk.length > 0) {
        this.deps.broadcast(
          JSON.stringify({ type: 'audio', data: chunk.toString('base64') })
        )
      }

      if (this.offset >= this.pcmBuffer.length) {
        console.log(`[music] finished: ${this.currentTrack}`)
        this.advancePlaylist()
      }
    }, CHUNK_DURATION_MS)

    return true
  }

  private advancePlaylist() {
    this.stopInterval()
    this.playlistIndex++

    if (this.playlistIndex < this.playlist.length) {
      // Next track in playlist
      this.loadAndPlay(this.playlist[this.playlistIndex])
    } else if (this.looping && this.playlist.length > 0) {
      // Loop back to start
      this.playlistIndex = 0
      console.log('[music] looping playlist')
      this.loadAndPlay(this.playlist[0])
    } else {
      // Done
      this.currentTrack = null
    }
  }

  private stopInterval() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    this.pcmBuffer = null
    this.offset = 0
  }

  stopTrack() {
    this.stopInterval()
    this.playlist = []
    this.playlistIndex = 0
    this.currentTrack = null
  }
}

/**
 * Extract raw PCM data from a WAV file buffer.
 * Validates that the file is 16-bit mono at any sample rate.
 * Returns the raw PCM bytes after the data header.
 */
function extractPcmFromWav(buffer: Buffer): Buffer | null {
  // Minimum WAV header is 44 bytes
  if (buffer.length < 44) return null

  // RIFF header check
  const riff = buffer.toString('ascii', 0, 4)
  const wave = buffer.toString('ascii', 8, 12)
  if (riff !== 'RIFF' || wave !== 'WAVE') return null

  // Find "data" chunk
  let pos = 12
  while (pos < buffer.length - 8) {
    const chunkId = buffer.toString('ascii', pos, pos + 4)
    const chunkSize = buffer.readUInt32LE(pos + 4)
    if (chunkId === 'data') {
      return buffer.subarray(pos + 8, pos + 8 + chunkSize)
    }
    pos += 8 + chunkSize
    // Odd-sized chunks are padded to even
    if (chunkSize % 2 !== 0) pos += 1
  }

  return null
}
