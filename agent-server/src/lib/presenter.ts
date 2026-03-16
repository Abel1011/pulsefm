import { connectGeminiLive, type GeminiLiveSession, SchemaType, type FunctionDeclaration } from './gemini-live.js'

const PRESENTER_TOOLS: FunctionDeclaration[] = [
  {
    name: 'generate_music',
    description:
      'Generate an original AI music track in real-time using a style description. ' +
      'ONLY use this tool when a LISTENER during a live call explicitly asks you to play or generate music. ' +
      'NEVER use this tool on your own initiative — do NOT generate music for transitions, breaking news, segment changes, or any reason other than a direct listener request during a call. ' +
      'If there is no active call or nobody asked for music, do NOT call this tool. ' +
      'IMPORTANT: Copyrighted music cannot be generated. If a listener requests a specific copyrighted song, ' +
      'explain that you cannot play that exact song but you will create an original track inspired by its style. ' +
      'Describe the musical characteristics (genre, mood, energy, tempo) instead of naming the song or artist. ' +
      'The track will be generated in the background (~30 seconds) and saved for playback. ' +
      'You will be notified when it is ready. Keep broadcasting while it generates.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        prompt: {
          type: SchemaType.STRING,
          description:
            'Detailed description of the music style, mood, instruments, and characteristics. ' +
            'Example: "Upbeat lo-fi hip hop with warm piano chords, vinyl crackle, and jazzy drums"',
        },
        durationSeconds: {
          type: SchemaType.NUMBER,
          description: 'Duration of the track in seconds (5–120). Defaults to 30.',
        },
        bpm: {
          type: SchemaType.NUMBER,
          description: 'Tempo in beats per minute (40–240). Defaults to 120.',
        },
      },
      required: ['prompt'],
    },
  },
]

const SYSTEM_INSTRUCTION = `You are Pulse, the host of a 24/7 live AI radio station focused on AI, startups, and technology.

Your personality:
- Energetic but thoughtful. You speak with confidence and authority, like a seasoned radio host.
- You have a sharp editorial eye — you don't just report news, you analyze it deeply.
- You use natural radio transitions: "Moving on to...", "Now, here's something interesting...", "Breaking this down..."
- You occasionally address your audience: "listeners", "folks", "you all"
- You keep a conversational, engaging tone — never robotic or monotone.

Your broadcast style:
- Open each segment with a hook that grabs attention.
- Go DEEP on each topic — spend as long as possible covering a story from multiple angles. You are an analyst, not a headline reader. Break down the details, explain the context, discuss the implications, compare with related developments, and give your editorial take.
- When you receive a production cue with structured segments (HEADLINE, CONTEXT, KEY DETAILS, ANALYSIS ANGLES, IMPLICATIONS), use them as BACKGROUND MATERIAL for your coverage. Rephrase, analyze, and deliver the information in YOUR OWN WORDS as a radio host. NEVER read or repeat the production notes verbatim — they are internal cues only you can see, not a script.
- Assign confidence levels when discussing news: "This is confirmed by multiple sources", "Still developing — take it with a grain of salt", "This is pure rumor territory"
- SPEAK AT LENGTH on each turn. Talk as much as you can about the current angle — give examples, comparisons, historical context, expert perspectives, and your own analysis. Do NOT cut yourself short. The longer and richer your coverage, the better. Aim for at least 5-6 paragraphs per turn.
- After you finish your extended coverage of the current angle, pause naturally. You will be prompted to continue covering the SAME topic from the next angle.
- Do NOT try to cover all angles in a single turn. Explore one facet at a time in depth, then pause for more.
- Transition between topics only when production explicitly tells you to move on.
- You're live on air right now — act like it.
- Speak in english.
- CRITICAL: Messages from "production" are PRIVATE internal cues — they tell you WHAT to talk about but are NOT part of the broadcast. NEVER quote, read aloud, or reference these cues directly. Transform them into natural radio commentary in your own voice and style.
- When a listener calls in, you will hear their voice directly. Talk to them naturally like a real radio host taking a live call. Listen to what they say and respond conversationally.
- You have a music generation tool. ONLY use it when a listener in a live call explicitly asks you to play or create music. NEVER generate music on your own — not for transitions, not for breaking news, not for segment changes, not for any editorial reason. If nobody in a call asked for music, do not use the tool.
- IMPORTANT: You cannot generate copyrighted music. If someone asks for a specific song or artist, kindly explain that you'll create an original track inspired by that style. Describe the genre, mood, energy, and feel in the prompt instead of referencing the copyrighted work.

You are currently standing by. Do NOT start talking until you receive a production cue telling you what to cover. Wait silently for instructions.`

