# Worship Tech Pro

Church presentation web app (EasyWorship-like) for Filipino churches: songs, Bible, projection,
lineup schedule, phone remote, themes, Stage screen with chords for musicians, plus an offline
Help chat (no AI) and guides for EasyWorship volunteers. Owner: Jack (solo developer).

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
- Chat tab = offline Help, no AI (2026-11-17: Gemini removed): `src/lib/helpKb.ts` (articles),
  `src/lib/helpSearch.ts` (keyword search), `src/lib/musicTools.ts` (transpose / capo calculator)
- Firebase Hosting config exists for a static-only deploy (no local server there)
- Team sync (2026-11-17): Firebase Auth (Google) + Firestore, songs only, free Spark plan —
  see "Team sync (Firebase)" below. The `firebase` SDK is a lazy chunk, loaded only when used.

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
- `server.ts` — Express: `/api/health`, `/api/app/presence` (auto-stop); `/api/chat` removed 2026-11-17
- `remoteServer.ts` — phone remote bridge over SSE, PIN login, host routes are localhost-only (`isLocal`)
- `src/main.tsx` — picks the page by URL: `?output=main` projector, `?output=stage` Stage screen,
  `?remote` phone remote, else `App`. Each is a lazy chunk.
- `src/App.tsx` — shell, tabs (simulator / chat / guides / shortcuts), live state, appearance
- `src/components/WorkflowCanvasSimulator.tsx` — the main operator screen (Library → Schedule → Live)
- `src/lib/couchSync.ts` — the 4 PouchDB databases (songs, bibles, presentations, media), settings,
  live two-way sync (session login itself lives in `src/lib/auth.ts`)
- `src/components/CouchSyncPanel.tsx` — sync settings + login UI, shown in each Library tab
- `src/lib/teamSync.ts` — Team sync: Google login, teams, and the bridge PouchDB "wtp-songs" ⇄ Firestore
- `src/lib/teamSyncCore.ts` — its pure part: Firestore doc shape, `decide()` (who wins a conflict)
- `src/lib/teamSyncSettings.ts` — "is Team sync on" + checkpoints (no Firebase import; couchSync reads it)
- `src/lib/firebaseConfig.ts` — Firebase web config (empty = Team sync hidden)
- `src/components/TeamSyncPanel.tsx` — Team sync UI, Songs tab only
- `firestore.rules` — only a team's members (by Google email) can read / write its songs
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

**2026-11-21 (Mira) — the account is now a Google login (Firebase), Phase 1.** Reason: the app runs on
Firebase Hosting (static, no Express), so the CouchDB account (`/api/auth`) could never work there.
- `src/lib/firebase.ts` — the ONE Firebase app (lazy SDK), shared by Account and Team sync: one
  Google login for both (logout in either logs out of both). Emulator switch moved here.
- `src/lib/auth.ts` — `useAuth()` keeps its shape (+ `uid`, `expiresAt`). Plan = Firestore
  `accounts/{uid}` `{ plan: "basic" | "pro", expiresAt?: timestamp }` → `planFromAccountDoc` →
  `rolesOfPlan` (entitlements.ts), so every `hasFeature(planFromRoles(...))` gate is unchanged.
  3-day grace after `expiresAt`. Offline copy: localStorage `wtp-auth-v2` (14 days) +
  `wtp-auth-signed-in`. The Firebase SDK is not loaded on first paint unless someone signed in here.
- `firestore.rules` — `accounts/{uid}`: owner can read, NOBODY writes from the app. Jack sets plans
  by hand in the Firebase Console (doc id = the "Account ID" shown in the Account window).
- `AccountModal.tsx` — one "Mag-sign in gamit ang Google" button (Firebase preloaded when the window
  opens, so the popup is not blocked); shows Account ID with copy button and the end date.
- `billing.ts` — with no `/api/billing`, shows the price list as "coming" (Basic available, Pro coming).
  `PlanSection.tsx` tells churches to pay by GCash + send the Account ID; `UPGRADE_CONTACT` (empty) is
  for Jack's contact line.
