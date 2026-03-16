# Pulse — AI-Powered Live Radio

> A fully autonomous AI radio station that broadcasts 24/7, monitors real-time news, and takes live caller interactions — built for the **Google Gemini Live Agent Challenge** (Live Agents category).

Pulse is not a chatbot. It is a persistent, streaming media system: a complete radio newsroom in code form. An AI presenter named **Pulse** speaks continuously with editorial personality, covering AI, startups, and technology. News agents scan sources in real time, an editorial pipeline curates and enriches stories, a schedule planner fills the day, and listeners can call in live to challenge, question, or redirect the broadcast.

---

## Table of Contents

- [Key Features](#key-features)
- [Architecture](#architecture)
- [The Agent System](#the-agent-system)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [API Reference](#api-reference)
- [WebSocket Protocol](#websocket-protocol)
- [Frontend](#frontend)
- [Deployment](#deployment)

---

## Key Features

### Continuous Streaming Broadcast
Pulse speaks without stopping. The presenter maintains a coherent narrative across topics, transitions naturally between stories, references earlier coverage, and adapts tone to urgency. Audio streams as 24kHz 16-bit PCM over WebSocket to all connected listeners simultaneously.

### Real-Time News Monitoring
Four independent scouts poll news sources in parallel:
- **RSS Scanner** — TechCrunch, The Verge, and configurable feeds
- **Reddit Scout** — r/MachineLearning, r/artificial, scored by upvote velocity
- **Trending Scout** — Google Search grounding via Gemini for emerging stories
- **NewsData Scanner** — NewsData.io API with image-first filtering

Candidates flow into an **Editor Agent** that deduplicates (embedding-based cosine similarity), assigns confidence levels (confirmed / developing / rumor), detects breaking news, and prioritizes by relevance.

### Deep Story Enrichment
Every editorial brief passes through an **Article Enricher** that fetches all source URLs, extracts content, and generates a structured report:
- 4–8 sentence broadcast summary
- Key findings with specific facts, numbers, and dates
- 3–5 analysis angles (implications, controversies, comparisons)
- **10–15 sequential turn prompts** — non-overlapping mini-briefs that guide the presenter through a multi-minute deep dive without repeating a single fact

If source content is thin, a **Research Agent** automatically performs a Google Search deep-dive to supplement.

### Autonomous Scheduling
A **Schedule Planner Agent** generates the next 2–3 hours of programming from available briefs and music tracks. It produces a mix of topic blocks, music transitions, guest interviews, and call-in segments — respecting narrative continuity, avoiding topic repetition, and alternating formats. The planner runs automatically after each editorial cycle, adapting to new stories as they arrive.

An **Auto-Pilot** orchestrates the full pipeline: scan every 60 minutes, process into briefs, deduplicate, enrich, plan schedule, and inject the highest-priority story if the presenter is idle.

### Live Caller Integration
Listeners connect from the webapp via microphone (or camera). The system routes calls based on line status:
- **Lines open** (during scheduled call-in segments): caller audio goes directly to the presenter's Gemini Live session. Pulse hears the caller in real time, responds naturally, and integrates the interaction on-air with full barge-in support.
- **Lines closed**: a **Screener Agent** (voice: Kore) greets the caller, records a voicemail, and stores the transcript for the admin. Screener audio is private — it never reaches the broadcast.

### Expert Guest Segments
The admin (or schedule planner) can launch a guest expert interview. A second Gemini Live session is created with a distinct voice and personality. Presenter and guest exchange turns naturally — each hearing the other's transcript and responding conversationally — until the segment ends.

### Co-Host Discussions
After the presenter exhausts all turn prompts for a story, a co-host named **Nova** (voice: Leda) automatically joins. They exchange takes on the topic for up to 3 turns — agreeing, pushing back, adding angles — before the presenter wraps up. This prevents dead air and adds editorial depth between stories.

### AI Music Generation
Powered by Google's **Lyria RealTime API**. When a caller explicitly requests music during a live call, the presenter invokes a tool that generates an original instrumental track. The prompt is first enhanced by an LLM to avoid copyright issues, then sent to Lyria. Output is downsampled from 48kHz stereo to 24kHz mono WAV for broadcast compatibility.

Pre-generated tracks can also be scheduled as transition blocks between news segments.

### Daily Music Scheduler
A **Music Scheduler** generates a fresh library of 10 tracks every day at 3 AM, cycling through 20 predefined radio styles (ambient, lo-fi, jazz, synthwave, etc.). Tracks are generated sequentially via Lyria with a 5-second cooldown between each to respect rate limits. The admin can also trigger a batch manually from the Music Library header. This ensures the station always has varied, recent music for transitions without human intervention.

### Wrap-Up Warning and Fill Music
The scheduler tracks the remaining time in every topic and guest block. **30 seconds before a block ends**, it sends a private wrap-up cue to the presenter ("You have ~30 seconds, start wrapping up"), giving Pulse time to close the segment gracefully instead of being cut off mid-sentence.

If the content finishes early (the co-host wraps up, the guest leaves, or the presenter exhausts all turn prompts), the scheduler calculates the remaining block time and **automatically plays a random track from the music library as fill music**. The fill stops cleanly when the next block begins.

### Editorial Control Room
A full admin panel provides real-time control:
- **Live transcript** with role-colored entries (presenter, caller, guest, co-host, system)
- **Injection controls** — send breaking news, soft notes, or co-anchor cues
- **News desk** — scan sources, filter briefs by status, research stories, send to air
- **NLE-style schedule timeline** — drag-and-drop blocks, zoom, playhead tracking, auto-generate
- **Music library** — browse generated tracks, preview, add to schedule

### Immersive Listener Experience
The frontend is a full-screen dark-theme radio player with:
- Animated organic blob visualizer (canvas-based, beat-reactive)
- Glass morphism UI with ambient vermillion glow
- Now Playing card with confidence badges and source attribution
- Horizontal breaking news ticker
- News image overlay with carousel for multi-image stories
- Call-in flow: setup modal, full-screen connecting animation, floating live call panel

---

## Architecture

```
                          ┌─────────────────────────────┐
                          │      Web Frontend            │
                          │  Next.js 16 · React 19 · TS  │
                          └──────────────┬──────────────┘
                                         │ WebSocket
                          ┌──────────────▼──────────────┐
                          │      Agent Server            │
                          │   Hono · TypeScript · Node    │
                          ├─────────────────────────────┤
                          │                              │
                          │  Gemini Live Sessions        │
                          │  ├─ Presenter (Pulse/Orus)   │
                          │  ├─ Co-Host (Nova/Leda)      │
                          │  ├─ Guest (configurable)     │
                          │  └─ Screener (Kore)          │
                          │                              │
                          │  News Agents                 │
                          │  ├─ RSS Scanner              │
                          │  ├─ Reddit Scout             │
                          │  ├─ Trending Scout           │
                          │  ├─ NewsData Scanner         │
                          │  ├─ Editor Agent             │
                          │  ├─ Research Agent           │
                          │  ├─ Article Enricher         │
                          │  └─ News Dedup (embeddings)  │
                          │                              │
                          │  Orchestration               │
                          │  ├─ Auto-Pilot               │
                          │  ├─ Schedule Planner         │
                          │  ├─ Scheduler (15s loop)     │
                          │  └─ Daily Memory (.md logs)  │
                          │                              │
                          │  Media                       │
                          │  ├─ Music Player (WAV)       │
                          │  └─ Music Generator (Lyria)  │
                          │                              │
                          └──────────┬──────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
              Google APIs      External APIs    File Storage
              ├─ Gemini Live   ├─ RSS Feeds     ├─ schedules/
              ├─ Gemini Pro    ├─ Reddit JSON   ├─ news/
              ├─ Gemini Flash  ├─ NewsData.io   ├─ stations/
              ├─ Lyria Music   │                └─ media/
              ├─ Google Search │
              └─ Embeddings    │
```

### How It All Connects

The system is split into two fully independent services — a **Next.js frontend** and a **Hono backend** — connected through a single WebSocket that carries four types of real-time data: PCM audio, transcript entries, caller audio, and status updates. Everything below describes what lives inside each layer.

#### Web Frontend

The listener-facing page is a full-screen dark radio player with an animated organic blob visualizer, a play/pause + volume bar, a "Now Playing" card showing the current story (with confidence badge and source attribution), a horizontal breaking news ticker, and an image overlay carousel for stories that include visuals. The call-in flow lets a listener pick a name, choose audio or video mode, see a connecting animation, and then talk to the presenter through a floating live-call panel with waveform, timer, and mute/camera controls.

The admin panel is a separate route (`/admin`) with five control areas: a live transcript feed color-coded by role, injection buttons (breaking news, soft note, co-anchor cue), a news desk to scan sources and manage editorial briefs, an NLE-style schedule timeline with drag-and-drop blocks, zoom, and playhead, and a music library for browsing, previewing, and scheduling AI-generated tracks.

#### WebSocket Layer

A single persistent WebSocket at `/ws/radio` handles everything:

- **Audio** (server → client) — PCM 24kHz 16-bit mono chunks, base64-encoded. The listener page decodes and plays them through the Web Audio API.
- **Transcripts** (server → client) — every spoken sentence with its role (pulse, caller, guest, cohost, producer, system) for the live rolling transcript.
- **Caller audio** (client → server) — PCM 16kHz from the listener's microphone when they call in.
- **Status updates** (bidirectional) — radio state changes, schedule updates, call-line status, guest/co-host session events, and image payloads for visual overlays.

#### Agent Server — Gemini Live Sessions

Four concurrent Gemini Live API sessions run inside the backend, each with a distinct personality and voice:

- **Presenter (Pulse, voice: Orus)** — the main host. Receives editorial briefs as production cues, speaks continuously, handles caller audio with barge-in, and coordinates with the co-host and guest sessions. This session is always active while the radio is on.
- **Co-Host (Nova, voice: Leda)** — a secondary voice that joins automatically when the presenter finishes all turn prompts for a topic. They exchange up to 3 turns of editorial banter (agreeing, challenging, adding angles) before handing back.
- **Guest (configurable voice)** — launched by the admin or schedule planner for expert interview segments. A separate Gemini Live session with a custom system instruction describing the guest's expertise and personality.
- **Screener (Kore)** — active when call-in lines are closed. Greets callers privately, records a voicemail, and stores the transcript for the admin. Its audio never reaches the broadcast.

All four sessions use the `gemini-live-2.5-flash-native-audio` model with affective dialog enabled.

#### Agent Server — News Agent Pipeline

News flows through four stages:

1. **Scouts** — four independent agents poll external sources in parallel:
   - *RSS Scanner* parses configured feeds (TechCrunch, The Verge, etc.) using `rss-parser` and filters by URL to avoid duplicates.
   - *Reddit Scout* hits the public Reddit JSON API for monitored subreddits and scores posts by upvote velocity to detect trending discussions.
   - *Trending Scout* uses Gemini 3.1 Flash Lite with the `googleSearch` grounding tool to surface stories that are gaining traction on the open web.
   - *NewsData Scanner* queries the NewsData.io REST API with keyword filters and prioritizes articles that include images.

2. **Editor Agent** — receives all candidates, removes duplicates via embedding-based cosine similarity (`text-embedding-004`, threshold 0.85), assigns a confidence level (confirmed / developing / rumor), detects whether a story qualifies as breaking news, and ranks everything by relevance and urgency. Uses `gemini-3.1-pro-preview` for complex editorial reasoning.

3. **Article Enricher** — fetches every source URL from the brief, extracts the page content, and generates a structured broadcast report: a 4–8 sentence summary, key findings with dates and numbers, 3–5 analysis angles, and **10–15 sequential turn prompts** — non-overlapping mini-briefs that guide the presenter through a multi-minute deep dive. Uses `gemini-3.1-flash-lite-preview`.

4. **Research Agent** — activated when the enricher determines source content is too thin. Performs a Google Search deep-dive via Gemini's grounding tool and feeds the results back into the enrichment report.

#### Agent Server — Orchestration

Three components keep the station running autonomously:

- **Auto-Pilot** — a timer-based orchestrator that fires every 60 minutes. It triggers all scouts, runs the editor pipeline, enriches new briefs, invokes the schedule planner, and injects the highest-priority story if the presenter is idle.
- **Schedule Planner** — an AI agent (`gemini-3.1-pro-preview` with structured JSON output) that generates the next 2–3 hours of programming. It mixes topic blocks, music transitions, guest interviews, and call-in segments, respecting narrative continuity and avoiding topic repetition.
- **Scheduler** — a tight 15-second execution loop that walks the timeline, starts each block when its time arrives, and advances the playhead. It coordinates with the presenter, music player, and guest/co-host sessions. It also sets a **wrap-up timer** for topic and guest blocks: 30 seconds before the block ends, it sends a private cue to the presenter so Pulse can close the segment naturally. If content finishes early (co-host wraps, guest leaves, turn prompts exhausted), the scheduler calculates remaining time and plays a **random fill music track** from the library until the next block starts.
- **Music Scheduler** — generates 10 fresh tracks daily at 3 AM using Lyria, cycling through 20 radio styles (ambient, lo-fi, jazz, synthwave, etc.). Runs sequentially with a 5-second cooldown between tracks. Can also be triggered manually via the admin panel.

A **Daily Memory** module writes a Markdown log of each day's show: topics covered, caller interactions, music played, and key moments. This file is loaded into the presenter's context the next day for editorial continuity.

#### Agent Server — Media

- **Music Player** — streams pre-generated WAV files (24kHz mono) into the audio output, mixed alongside the presenter voice. Used for transitions, intros, scheduled music blocks, and automatic fill music when content ends early.
- **Music Generator** — connects to Google's **Lyria RealTime API** to generate original instrumental tracks on demand. The raw prompt is first enhanced by an LLM to improve musical quality and avoid copyright patterns, then sent to Lyria. Output is downsampled from 48kHz stereo to 24kHz mono for broadcast compatibility.
- **Music Scheduler** — batch generator that produces 10 tracks daily at 3 AM across 20 radio styles. Ensures the station always has fresh, varied music without manual intervention.

#### Google AI APIs

| API | Role in the system |
|-----|-------------------|
| **Gemini Live API** (`gemini-live-2.5-flash-native-audio`) | All real-time audio — presenter, co-host, guest, screener |
| **Gemini 3.1 Pro** (`gemini-3.1-pro-preview`) | Editor Agent (editorial reasoning), Schedule Planner (structured output) |
| **Gemini 3.1 Flash Lite** (`gemini-3.1-flash-lite-preview`) | Article Enricher, Research Agent, Trending Scout (fast inference) |
| **Text Embeddings** (`text-embedding-004`) | News deduplication via cosine similarity |
| **Lyria RealTime** (`lyria-realtime-exp`) | AI music generation |
| **Google Search** (grounding tool) | Trending Scout + Research Agent web lookups |

#### External Data Sources

| Source | Protocol | Used by |
|--------|----------|---------|
| RSS Feeds (TechCrunch, The Verge, etc.) | HTTP/XML | RSS Scanner |
| Reddit | Public JSON API | Reddit Scout |
| NewsData.io | REST API (key required) | NewsData Scanner |
| Google Search | Gemini grounding tool | Trending Scout, Research Agent |

#### File-Based Persistence

All runtime state is stored as JSON files under `agent-server/data/` (gitignored):

| Directory | Contents |
|-----------|----------|
| `schedules/` | One file per day (`YYYY-MM-DD.json`) containing the block timeline |
| `news/` | Editorial briefs, raw candidates, and embedding vectors |
| `stations/` | Station configuration (name, sources, topics, voices) |
| `media/` | Generated and uploaded WAV tracks |
| `memory/` | Daily Markdown show logs for editorial continuity |

---

## The Agent System

### News Collection (Scouts)

| Agent | Source | Model | Method |
|-------|--------|-------|--------|
| **RSS Scanner** | Configurable feeds | None | `rss-parser` library, URL dedup |
| **Reddit Scout** | Subreddits | None | Public JSON API, upvote scoring |
| **Trending Scout** | Google Search | `gemini-3.1-flash-lite-preview` | Gemini with `googleSearch` tool |
| **NewsData Scanner** | NewsData.io | None | REST API, image filtering |

### Editorial Processing

| Agent | Role | Model |
|-------|------|-------|
| **Editor Agent** | Dedup, prioritize, assign confidence, detect breaking | `gemini-3.1-pro-preview` |
| **Research Agent** | Deep-dive via Google Search when info is thin | `gemini-3.1-flash-lite-preview` + `googleSearch` |
| **Article Enricher** | Fetch sources, generate broadcast report + turn prompts | `gemini-3.1-flash-lite-preview` |
| **News Dedup** | Embedding-based cosine similarity (>0.85 = duplicate) | `text-embedding-004` |

### Orchestration

| Agent | Role | Model |
|-------|------|-------|
| **Schedule Planner** | Generate 2–3 hour schedule from briefs + tracks | `gemini-3.1-pro-preview` (structured output) |
| **Auto-Pilot** | Orchestrate scan → process → enrich → plan → inject cycle | Timer-based coordination |

### Live Audio (Gemini Live Sessions)

| Session | Voice | Role |
|---------|-------|------|
| **Presenter (Pulse)** | Orus | Main host — editorial analysis, deep dives, caller interaction |
| **Co-Host (Nova)** | Leda | Post-topic discussion partner, 3-turn exchanges |
| **Guest** | Configurable | Expert interviews with distinct personality |
| **Screener** | Kore | Voicemail attendant when lines are closed |

All live sessions use the `gemini-live-2.5-flash-native-audio` model with affective dialog enabled.

---

## Tech Stack

### Frontend (`web/`)
- **Next.js 16** (App Router, SSR, standalone output for Docker)
- **React 19** with context-based state management
- **Tailwind CSS v4** (exclusive styling — no CSS modules)
- **Lucide React** for icons
- **Web Audio API** for PCM playback at 24kHz
- **Custom fonts**: Syne, Space Grotesk, Instrument Serif

### Backend (`agent-server/`)
- **Hono** with `@hono/node-server` and `@hono/node-ws`
- **@google/genai** SDK for all Gemini interactions
- **rss-parser** for RSS feed ingestion
- **TypeScript** throughout
- **File-based JSON persistence** (schedules, briefs, stations, embeddings)

### Google AI Models Used
| Model | Purpose |
|-------|---------|
| `gemini-live-2.5-flash-native-audio` | All real-time audio sessions (presenter, guest, co-host, screener) |
| `gemini-3.1-pro-preview` | Editor Agent, Schedule Planner (complex reasoning) |
| `gemini-3.1-flash-lite-preview` | Enricher, Research, Trending Scout (fast inference) |
| `text-embedding-004` | News deduplication via cosine similarity |
| `lyria-realtime-exp` | AI music generation |

---

## Getting Started

### Prerequisites

- Node.js 18+ (22 recommended)
- npm
- A Google Cloud account with Gemini API enabled
- A NewsData.io API key ([free tier available](https://newsdata.io/))

### Installation

```bash
git clone https://github.com/Abel1011/pulse-ai.git
cd pulse-ai

# Backend
cd agent-server
npm install

# Frontend
cd ../web
npm install
```

### Environment Variables

Create `agent-server/.env`:

```env
# Gemini API (required)
GOOGLE_API_KEY=your_gemini_api_key

# Vertex AI (alternative to API key)
# GOOGLE_GENAI_USE_VERTEXAI=true
# GOOGLE_CLOUD_PROJECT=your_project_id
# GOOGLE_CLOUD_LOCATION=us-central1

# Music generation — Lyria requires AI Studio key
GEMINI_API_KEY=your_ai_studio_key

# News API
NEWSDATA_API_KEY=your_newsdata_key

PORT=3001
```

### Running Locally

```bash
# Terminal 1 — Backend
cd agent-server
npm run dev

# Terminal 2 — Frontend
cd web
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:3001
- Admin panel: http://localhost:3000/admin

### Starting the Radio

1. Open the admin panel at `/admin`
2. Click **Start** to begin broadcasting
3. The auto-pilot will scan for news, process briefs, and generate a schedule
4. Open the listener page at `/` and press play to hear the stream

---

## Usage

### Admin Workflow

1. **Start radio** — begins the presenter session and auto-pilot
2. **Auto-pilot runs** — scans sources every 60 min, processes briefs, generates schedule
3. **Monitor transcript** — real-time feed of everything said on air
4. **Inject editorially** — send breaking news alerts, soft notes, or co-anchor cues
5. **Manage schedule** — drag blocks on timeline, add/edit/delete, auto-generate
6. **News desk** — manually scan, research individual briefs, send to air
7. **Launch guests** — start expert interview segments with configurable voice
8. **Music** — generate original tracks via Lyria, preview, schedule or play immediately

### Listener Experience

1. **Open the page** — dark immersive UI with animated visualizer
2. **Press play** — audio streams immediately
3. **Follow along** — now playing card, breaking news ticker, news images
4. **Call in** — click the call button, enter your name, choose audio/video, go live
5. **Talk to Pulse** — interrupt naturally (barge-in supported), debate a story, request a topic

---

## API Reference

### Radio Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/radio/start` | Start broadcasting (initializes presenter, scheduler, auto-pilot) |
| POST | `/radio/stop` | Stop broadcasting (closes all sessions, freezes schedule) |
| GET | `/radio/status` | Returns `{ presenting, listeners, transcript, guest, activeBlockType }` |
| POST | `/radio/inject` | Inject content: `{ type: 'breaking'\|'soft'\|'co-anchor', text, imageUrl?, turnPrompts? }` |
| POST | `/radio/inject-news` | Smart inject: direct if topic active, auto-creates block if idle |

### Guest Segments

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/radio/guest/start` | `{ name, expertise, topic, voice? }` — launches guest session |
| POST | `/radio/guest/stop` | Ends guest segment |
| GET | `/radio/guest/status` | Active guest details |

### News Pipeline

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/news/:stationId/scan` | Run all scouts |
| POST | `/news/:stationId/process` | Editor + enrichment pipeline |
| GET | `/news/:stationId/briefs` | List briefs (`?pending=true` for unsent only) |
| POST | `/news/:stationId/briefs/:id/research` | Deep research via Google Search |
| POST | `/news/:stationId/briefs/:id/send` | Mark as sent to air |
| POST | `/news/:stationId/briefs/:id/conclude` | Mark as concluded |

### Schedule

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/schedule/:date` | Day schedule (YYYY-MM-DD) |
| POST | `/schedule/:date/blocks` | Create block |
| PATCH | `/schedule/:date/blocks/:id` | Update block |
| DELETE | `/schedule/:date/blocks/:id` | Delete block |
| POST | `/schedule/:date/blocks/:id/execute` | Execute immediately |
| POST | `/schedule/:date/blocks/:id/skip` | Skip block |
| POST | `/schedule/:date/auto-generate` | AI-generate next 2–3 hours (`?scanFirst=true`) |

### Music

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/media/tracks` | List available WAV tracks |
| POST | `/radio/music/generate` | `{ prompt, durationSeconds?, bpm? }` — generate via Lyria |
| GET | `/radio/music/status` | Current generation status |
| GET | `/radio/music/list` | All generated tracks with metadata |
| POST | `/radio/music/play` | `{ filename }` — play track on air |
| POST | `/radio/music/generate-batch` | Trigger daily batch generation (409 if already running) |
| GET | `/radio/music/batch-status` | Batch generation progress |
| GET | `/radio/music/file/:filename` | Stream WAV file |

---

## WebSocket Protocol

Connect to `ws[s]://host/ws/radio` for bidirectional communication.

### Server to Client

| Type | Payload | Description |
|------|---------|-------------|
| `audio` | `{ data: base64 }` | PCM 24kHz 16-bit mono audio chunk |
| `transcript` | `{ text, role }` | Live transcript (roles: pulse, caller, guest, cohost, producer, system) |
| `turn-complete` | — | Presenter finished a turn |
| `interrupted` | — | Presenter was interrupted (barge-in) |
| `status` | `{ presenting, callsOpen }` | Radio state update |
| `news-image` | `{ imageUrl, imageUrls?, headline }` | Breaking news visual |
| `guest-started` | `{ name, expertise }` | Guest segment began |
| `guest-ended` | — | Guest segment ended |
| `cohost-started` | `{ name }` | Co-host discussion began |
| `cohost-ended` | — | Co-host discussion ended |
| `calls-open` / `calls-closed` | — | Call-in line status |
| `call-accepted` | `{ mode: 'live'\|'screener' }` | Caller connection established |
| `call-rejected` | `{ reason }` | Caller denied |
| `screener-audio` | `{ data: base64 }` | Private screener audio (caller only) |
| `audio-reset` | — | Flush audio queues (after producer interruption) |
| `schedule-update` | `{ blockId, block }` | Schedule changed |

### Client to Server

| Type | Payload | Description |
|------|---------|-------------|
| `call-start` | `{ name, mode }` | Initiate call |
| `caller-audio` | `{ data: base64 }` | PCM 16kHz caller audio chunk |
| `call-end` | — | Hang up |

---

## Frontend

### Design System

The UI follows an **"On Air"** design language — dark, warm, immersive:

- **Base palette**: warm blacks (#0C0A09), subtle surfaces (#1C1917), vermillion accent (#E54D2E)
- **Typography**: Syne (headlines), Space Grotesk (body), Instrument Serif (brand)
- **Glass morphism**: backdrop-blur panels for modals, controls, and overlays
- **Ambient glow**: pulsing vermillion gradients that react to broadcast state
- **Confidence badges**: green (confirmed), yellow (developing), orange (rumor)

### Key Components

| Component | Description |
|-----------|-------------|
| `AudioVisualizer` | Canvas-rendered organic blob with spectral tendrils, constellation particles, and beat-reactive pulsing |
| `RadioPlayer` | Play/pause with 12-bar VU meter volume control |
| `NowPlaying` | Current segment info with confidence badge and source list |
| `NewsTicker` | Horizontal scrolling ticker with breaking news highlight |
| `NewsImageOverlay` | Floating card with image carousel, auto-dismiss after 30s |
| `CallSetupModal` | Pre-call form (name + audio/video selection) |
| `LiveCallPanel` | Floating panel during active call with waveform, timer, mute/camera controls |
| `ScheduleTimeline` | NLE-style horizontal timeline with drag-drop, zoom, playhead, and auto-generate |
| `NewsPanel` | Editorial brief management with scan, filter, research, and inject actions |

---

## Deployment

Both services are containerized with Docker and deploy to Google Cloud Run.

### Backend

```bash
cd agent-server
gcloud run deploy pulse-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --port 3001 \
  --session-affinity \
  --min-instances 1 \
  --memory 1Gi \
  --set-env-vars "GOOGLE_API_KEY=...,NEWSDATA_API_KEY=...,GEMINI_API_KEY=..."
```

### Frontend

```bash
cd web
gcloud run deploy pulse-web \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --port 3000 \
  --set-env-vars "NEXT_PUBLIC_API_URL=https://your-backend-url.run.app"
```

The frontend reads `NEXT_PUBLIC_API_URL` at runtime (injected via server-side rendering in `layout.tsx`) and derives WebSocket URLs automatically (`https://` becomes `wss://`).

---

## Project Structure

```
pulse-ai/
├── agent-server/                    # Backend
│   ├── src/
│   │   ├── index.ts                 # Entry point, routes, WebSocket, orchestration
│   │   ├── lib/
│   │   │   ├── gemini-live.ts       # Gemini Live API wrapper
│   │   │   ├── presenter.ts         # Presenter agent (Pulse)
│   │   │   ├── cohost.ts            # Co-host agent (Nova)
│   │   │   ├── guest.ts             # Guest expert sessions
│   │   │   ├── screener.ts          # Phone screener agent
│   │   │   ├── scheduler.ts         # 15-second execution loop
│   │   │   ├── auto-pilot.ts        # News pipeline orchestrator
│   │   │   ├── music-player.ts      # WAV streaming + fill music
│   │   │   ├── music-generator.ts   # Lyria music generation
│   │   │   ├── music-scheduler.ts   # Daily batch generation (10 tracks, 20 styles)
│   │   │   ├── daily-memory.ts      # Show history (.md logs)
│   │   │   ├── news-dedup.ts        # Embedding-based deduplication
│   │   │   ├── news-store.ts        # Brief/candidate persistence
│   │   │   ├── schedule-store.ts    # Schedule persistence
│   │   │   ├── station-store.ts     # Station config
│   │   │   └── agents/
│   │   │       ├── rss-scanner.ts
│   │   │       ├── reddit-scout.ts
│   │   │       ├── trending-scout.ts
│   │   │       ├── newsdata-scanner.ts
│   │   │       ├── editor-agent.ts
│   │   │       ├── research-agent.ts
│   │   │       ├── article-enricher.ts
│   │   │       └── schedule-planner.ts
│   │   ├── routes/
│   │   │   ├── schedule.ts
│   │   │   └── news.ts
│   │   └── types/
│   │       ├── schedule.ts
│   │       ├── news.ts
│   │       └── station.ts
│   ├── data/                        # Runtime state (gitignored)
│   ├── media/                       # WAV tracks
│   └── Dockerfile
├── web/                             # Frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx           # Root layout + runtime config injection
│   │   │   ├── page.tsx             # Listener page
│   │   │   └── admin/page.tsx       # Admin control room
│   │   ├── components/
│   │   │   ├── AudioVisualizer.tsx
│   │   │   ├── RadioPlayer.tsx
│   │   │   ├── NowPlaying.tsx
│   │   │   ├── NewsTicker.tsx
│   │   │   ├── CallInButton.tsx
│   │   │   ├── LiveCallPanel.tsx
│   │   │   ├── RadioProvider.tsx
│   │   │   ├── MediaProvider.tsx
│   │   │   └── admin/
│   │   │       ├── ScheduleTimeline.tsx
│   │   │       ├── BlockEditor.tsx
│   │   │       └── NewsPanel.tsx
│   │   ├── services/
│   │   │   ├── radio-service.ts
│   │   │   └── schedule-service.ts
│   │   ├── hooks/
│   │   │   └── use-transcript-stream.ts
│   │   ├── lib/
│   │   │   └── config.ts            # Runtime API URL resolution
│   │   └── types/
│   │       ├── radio.ts
│   │       └── schedule.ts
│   └── Dockerfile
└── README.md
```

---

## License

This project was built for the Google Gemini Live Agent Challenge hackathon.
