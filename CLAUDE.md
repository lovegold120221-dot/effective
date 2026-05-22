# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```
npm run dev       # Start dev server on port 3000 (exposes 0.0.0.0)
npm run build     # Production build via Vite
npm run preview   # Preview production build locally
npm run lint      # Type-check only (tsc --noEmit) — no separate linter
npm run clean     # Remove dist/
```

## Architecture

Vep is a browser-based voice agent app that connects to the Gemini Live API for real-time spoken conversation. It runs as a single-page React app with no router and a single primary component tree.

### Stack

- **Frontend**: React 19 + TypeScript + Vite 6 + Tailwind CSS 4 + Motion (animation library)
- **Backend services**: Firebase Auth (Google sign-in), Firebase Realtime Database (user settings + chat history)
- **AI**: `@google/genai` — Gemini Live bidirectional audio streaming (`gemini-3.1-flash-live-preview`)
- **Audio**: Custom PCM16 recording/playback via Web Audio API (`src/lib/audio.ts`)

### Source layout

| File | Role |
|---|---|
| `src/main.tsx` | React entry point, mounts `<App />` |
| `src/App.tsx` | Entire application — auth gate, agent UI, session management, tool execution, visual input, settings (~1400 lines) |
| `src/firebase.ts` | Firebase init (Auth + RTDB), exports `auth`, `rtdb`, `handleDatabaseError` |
| `src/lib/audio.ts` | `AudioRecorder` (mic → PCM16 base64 chunks) and `AudioStreamer` (PCM16 base64 → Web Audio playback) |
| `src/lib/personality.ts` | `BIBLE_PERSONALITY` — the base human-like speech prompt all agents share |
| `src/index.css` | Tailwind import only |

### Key architectural patterns

**Authentication**: App is gated by Firebase Google Auth. The `App` component shows a login screen until `onAuthStateChanged` resolves. On first login, user doc is created at `users/{uid}` with default settings. RTDB stores per-user messages at `users/{uid}/messages` (last 20 loaded).

**Agent system**: Two voice agents — Beatrice (default, female `Aoede` voice) and Maximus (male `Orus` voice). Each has a stored system prompt with tone/behavior rules. The final system instruction sent to Gemini is assembled from three layers: 1) Bible Personality (base human speech rules), 2) Normal Human Presence Layer (Eburon identity + dialect safety), 3) Active Agent Directives (agent-specific persona). User-editable via settings panel.

**Session lifecycle**: `startSession()` creates a Gemini Live connection with audio-only response modality. A `ScriptProcessorNode`-based recorder streams PCM16 chunks upstream; the API returns audio chunks played through `AudioStreamer`. The Web Speech API provides text transcripts displayed in the UI. Silence timers trigger soft nudges from the agent.

**Visual input**: Camera (front/back via `getUserMedia`) and screen sharing (`getDisplayMedia`) capture frames at ~1.2 FPS via a canvas → JPEG base64 loop, sent as `sendRealtimeInput` video frames. `visualMode` state tracks `'off' | 'front' | 'back' | 'screen'`.

**Tool calling**: Gemini can call `execute_google_service` with `{serviceName, action, details}`. These POST to `/api/agent/google-action` with the Firebase auth token. Results are surfaced in a modal + task list. Manual tool test buttons exist in settings. Four tool toggles: `gmail`, `drive`, `context`, `vision`.

**Configuration**: `firebase-applet-config.json` holds Firebase credentials (committed — this is expected for the AI Studio platform). `.env.local` needs `GEMINI_API_KEY` (injected at build time via Vite `define`). The Vite config aliases `@` to the project root.

### Key constraints

- No router — the entire app is a single view with modals/sheets for settings, sidebar memory, and visual page
- Video frame capture uses a canvas intermediary (not direct MediaStreamTrack), limited to JPEG quality 0.55 at ~1.2 FPS
- Audio playback uses a simple queue with sequential buffer scheduling, not perfect gapless playback
- Settings are persisted to RTDB on every save; loaded on auth state change
