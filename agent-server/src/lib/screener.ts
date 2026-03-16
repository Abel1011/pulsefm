import { connectGeminiLive, type GeminiLiveSession } from './gemini-live.js'

const SCREENER_INSTRUCTION = `You are a friendly radio station operator for "Pulse", a 24/7 AI radio station about AI, startups, and technology.

A listener is calling the station. The host is currently busy on air and can't take calls right now.

Your job:
- Greet the caller warmly and let them know the host isn't taking live calls at the moment
- Ask what they'd like to share: a greeting, a shoutout, a message, a question, a news tip, or anything they want to say
- Listen to their message and acknowledge it
- Let them know you'll pass it along to the host
- Keep the conversation short and warm — like a real radio station operator
- If they want to stay on the line, gently let them know you'll relay their message and they can listen on air
- Keep each response SHORT — 2-3 sentences max
- Speak in spanish
- You are NOT the host. You are the station operator answering calls.

Start by greeting the caller.`

export interface ScreenerCallbacks {
  onAudio(base64Pcm: string): void
  onTranscript(text: string): void
  onTurnComplete(fullText: string): void
  onInterrupted(): void
  onError(err: unknown): void
  onClose(): void
}

export interface ScreenerSession {
  sendCallerAudio(base64Pcm: string): void
  close(): void
}

export async function createScreenerSession(
  callbacks: ScreenerCallbacks
): Promise<ScreenerSession> {
  let transcriptBuffer = ''

  const session: GeminiLiveSession = await connectGeminiLive(
    SCREENER_INSTRUCTION,
    {
      onAudio(base64Pcm) {
        callbacks.onAudio(base64Pcm)
      },
      onOutputTranscript(text) {
        transcriptBuffer += text
        callbacks.onTranscript(text)
      },
      onInputTranscript(text) {
        console.log('[screener-caller]', text)
      },
      onTurnComplete() {
        const completed = transcriptBuffer.trim()
        transcriptBuffer = ''
        callbacks.onTurnComplete(completed)
      },
      onInterrupted() {
        transcriptBuffer = ''
        callbacks.onInterrupted()
      },
      onError: callbacks.onError,
      onClose: callbacks.onClose,
    },
    'Kore',
  )

  // Screener starts the conversation by greeting the caller
  session.sendText('A listener is calling. Greet them warmly.')

  return {
    sendCallerAudio(base64Pcm: string) {
      session.sendAudio(base64Pcm)
    },
    close() {
      session.close()
    },
  }
}
