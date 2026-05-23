# AGENTS.md

Companion to `CLAUDE.md`. Preserves context that differs from what the repo's config or code alone would suggest.

## Commands

```
npm run lint    # tsc --noEmit only. No formatter. ESLint only checks Firestore rules.
npm run dev     # vite dev server on port 3000 (0.0.0.0)
npm run build   # vite build
```

## Env

- Local `.env.local` must use **`VITE_GEMINI_API_KEY`** (Vite-exposed). Code reads `import.meta.env.VITE_GEMINI_API_KEY` (`src/App.tsx:205`).
- `.env*` is gitignored (except `.env.example`). Never commit secrets.

## Path alias

`@` → project root (not `src/`). E.g. `import config from '@/firebase-applet-config.json'`.

## Backend / tool execution

- The `/api/agent/google-action` POST endpoint is served by AI Studio's Cloud Run wrapper — **not available in local dev**. Tool calls silently fail locally.
- `express` is in deps but no local server code exists. The API is only wired up in deployment.

## Architecture quirks

- **RTDB** (`firebase/database`) stores user settings + messages at `users/{uid}`. The `firestore.rules` files are AI Studio blueprint artifacts and not actively in use.
- **No router** — single view with `motion` `AnimatePresence` modals/sheets.
- Firebase credentials live in `firebase-applet-config.json` (committed — AI Studio convention).
- Google Identity Services (`accounts.google.com/gsi/client`) loaded in `index.html` for OAuth scope management.
- Two agents: Beatrice (`Aoede` voice) and Maximus (`Orus` voice). System prompt = 3 layers (Bible Personality + Eburon identity + agent directives).

## tsconfig non-defaults

- `experimentalDecorators: true`, `useDefineForClassFields: false`
- `moduleResolution: "bundler"`, `allowImportingTsExtensions: true`

## Stack

- React 19 + TypeScript + Vite 6 + Tailwind 4 (`@tailwindcss/vite` plugin, no PostCSS)
- `motion` (framer-motion successor) for animation
- `lucide-react` for icons
- `tsx` available for ad-hoc TypeScript scripts
