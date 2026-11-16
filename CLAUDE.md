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

- `authServer.ts` — account routes (sign-up, config)
- `server.ts` — Express: `/api/chat` (rate limited), `/api/health`, `/api/app/presence` (auto-stop)
- `remoteServer.ts` — phone remote bridge over SSE, PIN login, host routes are localhost-only (`isLocal`)
- `src/main.tsx` — picks the page by URL: `?output=main` projector, `?output=stage` Stage screen,
  `?remote` phone remote, else `App`. Each is a lazy chunk.
- `src/App.tsx` — shell, tabs (simulator / chat / guides / shortcuts), live state, appearance
- `src/components/WorkflowCanvasSimulator.tsx` — the main operator screen (Library → Schedule → Live)
- `src/lib/couchSync.ts` — the 4 PouchDB databases (songs, bibles, presentations, media), settings,
  live two-way sync (session login itself lives in `src/lib/auth.ts`)
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

## Auth and subscriptions

Login is done and the phone remote is locked behind Basic / Pro (2026-11-16). Saved lineups
and cloud sync are not locked yet (they do not exist as paid features yet).

How it works:

- `src/lib/auth.ts` — account state (`useAuth()`), `login` / `logout` / `signup`, plus the raw
  CouchDB session calls (`couchSession`, `couchLogin`, `couchLogout`) that the sync panel shares.
  The browser talks to CouchDB `/_session` directly (HttpOnly cookie; password never stored).
- `authServer.ts` — `GET /api/auth/config` (which CouchDB, is sign-up available) and
  `POST /api/auth/signup` (creates the `_users` doc with the admin login from `.env`:
  `COUCHDB_URL`, `COUCHDB_ADMIN_USER`, `COUCHDB_ADMIN_PASSWORD`). Local-only on the laptop,
  public behind a proxy, rate limited.
- `src/lib/entitlements.ts` — `planFromRoles()` and `hasFeature(plan, feature)`. ALL feature
  gates must go through `hasFeature`. The Basic/Pro feature split in there is a placeholder.
- `src/components/AccountModal.tsx` + account button in `Header.tsx`.

Decisions (confirmed by Jack 2026-11-16):

- Login is optional. Free features must work with no account and no internet.
- One account = one church; the login name is the email (lowercased).
- The plan is a CouchDB **role** (`plan:basic`, `plan:pro`), never a doc field. Verified on
  CouchDB 3.5: a normal user cannot read or write `_users` at all, and anonymous sign-up is
  refused — hence the server route. `_admin` counts as Pro.
- Roles come back in `GET /_session`, so CouchDB can enforce them on cloud DBs (`_security`).
- Offline: last known name + roles are cached in localStorage (`wtp-auth-v1`) for 14 days.
- Client-side gating is UX only; laptop-only features (remote, schedule) can only be soft-locked.
- Phone remote lock: `useRemoteHost(onCmd, allowed)` in `remoteLink.ts` — when the plan has no
  "remote", the laptop tab never connects to the bridge (phones see "laptop not connected") and
  the Phone remote panel shows the upgrade / login prompt. Soft lock (client-side).
- Account server == sync server → one cookie: account logout stops sync (`watchAuth` in couchSync.ts).

Still open / next:

- The single working Schedule must stay free — it is the only way to go live.
- Tiers: Jack has not decided. Proposed (in `entitlements.ts`): Basic = phone remote + saved
  lineups (laptop-only features); Pro = Basic + cloud sync (the part with a monthly server cost).
- "Lineup schedule" as a paid feature = saving several lineups / planning future services
  (to be built). Lock it with `hasFeature(plan, "schedule")`.
- PayMongo webhook → sets / removes the plan role (and expiry; roles alone have no end date).
- Cloud: CouchDB must be same-site with the app (cross-site cookies are blocked); per-church
  databases — a new account currently has no access to `wtp_*` databases (admin-only by default).
- CouchDB session timeout is 10 min by default; README tells admins to raise it.

## Testing notes

- No test suite. In cloud sessions Docker works: start `dockerd`, run `couchdb:3` with
  `COUCHDB_USER`/`COUCHDB_PASSWORD`, create `_users`, enable CORS for `http://localhost:3000`
  with credentials, then drive the app with the pre-installed Playwright.

## Progress log

- 2026-11-16: Project context saved; codebase reviewed; login plan agreed.
- 2026-11-16: Login implemented and tested against a real CouchDB 3.5 (sign-up, login, logout,
  expired session, offline grace, role change by admin, shared login with the sync panel).
- 2026-11-16: Phone remote locked to Basic / Pro; tested anonymous, Free, Basic, offline, logout.