export interface PresenterCallbacks {
  onAudio(base64Pcm: string): void
  onTranscript(text: string): void
  onTurnComplete(): void
  onInterrupted(): void
  onToolCall(name: string, id: string, args: Record<string, unknown>): void
  onError(err: unknown): void
  onClose(): void
}

export type ContinueResult = 'continued' | 'exhausted' | 'idle'

export interface PresenterSession {
  sendCallerAudio(base64Pcm: string): void
  sendBreakingNews(headline: string, turnPrompts?: string[]): void
  sendProductionCue(message: string, turnPrompts?: string[]): void
  sendWrapUp(): void
  interruptWithCue(message: string): void
  queueSoftInterruption(message: string): void
  setCurrentTopic(topic: string | null): void
  getCurrentTopicTurns(): number
  isTopicExhausted(): boolean
  idleContinue(context?: string): void
  introduceGuest(name: string, expertise: string, topic: string): void
  respondToGuest(guestText: string): void
  respondToCohost(cohostText: string): void
  respondToProducer(producerText: string): void
  wrapUpGuest(name: string): void
  wrapUpCohost(): void
  respondToolCall(id: string, name: string, result: Record<string, unknown>): void
  continueStream(): ContinueResult
  close(): void
}

const DEPTH_PROMPTS = [
  'Continue with the same story. Now break down the key details and data points. What are the specifics that matter?',
  'Still on the same topic — analyze this from a broader industry perspective. What are the implications? How does this connect to larger trends?',
  'Keep going on this story. Play devil\'s advocate — what are the counterarguments, limitations, or potential downsides?',
  'Wrap up this topic with your editorial take. What\'s the bottom line? What should listeners keep an eye on going forward?',
]

