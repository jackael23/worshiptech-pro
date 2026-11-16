# Worship Tech Pro

Church presentation web app (EasyWorship-like) for Filipino churches: songs, Bible, projection,
lineup schedule, phone remote, themes, Stage screen with chords for musicians, plus an AI chat
and guides for EasyWorship volunteers. Owner: Jack (solo developer).

Keep this file up to date as work progresses (see "Progress log" at the bottom).

## Business plan (freemium subscription)

- **Free:** songs, Bible, projection
- **Paid:** phone remote, lineup schedule, cloud sync
- **Pricing:** ~₱299/month Basic, ₱599–799/month Pro, yearly discount
- **Payments:** PayMongo / GCash
- **Data:** keep CouchDB; cloud sync comes later (today it is local / bring-your-own CouchDB only)
- **Content:** bundle only public-domain hymns and Bibles. Churches add their own copyrighted
  lyrics under their own CCLI license. Never commit copyrighted lyrics.

## Stack

- React 19 + TypeScript + Vite 6 + Tailwind 4, `lucide-react` icons, `motion`
- Express server (`server.ts`, run with `tsx`) serves Vite in dev and `dist/` in prod, port 3000
- PouchDB in the browser (IndexedDB), optional live sync to CouchDB
- Gemini (`@google/genai`) for the chat tab; works without a key (offline answers)
- Firebase Hosting config exists for a static-only deploy (no local server there)

## Commands

- `npm run dev` — Express + Vite on http://localhost:3000
- `npm run lint` — `tsc --noEmit` (the only automated check; there is no test suite)
- `npm run build` / `NODE_ENV=production npm start`

## Layout

- `server.ts` — Express: `/api/chat` (rate limited), `/api/health`, `/api/app/presence` (auto-stop)
- `remoteServer.ts` — phone remote bridge over SSE, PIN login, host routes are localhost-only (`isLocal`)
- `src/main.tsx` — picks the page by URL: `?output=main` projector, `?output=stage` Stage screen,
  `?remote` phone remote, else `App`. Each is a lazy chunk.
- `src/App.tsx` — shell, tabs (simulator / chat / guides / shortcuts), live state, appearance
- `src/components/WorkflowCanvasSimulator.tsx` — the main operator screen (Library → Schedule → Live)
- `src/lib/couchSync.ts` — the 4 PouchDB databases (songs, bibles, presentations, media), settings,
  CouchDB session login (`POST /_session`, cookie, password never stored), live two-way sync
- `src/components/CouchSyncPanel.tsx` — sync settings + login UI, shown in each Library tab
- `src/lib/scheduleStore.ts` — schedule saved in local PouchDB `wtp-schedule` (not synced)
- `src/lib/remoteLink.ts` — laptop ("host") side of the phone remote
- `bibles/` — public-domain Bible files (`.wtp-bible.json`)

## Conventions

- UI text is Tagalog / Taglish; code comments are English.
- Notable changes get a dated comment at the spot (`// 2026-11-09: why`), usually with the reason.
- Commit messages are short, often Taglish, describing the user-visible change.
- Stores in `src/lib/` are plain modules (no state library); pure helpers are kept free of DOM/storage.
- Validate everything read from storage or the network (see `sanitizeSong`, `cleanCmd`).
- Theme uses the "Sanctuary" design tokens (`bg-canvas`, `text-fg`, `bg-accent`, `bg-live`, …) —
  no hard-coded colors.

## Auth and subscriptions (in progress)

Goal: login with CouchDB's built-in auth (`_users` + `/_session` cookie), designed so a
subscription plan can be attached to each account later.

Design rules agreed so far / proposed (update when confirmed):

- A user can edit their own `_users` doc, except `roles` (admin only). So the plan must live in
  **roles** (e.g. `plan:basic`, `plan:pro`), never in a field the user can write.
- Roles come back in `GET /_session` (`userCtx.roles`), so the client reads the plan from there
  and CouchDB itself can enforce it on cloud databases (`_security`).
- Client-side gating is UX only. Real enforcement must be server-side.
- Free features must keep working with no login and no internet.

## Progress log

- 2026-11-16: Project context saved. Reviewed the codebase and proposed the login plan
  (awaiting Jack's answers before coding).