- `CouchSyncPanel.tsx` — `CLOUD_SYNC_READY = false`: Pro cloud sync shows "malapit na" (it still needs
  the hosted CouchDB + its cookie). "Sariling CouchDB (advanced)" unchanged.
- The CouchDB account code (authServer.ts, billingServer.ts, cloudServer.ts, couch helpers in auth.ts)
  is KEPT for a future VPS; nothing calls the CouchDB account login from the UI any more.
- Next (Phase 2, needs Jack's go — Blaze plan = cost): PayMongo checkout + webhook on Cloud
  Functions writing `accounts/{uid}` with the Admin SDK; then Pro cloud sync on Firebase.

**2026-11-22 (Mira) — Admin window (Jack only).** Account window → "Admin: mga plan" (shown only for
`ADMIN_UIDS` in `src/lib/admin.ts`). Lists every account (profiles + accounts), search, set plan
Free / Basic / Pro and end date (+1 month / +1 year from the current end if still running, none, or a date),
or open an account by its Account ID. `src/components/AdminModal.tsx`.
- The real lock is firestore.rules `isAdmin()` (same uid list — change BOTH together): admin reads all
  `profiles` + `accounts` and writes `accounts` (only `plan` in free/basic/pro + optional timestamp
  `expiresAt`). Nobody else can read others' data or write any plan.
- `profiles/{uid}` = { email, name, lastSeen } written by each user about themself after login
  (`saveProfile`, called from auth.ts `applyUser`, once a day per browser). Accounts that logged in before
  2026-11-22 appear only after their next login; until then use "Account ID".
- Jack's own account: `accounts/FW7iJWYqcjNIpTgFu84BQ0EaUUu1` = Pro, no end date (set 2026-11-22).
- Rules need ~1 minute after publishing before they apply everywhere (first test got permission-denied).

**2026-11-22 (Mira) — email + password login too** (Jack: not only Gmail). Email/Password provider
enabled in the Firebase Console (Authentication → Sign-in method). Google stays the first button.
- `firebase.ts`: `emailSignUp` (sends the verification email), `emailSignIn`, `sendPasswordReset`,
  `resendVerification`, `reloadFirebaseUser` (reload + fresh token, then tells every `onFirebaseUser`
  listener), `MIN_PASSWORD` = 8, Tagalog messages for the email/password error codes.
- `auth.ts`: `AuthState.verified`; `signUpEmail` / `loginEmail` / `resetPassword` / `resendVerifyEmail` /
  `checkVerified`. `refreshAuth` re-checks an unverified user (so coming back to the tab after clicking
  the link is enough). `saveProfile` only for a verified email (nobody can put someone else's email in
  the admin list).
- Same Firebase uid + `accounts/{uid}` plan as Google. Firestore `signedIn()` already requires
  `email_verified`, so team / personal sync waits until the email is confirmed; teamSync.ts now listens
  with `onIdTokenChanged` so it hears the verification without a reload. TeamSyncPanel says "I-verify muna".
- `AccountModal.tsx`: form under the Google button — Mag-login / Gumawa ng account / Nakalimutan ang
  password; unverified banner with "Na-verify ko na" + "Ipadala ulit". Reset never says whether the email
  has an account (Firebase email-enumeration protection).
- **Testing switch (2026-11-22, Jack: "testing lang muna"):** `REQUIRE_EMAIL_VERIFICATION = false` in
  firebase.ts → no verification email, no banner, every account goes to the admin list. Password accounts do
  NOT sync meanwhile (rules need email_verified; panel says "Google account lang"). Set it to `true` before
  real churches use the app.
- Same email in both: Firebase's default "one account per email". Password account first, then Google with
  the same Gmail → Firebase links it to the same uid (Google is trusted for Gmail). Google first, then sign-up
  with that email → "May account na…" message (use Google, or "Nakalimutan ang password" to add a password).

Below: the original CouchDB design (2026-11-16), still in the code but not used by the UI.

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

## Team sync (Firebase)

Done (2026-11-17), code only: NOT yet run against a real Firebase project (Jack fills in
`firebaseConfig.ts`, turns on Firestore + Google sign-in, deploys `firestore.rules`).

- What: one shared song library per worship team. Songs only. Free for everyone (no plan gate —
  Jack's choice; it overlaps with Pro cloud sync, which still adds Bible / PPT / media / lineups).
- Separate login from the CouchDB account: Google sign-in (popup). Two logins exist on purpose.
- Songs still live in PouchDB `wtp-songs`; the app works offline exactly as before. teamSync.ts
  only mirrors that database to Firestore and back.
- Firestore: `teams/{ownerUid}` = name, ownerUid, ownerEmail, memberEmails[] (max 30), createdAt.
  One team per Google account. `teams/{id}/songs/{songId}` = the StoredSong fields + `deleted`,
  `by`, `serverAt`. A delete is an EMPTY doc with `deleted: true` (so offline laptops hear of it).
- Downloads only docs with `serverAt` newer than the last one seen (cheap on the free quota).
  Uploads are found from the PouchDB change feed (`seq` checkpoint), so offline edits survive a
  closed app. Checkpoints: localStorage `wtp-team-sync-state-v1:<teamId>`.
- Conflicts (`decide` in teamSyncCore.ts): later `updatedAt` wins; my delete vs their edit → the
  edit wins; the FIRST sync with a team is a merge (old local deletes are not sent).
- While Team sync is on, CouchDB sync (own or cloud) skips the songs database (`syncKinds` in
  couchSync.ts) and restarts itself when Team sync is turned on / off.
- Not synced: a song's background picture / video (only its id) — other devices show the default.
- A removed member keeps the songs already in their browser (cannot be taken back).
- Test without a real project: `VITE_FIREBASE_EMULATOR=1 npm run dev` + Firebase Emulator Suite
  (auth :9099, firestore :8080; needs Java). `window.__wtpTeamTestLogin(email)` exists only then.
- Still open: test on the real project (Google popup, rules, quota); a Help article; member
  self-leave; team rename / delete (today: Firebase Console).
- **Personal sync (2026-11-22, Mira — Jack: songs must sync with no team and no plan).** After ANY
  Google login (Account window or the panel), `autoPersonalSync()` in teamSync.ts creates the account's
  own team (id = uid, name = Google display name; the existing rules already allow it) if it has none,
  and turns sync on by itself — no confirm (it is the user's own box). Started from
  `autoStartTeamSync()` via `onFirebaseUser` (does not load Firebase). Turning sync off by hand sets
  `autoOff` in `wtp-team-sync-v1`, so it stays off until turned on again. Panel wording: "Sync: …"
  chip, "Sync ng kanta"; "Team:" shows only once there are other members. Members stay optional.
  Joining SOMEONE ELSE's team is still by hand (panel → I-on). Quota note: every signed-in church
  shares the one free Spark quota of the project.

## Phone remote additions (2026-11-17)

- Top-right **Menu** on the remote (`RemoteControl.tsx`): "Gawing screen" → this phone / tablet / TV
  browser shows the **Projector** (`LiveMainScreen`) or the **Stage** screen (`StageView`) full
  screen, following the laptop (view only; remembered per tab in sessionStorage `wtp-remote-screen`;
  Screen Wake Lock). Pictures are the small copies remotes get (480 px) and a video background
  shows as its poster. Disconnect moved into the menu.
- **Background ng lyrics** on the remote: one schedule item or the whole schedule. New command
  `set-bg` `{ scope: "item" | "all", itemId?, bgId | null }` (validated in `remoteServer.ts`); the
  list of backgrounds travels in the library message (`RemoteLibrary.backgrounds`: built-in CSS +
  tiny JPEGs of the Media uploads); `schedule[].bg` and `allBg` in the snapshot mark the choice.
- **Whole-schedule background** ("Buong schedule" in the Media tab, or from the remote): every item
  now + items added later (`newItemBg = scheduleBg ?? defaultThemeBg` in the Simulator). Only the
  id is saved (localStorage `wtp.schedule.allBg.v1`, `scheduleStore.ts`). Applying a theme to the
  whole schedule clears it (undo restores it). PowerPoint slides keep their own picture.
- "Ask AI" buttons: the Simulator's "Ask in Chat" (tablet / phone header) is gone; the ones in
  Guides and Hotkeys show only on a wide screen with a mouse (`hidden lg:pointer-fine:flex`).

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
- 2026-11-17: Gemini AI chat removed (no API key). Chat tab = offline Help in the browser (articles +
  transpose / capo calculator for musicians); works on Firebase Hosting too. "Ask in Chat" icon
  beside "+ New song" removed. `@google/genai` uninstalled.
- 2026-11-17: Phone remote: "Gawing screen" (Projector / Stage on the remote device) + lyrics
  background from the remote (item / whole schedule); Media tab "Buong schedule"; Ask AI hidden on
  tablets / phones. Tested with a real local server + CouchDB-compatible login, two remotes.
- 2026-11-17: Team sync built (Firebase Auth + Firestore, songs only; CouchDB sync skips songs while
  it is on). Tested with a stand-in Firestore + the real Auth emulator; not yet on a real project.
- 2026-11-21 (Mira): Google sign-in became the account login (Phase 1, see "Auth and subscriptions").
  Tested: tsc, build, Auth emulator + Playwright (login, Account ID, offline plan, reload, logout,
  Team sync shares the login), vitest with mocked Firebase for the plan rules (8 tests, not committed).
  NOT tested: the real Google popup (sandbox blocks apis.google.com) and firestore.rules (Firestore
  emulator download blocked).
- 2026-11-19: Landing page at `/welcome` (`welcome.html`, plain HTML/CSS + `src/welcome.ts` for the bundled
  fonts; second Vite input; Firebase rewrite + prod Express route). App stays at `/`. index.html meta no longer says "AI".
- 2026-11-22 (Mira): Firestore rules re-published from firestore.rules (adds accounts/{uid}). Personal sync
  (see "Team sync"). Tested on Jack's localhost:3000 with the real project: tsc + vite build ok; after
  reload the chip showed "Sync: synced", team doc created, 2 of 2 active songs in Firestore (a song deleted
  before the first sync is correctly not sent). The very first reload right after the files were written
  still showed "Sync: off" (probably the dev server picking up the new files; not reproduced).
  NOT tested: second device, edit after sync, fresh Google login, turning off/on. The live site
  (web.app) is an old build (2026-10-28); test on localhost only.
- 2026-11-22 (Mira): Admin window built (see "Auth and subscriptions"); rules published 00:36. Tested on
  localhost: tsc + build ok; Admin button shows for Jack; list shows his profile + Pro; save Pro / no end
  date accepted; +1 month preview right; anonymous REST read of accounts + profiles and a plan write all 403.
  NOT tested: a second signed-in non-admin account (should be refused by the same rule), the Petsa field.
- 2026-11-22 (Mira): email + password login (see "Auth and subscriptions"). Email/Password provider turned on
  in the Firebase Console. Tested: tsc ok; Auth emulator + Playwright 21/21 (input checks, sign-up, verification
  email + resend, unverified banner, verify → banner gone, logout, wrong password, email in use, reset email,
  login, reload). NOT tested: real project emails (inbox / Spam), sync starting after verification on the real
  Firestore (needs Firestore), Google + password on the same Gmail.
- 2026-11-22 (Mira): Stage screen text bigger by default (lyrics 5.2 → 6.5 cqmin, NEXT 3 → 3.75; − / + still
  scale it; StageScreen.tsx STAGE_TEXT_BASE / STAGE_NEXT_BASE). Phone remote Menu → "Buksan sa laptop":
  Projector / Stage monitor opens the window ON THE LAPTOP (saved screen) via new command `open-output`
  { kind: "main" | "stage" } (remoteServer.ts cleanCmd, remoteLink.ts, Simulator handleRemoteScheduleCmd →
  handleOpenOutput(true, kind)). No laptop click, so Chrome needs Pop-ups: Allow for the site; fullscreen still
  needs a click/Enter unless AutomaticFullscreenAllowedForUrls policy. Tested: tsc + vite build + server bundle ok;
  cleanCmd unit check (main/stage ok, bad kind refused). NOT tested: real phone → laptop → projector/TV.