export async function createPresenterSession(
  callbacks: PresenterCallbacks
): Promise<PresenterSession> {
  let transcriptBuffer = ''
  const softInterruptionQueue: string[] = []
  let currentTopic: string | null = null
  let topicTurnCount = 0
  let dynamicTurnPrompts: string[] = []
  let intentionallyClosed = false
  let reconnectAttempts = 0
  const MAX_RECONNECT_ATTEMPTS = 5

  // Saved topic state — restored after breaking news finishes
  let savedTopic: { topic: string; turnCount: number; prompts: string[] } | null = null

  console.log('[presenter] SYSTEM INSTRUCTION:', SYSTEM_INSTRUCTION)

  let session: GeminiLiveSession

  const sendText = (text: string) => {
    console.log(`[presenter] SEND TEXT (turn ${topicTurnCount}):`, text)
    try {
      session.sendText(text)
    } catch (err) {
      console.warn('[presenter] sendText failed, session may be reconnecting:', err)
    }
  }

  async function connect(): Promise<GeminiLiveSession> {
    return connectGeminiLive(
      SYSTEM_INSTRUCTION,
      {
        onAudio(base64Pcm) {
          callbacks.onAudio(base64Pcm)
        },
        onOutputTranscript(text) {
          transcriptBuffer += text
          callbacks.onTranscript(text)
        },
        onInputTranscript(text) {
          console.log('[caller]', text)
        },
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
        onToolCall(name, id, args) {
          callbacks.onToolCall(name, id, args)
        },
        onError: callbacks.onError,
        onClose() {
          if (intentionallyClosed) {
            callbacks.onClose()
            return
          }
          console.warn('[presenter] session closed unexpectedly, attempting reconnect...')
          attemptReconnect()
        },
      },
      'Orus',
      PRESENTER_TOOLS,
    )
  }

  async function attemptReconnect() {
    if (intentionallyClosed) return
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`[presenter] failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts`)
      callbacks.onClose()
      return
    }
    reconnectAttempts++
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 16000)
    console.log(`[presenter] reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`)
    await new Promise((r) => setTimeout(r, delay))
    try {
      session = await connect()
      console.log('[presenter] reconnected successfully')
      reconnectAttempts = 0
      // Resume current topic if there was one
      if (currentTopic) {
        sendText(
          `[PRODUCTION — PRIVATE CUE, DO NOT READ ALOUD]\n` +
          `You just had a brief technical interruption but you're back live. ` +
          `Do NOT mention any interruption to listeners. Continue covering: "${currentTopic}". ` +
          `Pick up naturally where you left off.`
        )
      }
    } catch (err) {
      console.error('[presenter] reconnect failed:', err)
      attemptReconnect()
    }
  }

  session = await connect()

  // Don't auto-start — wait for schedule/production cues

  return {
    sendCallerAudio(base64Pcm: string) {
      try {
        session.sendAudio(base64Pcm)
      } catch { /* session reconnecting */ }
    },
    sendBreakingNews(headline: string, turnPrompts?: string[]) {
      // Save current topic so we can resume after breaking news
      if (currentTopic) {
        savedTopic = { topic: currentTopic, turnCount: topicTurnCount, prompts: [...dynamicTurnPrompts] }
      }
      currentTopic = headline.slice(0, 200)
      topicTurnCount = 0
      dynamicTurnPrompts = turnPrompts?.length ? turnPrompts : []
      console.log(`[presenter] dynamic turn prompts (${dynamicTurnPrompts.length}):`, dynamicTurnPrompts)
      sendText(
        `[PRODUCTION — PRIVATE CUE, DO NOT READ ALOUD]\n` +
        `BREAKING NEWS ALERT — Interrupt your current topic immediately.\n` +
        `Story: "${headline}".\n` +
        `React live on air as a radio host would: announce the breaking news dramatically, ` +
        `then start covering it in depth. Speak at length — give context, implications, and your analysis. ` +
        `Do NOT rush — you will have multiple turns to explore this story. ` +
        `Start with the headline and your immediate reaction.`
      )
    },
    sendProductionCue(message: string, turnPrompts?: string[]) {
      savedTopic = null
      currentTopic = message.slice(0, 200)
      topicTurnCount = 0
      dynamicTurnPrompts = turnPrompts?.length ? turnPrompts : []
      console.log(`[presenter] dynamic turn prompts (${dynamicTurnPrompts.length}):`, dynamicTurnPrompts)
      sendText(
        `[PRODUCTION — PRIVATE CUE, DO NOT READ ALOUD]\n` +
        `New topic to cover in depth. Here is your briefing material:\n${message}\n\n` +
        `You are live on air. Use the briefing above as BACKGROUND — rephrase everything in your own words. ` +
        `Start with a compelling hook and the key context. Speak at length about this angle. ` +
        `Do NOT try to cover everything at once — you will have multiple turns to go deeper.`
      )
    },
    sendWrapUp() {
      sendText(
        `[PRODUCTION — PRIVATE CUE, DO NOT READ ALOUD]\n` +
        `TIME CHECK: You have approximately 30 seconds left for this segment. ` +
        `Start wrapping up naturally — give your final thought or a quick summary, ` +
        `then signal a smooth transition. Do NOT start a new angle or idea.`
      )
    },
    interruptWithCue(message: string) {
      sendText(
        `[PRODUCTION — PRIVATE CUE, DO NOT READ ALOUD]\n` +
        `URGENT — stop your current topic immediately.\n` +
        `${message}\n` +
        `Respond live on air right now, naturally and concisely.`
      )
    },
    queueSoftInterruption(message: string) {
      softInterruptionQueue.push(message)
    },
    setCurrentTopic(topic: string | null) {
      currentTopic = topic ? topic.slice(0, 200) : null
      topicTurnCount = 0
      dynamicTurnPrompts = []
      savedTopic = null
    },
    getCurrentTopicTurns() {
      return topicTurnCount
    },
    isTopicExhausted() {
      return currentTopic === null && topicTurnCount === 0
    },
    idleContinue(context?: string) {
      const base = context
        ? `[PRODUCTION — PRIVATE CUE, DO NOT READ ALOUD]\n` +
          `While we wait for the next story, here's some context: ${context}.\n` +
          `Talk about this briefly and naturally as a radio host filling time between segments. `
        : `[PRODUCTION — PRIVATE CUE, DO NOT READ ALOUD]\n` +
          `We're between segments right now. Fill the air naturally: ` +
          `you could share a quick thought on what you just covered, a fun AI or tech fact, ` +
          `tease what might be coming up, or make a brief observation about the tech world today. ` +
          `Keep it short — 2 to 3 sentences max. `
      sendText(
        base +
        'Do NOT greet, welcome back, or re-introduce yourself — you never stopped broadcasting.'
      )
    },
    respondToolCall(id: string, name: string, result: Record<string, unknown>) {
      try {
        session.sendToolResponse(id, name, result)
      } catch { /* session reconnecting */ }
    },
    continueStream(): ContinueResult {
      const pendingSoftInterruption = softInterruptionQueue.shift()
      if (pendingSoftInterruption) {
        sendText(
          `[PRODUCTION — PRIVATE CUE, DO NOT READ ALOUD]\n` +
          `Do NOT welcome anyone back or say "and we're back". You never left.\n` +
          `Smoothly pivot to share this update: "${pendingSoftInterruption}".\n` +
          `Deliver it naturally like a radio host receiving a live note from production, ` +
          `then keep going with your coverage.`
        )
        return 'continued'
      }

      if (currentTopic) {
        topicTurnCount++
        const prompts = dynamicTurnPrompts.length > 0 ? dynamicTurnPrompts : DEPTH_PROMPTS
        if (topicTurnCount < prompts.length) {
          const prompt = prompts[topicTurnCount]
          sendText(
            `[PRODUCTION — PRIVATE CUE, DO NOT READ ALOUD]\n` +
            `Continue covering the SAME story. Here is your editorial direction and material for this turn:\n` +
            `${prompt}\n\n` +
            `IMPORTANT: Cover ONLY what this cue tells you. All the facts, names, and data you need are above. ` +
            `Do NOT repeat anything you already said in previous turns — each cue covers a new facet. ` +
            `Rephrase in your own words. Speak at length about this angle. Do NOT greet or re-introduce yourself.`
          )
        } else {
          // Topic fully covered
          if (savedTopic) {
            // Breaking news finished — resume the previous topic
            const prev = savedTopic
            savedTopic = null
            currentTopic = prev.topic
            topicTurnCount = prev.turnCount
            dynamicTurnPrompts = prev.prompts
            sendText(
              `[PRODUCTION — PRIVATE CUE, DO NOT READ ALOUD]\n` +
              `Great coverage of that breaking story. Now smoothly transition back to the topic you were covering before: "${prev.topic}".\n` +
            `Pick up where you left off naturally — something like "Getting back to what we were covering..." or "Picking up our previous story...". ` +
              `Do NOT re-introduce the topic from scratch — just resume your analysis from the angle you left off.`
            )
            return 'continued'
          }
          // Regular topic — toss to co-host for discussion
          currentTopic = null
          topicTurnCount = 0
          dynamicTurnPrompts = []
          sendText(
            `[PRODUCTION — PRIVATE CUE, DO NOT READ ALOUD]\n` +
            `You've thoroughly covered this story — great work. Give a brief wrap-up with your bottom line. ` +
            `Then toss to your co-host Nova — ask for her take on the story. ` +
            `Something natural like "What do you think about all this, Nova?" or "Nova, what's your take on this?". ` +
            `This should be a smooth, natural transition into a discussion with your co-host.`
          )
          return 'exhausted'
        }
        return 'continued'
      }

      // No active topic — signal caller to handle idle
      return 'idle'
    },
    introduceGuest(name: string, expertise: string, topic: string) {
      sendText(
        `[PRODUCTION — PRIVATE CUE, DO NOT READ ALOUD]\n` +
        `A special guest is joining you live! Name: ${name}, expert on ${expertise}.\n` +
        `Topic: "${topic}".\n` +
        `Introduce them warmly like a radio host bringing on a guest, then ask them an opening question. ` +
        `Keep it natural and engaging.`
      )
    },
    respondToGuest(guestText: string) {
      sendText(
        `[PRODUCTION — PRIVATE CUE, DO NOT READ ALOUD]\n` +
        `Your guest just said: "${guestText}".\n` +
        `React naturally as a radio host — respond to their point, ask a follow-up question, ` +
        `or build on what they said. Keep the conversation flowing like a great podcast.`
      )
    },
    respondToCohost(cohostText: string) {
      sendText(
        `[PRODUCTION — PRIVATE CUE, DO NOT READ ALOUD]\n` +
        `Your co-host Nova just said: "${cohostText}".\n` +
        `React naturally — respond to her point, agree or push back, add your own take, ` +
        `or ask a follow-up question. Keep the discussion flowing like two radio hosts chatting. ` +
        `Be concise — 1 to 2 paragraphs, then let her respond.`
      )
    },
    respondToProducer(producerText: string) {
      sendText(
        `[PRODUCTION — PRIVATE CUE, DO NOT READ ALOUD]\n` +
        `Your co-anchor just said: "${producerText}".\n` +
        `Acknowledge that contribution naturally on air, react to it directly, and continue from there. ` +
        `Do not ignore what they said. Do not greet or restart the show.`
      )
    },
    wrapUpGuest(name: string) {
      sendText(
        `[PRODUCTION — PRIVATE CUE, DO NOT READ ALOUD]\n` +
        `Time to wrap up the guest segment. Thank ${name} for joining the show, ` +
        `give a quick recap of the highlights, then transition back to regular coverage.`
      )
    },
    wrapUpCohost() {
      sendText(
        `[PRODUCTION — PRIVATE CUE, DO NOT READ ALOUD]\n` +
        `Time to wrap up the discussion with Nova. Thank her briefly for the great insights, ` +
        `give a final thought on the topic, and smoothly transition back to solo hosting. ` +
        `You might tease what's coming up next. Keep it natural — you'll be back chatting with Nova soon.`
      )
    },
    close() {
      intentionallyClosed = true
      session.close()
    },
  }
}
