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

- `serverCouch.ts` — shared server helpers: where CouchDB is, admin fetch, "who is asking" (cookie)
- `couchProxy.ts` — `/couch` = CouchDB behind the app's address; laptop → hosted forwarding (`CLOUD_URL`)
- `cloudServer.ts` — cloud sync: per-church databases, lock / unlock by plan
- `deploy/` + `Dockerfile` — hosted server (app + CouchDB + Caddy) on one VPS
- `authServer.ts` — account routes (sign-up, config)
- `billingServer.ts` — PayMongo: checkout, webhook, confirm, hourly expiry sweep
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

Done (2026-11-16): login, phone remote + Lineups locked to Basic / Pro, PayMongo prepaid billing,
cloud sync for Pro. Nothing is deployed yet: no hosted server exists, PayMongo is untested live.

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
- Lineups ("lineup schedule"): `src/lib/lineupStore.ts` + `src/components/LineupsModal.tsx`,
  opened from the Schedule header. A lineup = named, dated copy of the working Schedule (same
  attachment format as `scheduleStore.ts`). Opening one replaces the working Schedule
  (`openLineup` in the Simulator). Locked with `hasFeature(plan, "schedule")`.
- Payments (`billingServer.ts`, `src/lib/billing.ts`, `src/components/PlanSection.tsx`): PREPAID
  1 month / 1 year via PayMongo Checkout Sessions (GCash cannot auto-renew). Order doc in
  CouchDB `wtp_billing`; on webhook/confirm the session is RE-FETCHED from PayMongo's API and
  only that answer is trusted; then `_users` doc gets `plan:<plan>` + `subscription.expiresAt`
  (+ `orders` list = idempotency). Hourly sweep removes ended plans (3-day grace). Roles set by
  hand (no `subscription`) are never touched. Routes identify the account by forwarding the
  `AuthSession` cookie to CouchDB (`sessionOf` in `serverCouch.ts`). Prices live at the top of `billingServer.ts`
  (Basic ₱299/mo, ₱2,990/yr; Pro ₱699/mo, ₱6,990/yr). Plan change keeps the value of the time left.
- Topology: HOSTED server (admin login + PayMongo keys; `deploy/`) and church LAPTOPS
  (`CLOUD_URL=https://hosted`; no secrets). The browser always talks to CouchDB at same-origin
  `/couch` (`couchProxy.ts`: only `_session` and `wtpc-*` databases pass; streams bodies). A laptop
  forwards `/couch`, `/api/auth`, `/api/billing`, `/api/cloud` to the hosted server. This is what
  makes the login cookie work everywhere (cross-site cookies are blocked by browsers).
- Cloud sync (`cloudServer.ts`): databases `wtpc-<sha256(account)[:32]>-<kind>` (songs, bibles,
  presentations, media, lineups), `_security` members = the account. Plan enforced by CouchDB:
  `reconcile(account)` removes / restores the account in `_security` (never an empty members
  list = public!) on payment, on plan end, and hourly. Entitlement is read from the user DOC
  (session roles lag a moment after a change — CouchDB auth cache).
- Browser HTTP/1.1 limit (6 connections per origin) matters now that CouchDB is same-origin:
  in cloud mode only songs + lineups are live; bibles / presentations / media sync on change and
  every 2 min (`periodicSync` in `couchSync.ts`). Do not add more always-open connections.
- Own-CouchDB sync (direct URL, needs CORS) still exists under "Sariling CouchDB (advanced)".
- Account server == sync server → one cookie: account logout stops sync (`watchAuth` in couchSync.ts).

Still open / next:

- The single working Schedule must stay free — it is the only way to go live.
- Tiers as built (Jack delegated the choice): Basic = phone remote + Lineups; Pro = Basic + cloud sync.
- PayMongo is NOT yet tested against the real API: this cloud session's network blocks
  paymongo.com (Jack declined a new environment that allows it), so the request shape and the
  `Paymongo-Signature` format (`t=,te=,li=`; HMAC-SHA256 of `<t>.<raw body>`) come from memory and
  search results. Tested against a stand-in server only. First step with real test keys:
  create a checkout, pay in test mode, read the server log.
- Deploy for real: rent a VPS, point a domain, `deploy/README.md`. The Docker image build could
  NOT be verified in the cloud session (no npm registry inside `docker build` there); the same
  production bundle was run directly with node as "hosted" + "laptop" and tested.
- Before real customers: backups of the `couch-data` volume, storage quota per church (media
  videos can be 200 MB each), password reset, service worker (app shell offline on the hosted site).
- Checkout started on a laptop returns to the HOSTED site (`APP_URL`), where the user may not be
  logged in; the laptop's "Nakabayad na ako — i-check" button covers it.
- Offline cache (14 days) can outlive a plan's end date by up to 14 days; fine for a soft lock.
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
- 2026-11-16: Cloud sync built (/couch proxy, per-church databases, lock by plan, laptop → hosted
  forwarding, Pro on sale, deploy files); tested with a "hosted" + "laptop" server and two browsers.
- 2026-11-16: PayMongo prepaid billing built (checkout, webhook, confirm, expiry); stand-in tests only.
- 2026-11-16: Lineups built and locked to Basic / Pro; tested save, open, overwrite, delete, reload.
