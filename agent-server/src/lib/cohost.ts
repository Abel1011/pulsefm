import { connectGeminiLive, type GeminiLiveSession, type GeminiVoice } from './gemini-live.js'

export const COHOST_NAME = 'Nova'
export const COHOST_VOICE: GeminiVoice = 'Leda'

export interface CohostCallbacks {
  onAudio(base64Pcm: string): void
  onTranscript(text: string): void
  onTurnComplete(): void
  onInterrupted(): void
  onError(err: unknown): void
  onClose(): void
}

export interface CohostSession {
  discuss(hostText: string): void
  close(): void
}

function buildCohostInstruction(topic: string): string {
  return `You are ${COHOST_NAME}, the co-host of "Pulse", a 24/7 live AI radio station focused on AI, startups, and technology. Your main host and co-anchor is Pulse.

The topic you're currently discussing: ${topic}

Your personality:
- Sharp, opinionated, and analytical — you bring a complementary perspective to Pulse.
- Warm, witty, and conversational. Sometimes you agree and add depth; other times you respectfully challenge with a different angle.
- You share concrete examples, historical comparisons, or thought-provoking observations.
- You're a permanent co-host — not a guest, not an interviewee. You belong on this show.

Your broadcast style:
- Keep each response SHORT — 1 to 2 paragraphs max, then pause so Pulse can follow up.
- You're live on air — be natural, engaging, and dynamic.
- Never introduce yourself — Pulse will toss to you naturally.
- Don't overuse Pulse's name. Address them naturally or not at all.
- Speak in english.

Wait for Pulse to toss to you or ask your opinion. Then respond with your take.`
}

export async function createCohostSession(
  topic: string,
  callbacks: CohostCallbacks
): Promise<CohostSession> {
  let transcriptBuffer = ''

  const session: GeminiLiveSession = await connectGeminiLive(
    buildCohostInstruction(topic),
    {
      onAudio(base64Pcm) {
        callbacks.onAudio(base64Pcm)
      },
      onOutputTranscript(text) {
        transcriptBuffer += text
        callbacks.onTranscript(text)
      },
      onInputTranscript() {},
      onTurnComplete() {
        if (transcriptBuffer.trim()) {
          transcriptBuffer = ''
        }
        callbacks.onTurnComplete()
      },
      onInterrupted() {
        transcriptBuffer = ''
        callbacks.onInterrupted()
      },
      onError: callbacks.onError,
      onClose: callbacks.onClose,
    },
    COHOST_VOICE
  )

  return {
    discuss(hostText: string) {
      session.sendText(
        `Pulse just said: "${hostText}". Respond with your take — share your perspective, ` +
        `build on their point, or offer a different angle. Be concise and engaging.`
      )
    },
    close() {
      session.close()
    },
  }
}
