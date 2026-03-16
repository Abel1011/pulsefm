import { GoogleGenAI, Modality, Type, type LiveServerMessage, type FunctionDeclaration } from '@google/genai'

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY
if (!GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY is required')

const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY })

export interface GeminiLiveCallbacks {
  onAudio(base64Pcm: string): void
  onInputTranscript?(text: string): void
  onOutputTranscript?(text: string): void
  onToolCall?(name: string, id: string, args: Record<string, unknown>): void
  onTurnComplete(): void
  onInterrupted(): void
  onError(err: unknown): void
  onClose(): void
}

export interface GeminiLiveSession {
  sendText(text: string): void
  sendAudio(base64Pcm: string, sampleRate?: number): void
  sendToolResponse(id: string, name: string, result: Record<string, unknown>): void
  close(): void
}

export { Type as SchemaType }
export type { FunctionDeclaration }

export type GeminiVoice = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Aoede' | 'Leda' | 'Orus' | 'Zephyr'

export async function connectGeminiLive(
  systemInstruction: string,
  callbacks: GeminiLiveCallbacks,
  voice: GeminiVoice = 'Orus',
  tools?: FunctionDeclaration[],
): Promise<GeminiLiveSession> {
  const session = await ai.live.connect({
    model: 'gemini-live-2.5-flash-native-audio',
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
      systemInstruction: { parts: [{ text: systemInstruction }] },
      outputAudioTranscription: {},
      inputAudioTranscription: {},
      enableAffectiveDialog: true,
      ...(tools?.length ? { tools: [{ functionDeclarations: tools }] } : {}),
    },
    callbacks: {
      onopen() {
        console.log('[gemini-live] connected')
      },
      onmessage(msg: LiveServerMessage) {
        const audioData = msg.data
        if (audioData) {
          callbacks.onAudio(audioData)
        }

        // Transcriptions
        if (msg.serverContent?.inputTranscription?.text) {
          callbacks.onInputTranscript?.(msg.serverContent.inputTranscription.text)
        }
        if (msg.serverContent?.outputTranscription?.text) {
          callbacks.onOutputTranscript?.(msg.serverContent.outputTranscription.text)
        }

        // Turn complete
        if (msg.serverContent?.turnComplete) {
          callbacks.onTurnComplete()
        }

        // Interrupted
        if (msg.serverContent?.interrupted) {
          callbacks.onInterrupted()
        }

        // Tool calls
        const toolCall = (msg as unknown as Record<string, unknown>).toolCall as
          | { functionCalls?: { name: string; id: string; args: Record<string, unknown> }[] }
          | undefined
        if (toolCall?.functionCalls) {
          for (const fc of toolCall.functionCalls) {
            callbacks.onToolCall?.(fc.name, fc.id, fc.args ?? {})
          }
        }
      },
      onerror(e: ErrorEvent) {
        callbacks.onError(e.error ?? e)
      },
      onclose() {
        callbacks.onClose()
      },
    },
  })

  return {
    sendText(text: string) {
      session.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }] })
    },
    sendAudio(base64Pcm: string, sampleRate: number = 16000) {
      session.sendRealtimeInput({
        audio: { data: base64Pcm, mimeType: `audio/pcm;rate=${sampleRate}` },
      })
    },
    sendToolResponse(id: string, name: string, result: Record<string, unknown>) {
      session.sendToolResponse({ functionResponses: [{ id, name, response: result }] })
    },
    close() {
      session.close()
    },
  }
}
