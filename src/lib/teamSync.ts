/**
 * 2026-11-17 (Jarvis): Team sync — one shared song library for a worship team, on Firebase
 * (Google login + Firestore, free Spark plan). Songs only; Bible / PPT / media stay with
 * CouchDB sync or in this browser.
 *
 * How it fits with the rest:
 *  - The songs still LIVE in this browser's PouchDB ("wtp-songs", lib/songsDb.ts). That is what
 *    makes the app work with no internet. This file is only a bridge between that database and
 *    Firestore: local changes go up, team changes come down.
 *  - While Team sync is on, CouchDB sync skips the songs database (see couchSync.ts), so the two
 *    never fight over the same songs.
 *  - The Firebase SDK is loaded only when Team sync is used (dynamic import), never on first paint.
 *
 * Team model: teams/{ownerUid} = { name, ownerUid, ownerEmail, memberEmails[], createdAt }.
 * One team per Google account (the id is the owner's uid). Members are listed by Gmail address;
 * firestore.rules lets only those read and write teams/{id}/songs.
 *
 * Sync rules live in teamSyncCore.ts (`decide`). Offline: unsent changes are found again from the
 * PouchDB change feed (checkpoint `seq`), so nothing depends on Firestore's own offline cache.
 */
import { useSyncExternalStore } from "react";
import type { User } from "firebase/auth";
import type { QuerySnapshot, Unsubscribe } from "firebase/firestore";
import { describeAuthError, googleSignIn, googleSignOut, isFirebaseAvailable, isFirebaseLoaded, loadFirebase, onFirebaseUser } from "./firebase";
import { getLocalDb, removeDoc, upsertDoc } from "./couchSync";
import { StoredSong, sanitizeSong } from "./mySongsStore";
import { loadCheckpoint, loadTeamSettings, saveCheckpoint, saveTeamSettings, TEAM_ID_RE } from "./teamSyncSettings";
import {
  DELETED,
  PendingLocal,
  TEAM_LIMITS,
  TEAM_SONG_ID_RE,
  TeamInfo,
  cleanEmail,
  cleanMembers,
  cleanTeamName,
  decide,
  fromRemoteData,
  hashOf,
  songHash,
  teamFromData,
  tombstoneData,
  toRemoteData,
} from "./teamSyncCore";

// 2026-11-21 (Mira): Firebase loading, the emulator switch and the Google popup moved to
// lib/firebase.ts — shared with the Account login, so one Google login serves both.
export const isTeamSyncAvailable = (): boolean => isFirebaseAvailable();

// ---------------------------------------------------------------- status (what the panel shows)

export type TeamSyncState = "off" | "loading" | "login" | "connecting" | "syncing" | "synced" | "offline" | "error";

export interface TeamStatus {
  state: TeamSyncState;
  message?: string;
  /** Google account, lower-case email. null = not logged in (or not checked yet). */
  email: string | null;
  /** Teams this account belongs to (filled after login). */
  teams: TeamInfo[];
  /** The team being synced. */
  team: TeamInfo | null;
  /** Local changes not sent yet (e.g. while offline). */
  pending: number;
  lastSync?: string;
}

let status: TeamStatus = { state: "off", email: null, teams: [], team: null, pending: 0 };
const listeners = new Set<() => void>();
function setStatus(patch: Partial<TeamStatus>): void {
  status = { ...status, ...patch };
  listeners.forEach((fn) => fn());
}
export const getTeamStatus = (): TeamStatus => status;
export function subscribeTeamStatus(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export const useTeamStatus = (): TeamStatus => useSyncExternalStore(subscribeTeamStatus, getTeamStatus);

// ---------------------------------------------------------------- Firebase (loaded on demand)

let user: User | null = null;
let authReady: Promise<void> | null = null;

/** Loads Firebase and waits until it knows who is logged in (it remembers the login, also offline). */
function ensureAuth(): Promise<void> {
  authReady ??= (async () => {
    const { auth, authMod } = await loadFirebase();
    await new Promise<void>((resolve) => {
      let first = true;
      // 2026-11-22 (Mira): onIdTokenChanged (not onAuthStateChanged) so a login whose email gets
      // verified later (email + password) is heard too: reloadFirebaseUser() refreshes the token.
      authMod.onIdTokenChanged(auth, (u) => {
        const email = u && u.emailVerified ? cleanEmail(u.email) : null;
        user = email ? u : null;
        if (!user) {
          stopBridge();
          setStatus({ email: null, teams: [], team: null, pending: 0, state: loadTeamSettings().enabled ? "login" : "off", message: undefined });
        } else if (status.email !== email) {
          setStatus({ email, message: undefined });
          // A login AFTER the page loaded (the first answer is handled by whoever asked):
          // show this account's teams, and carry on syncing if Team sync was left on.
          if (!first) {
            void refreshTeams().catch(() => undefined);
            if (loadTeamSettings().enabled) void startTeamSync();
          }
        }
        first = false;
        resolve();
      });
    });
  })();
  authReady.catch(() => {
    authReady = null;
  });
  return authReady;
}

const userEmail = (): string | null => (user ? cleanEmail(user.email) : null);

const describeError = (e: unknown): string => {
  const code = (e as { code?: string })?.code || "";
  if (code === "permission-denied") return "Walang access. Kasali ka pa ba sa team? Itanong sa may-ari ng team.";
  if (code === "unavailable" || code === "auth/network-request-failed") return "Walang internet. Susubok ulit.";
  if (code === "resource-exhausted") return "Naabot ang libreng quota ng Firebase ngayong araw. Susubok ulit mamaya.";
  const authMsg = describeAuthError(code);
  if (authMsg) return authMsg;
  return code ? `Error: ${code}` : "May error. Subukan ulit.";
};

// ---------------------------------------------------------------- login + teams

/** Called when the panel opens: who is logged in, and which teams. Safe to call many times. */
export async function openTeamSync(): Promise<void> {
  if (!isTeamSyncAvailable()) return;
  try {
    if (!isFirebaseLoaded() && status.state === "off") setStatus({ state: "loading" });
    await ensureAuth();
    if (status.state === "loading") setStatus({ state: "off" });
    if (user) await refreshTeams();
  } catch (e) {
    setStatus({ state: loadTeamSettings().enabled ? "login" : "off", message: describeError(e) });
  }
}

export async function loginGoogle(): Promise<{ ok: boolean; error?: string }> {
  try {
    await ensureAuth();
    await googleSignIn();
    if (!user) return { ok: false, error: "Hindi verified ang email ng account na ito." };
    return { ok: true }; // teams + (if it was on) the sync follow from the login itself, see ensureAuth
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** Logs out of Google. Songs stay in this browser; Team sync stays "on" and waits for the next login. */
export async function logoutGoogle(): Promise<void> {
  stopBridge();
  await googleSignOut();
}

/** Reads the teams this account is a member of (one small query). */
export async function refreshTeams(): Promise<TeamInfo[]> {
  const email = userEmail();
  if (!email) return [];
  const { db, fs } = await loadFirebase();
  const snap = await fs.getDocs(fs.query(fs.collection(db, "teams"), fs.where("memberEmails", "array-contains", email), fs.limit(20)));
  const teams: TeamInfo[] = [];
  snap.forEach((d) => {
    const t = TEAM_ID_RE.test(d.id) ? teamFromData(d.id, d.data()) : null;
    if (t) teams.push(t);
  });
  teams.sort((a, b) => a.name.localeCompare(b.name));
  setStatus({ teams });
  return teams;
}

export const isTeamOwner = (t: TeamInfo | null): boolean => !!t && !!user && t.id === user.uid;
export const ownsATeam = (): boolean => !!user && status.teams.some((t) => t.id === user!.uid);

/** Creates this account's team (one per account; the id is the account's uid). */
export async function createTeam(nameInput: string): Promise<{ ok: boolean; error?: string }> {
  const email = userEmail();
  const name = cleanTeamName(nameInput);
  if (!user || !email) return { ok: false, error: "Mag-login muna gamit ang Google." };
  if (!name) return { ok: false, error: "Ilagay ang pangalan ng team." };
  try {
    const { db, fs } = await loadFirebase();
    await fs.setDoc(fs.doc(db, "teams", user.uid), { name, ownerUid: user.uid, ownerEmail: email, memberEmails: [email], createdAt: new Date().toISOString() });
    await refreshTeams();
    return { ok: true };
  } catch (e) {
    // The rules refuse a second create for the same account (it would be an update): show the usual text.
    return { ok: false, error: describeError(e) };
  }
}

/** Owner only: saves the member list (Gmail addresses). The owner always stays in it. */
export async function saveMembers(team: TeamInfo, emails: string[]): Promise<{ ok: boolean; error?: string }> {
  if (!isTeamOwner(team)) return { ok: false, error: "Ang may-ari lang ng team ang makakapagbago ng members." };
  const members = cleanMembers(team.ownerEmail, emails);
  try {
    const { db, fs } = await loadFirebase();
    await fs.updateDoc(fs.doc(db, "teams", team.id), { memberEmails: members });
    await refreshTeams();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

export { TEAM_LIMITS, cleanEmail };

// ---------------------------------------------------------------- on / off

/** Turns Team sync on for that team (the caller already asked the user to confirm the merge). */
export async function enableTeamSync(team: TeamInfo): Promise<void> {
  saveTeamSettings({ enabled: true, teamId: team.id, teamName: team.name });
  await startTeamSync();
}

/** Turns Team sync off. Songs stay in this browser and in the team. */
export function disableTeamSync(): void {
  stopBridge();
  const s = loadTeamSettings();
  saveTeamSettings({ ...s, enabled: false, autoOff: true }); // 2026-11-22: stays off until turned on by hand
  setStatus({ state: "off", team: null, pending: 0, message: undefined });
}

/** Starts sync on app load when it was left on (called by the Songs tab; runs once). */
let autoStart: Promise<void> | null = null;
export function autoStartTeamSync(): Promise<void> {
  if (!autoStart) {
    autoStart = loadTeamSettings().enabled && isTeamSyncAvailable() ? startTeamSync() : Promise.resolve();
    // 2026-11-22 (Mira): any Google login (Account window or this panel) turns on personal sync by
    // itself. onFirebaseUser does not load Firebase; it only hears logins once something loads it.
    if (isTeamSyncAvailable()) onFirebaseUser((u) => {
      if (u) void autoPersonalSync();
    });
  }
  return autoStart;
}

// ---------------------------------------------------------------- personal sync (2026-11-22, Mira)
// Jack: songs must sync with NO team and NO plan. A "team" is only the box in Firestore that says
// where the songs live and who may read them, so every Google account gets its own box (a team of
// one, id = uid, which firestore.rules already allow) and sync turns on by itself after login.
// Adding members to it later turns it into a shared team. Turning sync off by hand (autoOff) stops this.

const personalTeamName = (u: User): string =>
  cleanTeamName(u.displayName) || cleanTeamName((u.email || "").split("@")[0]) || "Mga kanta ko";

let autoBusy = false;
async function autoPersonalSync(): Promise<void> {
  const s = loadTeamSettings();
  if (s.enabled || s.autoOff || autoBusy || !isTeamSyncAvailable()) return;
  autoBusy = true;
  try {
    await ensureAuth();
    if (!user) return; // not verified, or logged out meanwhile
    const uid = user.uid;
    let mine = (await refreshTeams()).find((t) => t.id === uid) ?? null;
    if (!mine) {
      const r = await createTeam(personalTeamName(user));
      if (!r.ok) {
        setStatus({ state: "error", message: r.error });
        return;
      }
      mine = status.teams.find((t) => t.id === uid) ?? null;
    }
    const now = loadTeamSettings();
    if (!mine || now.enabled || now.autoOff) return; // turned on / off by hand meanwhile
    await enableTeamSync(mine);
  } catch (e) {
    setStatus({ state: "error", message: describeError(e) });
  } finally {
    autoBusy = false;
  }
}

async function startTeamSync(): Promise<void> {
  const s = loadTeamSettings();
  if (!s.enabled || !isTeamSyncAvailable()) return;
  try {
    setStatus({ state: "connecting", message: undefined });
    await ensureAuth();
    if (!user) {
      setStatus({ state: "login" });
      return;
    }
    if (!loadTeamSettings().enabled) return; // turned off while Firebase was loading
    await startBridge(s.teamId, s.teamName);
  } catch (e) {
    setStatus({ state: "error", message: describeError(e) });
  }
}

// ---------------------------------------------------------------- the bridge (PouchDB ⇄ Firestore)

type SongDoc = StoredSong & { _id: string; _rev?: string; type: "song" };
interface PendingEntry extends PendingLocal {
  seq: number;
}

const PUSH_BATCH = 100; // Firestore allows 500 writes / 10 MB per batch; lyrics can be 10,000 characters each
const PUSH_DELAY_MS = 600;
const RETRY_MS = 30 * 1000;
const ONLINE_WAIT_MS = 8 * 1000;
/** Re-reads a little before the last server time we saw, in case two saves landed out of order. Harmless: applying is idempotent. */
const PULL_OVERLAP_MS = 10 * 1000;

interface Bridge {
  stop(): void;
}
let bridge: Bridge | null = null;
/** Bumps on every start / stop, so a start that was still loading when sync was turned off gives up. */
let bridgeGen = 0;

function stopBridge(): void {
  bridgeGen++;
  bridge?.stop();
  bridge = null;
}

async function startBridge(teamId: string, teamName: string): Promise<void> {
  stopBridge();
  const email = userEmail();
  if (!user || !email || !TEAM_ID_RE.test(teamId)) return;
  const gen = bridgeGen;
  const { db, fs } = await loadFirebase();
  if (gen !== bridgeGen) return;
  const local = getLocalDb<SongDoc>("songs");
  const songsCol = fs.collection(db, "teams", teamId, "songs");

  let alive = true;
  const unsubs: Array<Unsubscribe | (() => void)> = [];
  const saved = loadCheckpoint(teamId);
  /** First time with this team on this browser = merge only: old local deletes are not sent. */
  const firstSync = !saved;
  let seq = saved?.seq ?? 0; // last local change seen
  let pulledAt = saved?.pulledAt ?? 0;
  const pending = new Map<string, PendingEntry>(); // local changes the team does not have yet
  const applied = new Map<string, string>(); // what we wrote here because the team said so (so it is not sent back)
  const own = new Map<string, string>(); // what we last sent (so it is not treated as someone else's change)
  // true after an answer from the server: only then may we send. Goes back to false while offline,
  // so after an offline period the team's changes are looked at BEFORE ours are sent
  // (otherwise an offline delete could wipe out an edit someone made in the meantime).
  let ready = false;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  let flushing = false;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let failed: string | null = null;

  const me: Bridge = {
    stop() {
      alive = false;
      clearTimeout(flushTimer);
      clearTimeout(readyTimer);
      unsubs.forEach((u) => u());
    },
  };
  bridge = me;

  /** One thing at a time: a team change and a local change for the same song never interleave. */
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(job: () => Promise<T>): Promise<T> => {
    const run = chain.then(job, job);
    chain = run.catch(() => undefined);
    return run;
  };

  const checkpoint = () => {
    // Everything up to `done` is at the team (or needs no sending).
    let done = seq;
    pending.forEach((p) => {
      if (p.seq - 1 < done) done = p.seq - 1;
    });
    saveCheckpoint(teamId, { seq: Math.max(0, done), pulledAt });
  };

  const publish = () => {
    if (!alive) return;
    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    const state: TeamSyncState = failed ? "error" : !online ? "offline" : !ready ? "connecting" : pending.size > 0 ? "syncing" : "synced";
    setStatus({ state, message: failed ?? undefined, pending: pending.size, ...(state === "synced" ? { lastSync: new Date().toISOString() } : {}) });
  };

  const fail = (e: unknown) => {
    if (!alive) return;
    const code = (e as { code?: string })?.code;
    failed = describeError(e);
    publish();
    // Not a member any more: stop asking. Anything else: try again in a while.
    if (code === "permission-denied") me.stop();
  };

  /** A listener that reports an error is finished for good (Firestore does not restart it): start over later. */
  const listenerFail = (e: unknown) => {
    fail(e);
    if (!alive) return;
    const t = setTimeout(() => {
      if (alive && bridge === me) void startBridge(teamId, teamName).catch(() => undefined);
    }, RETRY_MS);
    unsubs.push(() => clearTimeout(t));
  };

  const readLocal = async (id: string): Promise<StoredSong | null> => {
    try {
      const d = await local.get(id);
      const s = sanitizeSong({ ...d, id: d._id });
      return s && s.id === d._id ? s : null;
    } catch {
      return null; // 404 = not here (deleted or never had it)
    }
  };

  /** A change in this browser's songs database. */
  const onLocal = (c: { id: string; seq: number | string; deleted?: boolean; doc?: unknown }, catchUp: boolean) => {
    const n = typeof c.seq === "number" ? c.seq : parseInt(String(c.seq), 10);
    if (isFinite(n) && n > seq) seq = n;
    if (!TEAM_SONG_ID_RE.test(c.id)) return;
    let entry: PendingEntry;
    if (c.deleted) {
      if (catchUp && firstSync) return;
      entry = { seq: n, deleted: true, song: null };
    } else {
      const d = c.doc as { _id?: string } | undefined;
      const song = d ? sanitizeSong({ ...d, id: c.id }) : null;
      if (!song || song.id !== c.id) return;
      entry = { seq: n, deleted: false, song };
    }
    const h = hashOf(entry);
    if (applied.get(c.id) === h) return; // it is the team's change we just wrote here
    const waiting = pending.get(c.id);
    if (waiting ? hashOf(waiting) === h : own.get(c.id) === h) return; // already waiting / already sent exactly this
    applied.delete(c.id);
    pending.set(c.id, entry);
  };

  const scheduleFlush = (ms = PUSH_DELAY_MS) => {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => void flush(), ms);
  };

  /** Sends the unsent local changes. While offline the commit simply waits; the changes are also safe in PouchDB. */
  const flush = async () => {
    if (!alive || !ready || flushing || pending.size === 0) return;
    flushing = true;
    try {
      while (alive && pending.size > 0) {
        const part = [...pending.entries()].slice(0, PUSH_BATCH);
        const batch = fs.writeBatch(db);
        const now = new Date().toISOString();
        for (const [id, p] of part) {
          const data = p.deleted || !p.song ? tombstoneData(now) : toRemoteData(p.song);
          batch.set(fs.doc(songsCol, id), { ...data, by: email, serverAt: fs.serverTimestamp() });
          own.set(id, hashOf(p));
        }
        publish();
        await batch.commit();
        if (!alive) return;
        for (const [id, p] of part) if (pending.get(id) === p) pending.delete(id);
        failed = null;
        checkpoint();
        publish();
      }
    } catch (e) {
      fail(e);
      if (alive) scheduleFlush(RETRY_MS);
    } finally {
      flushing = false;
    }
  };

  /** Changes from the team (first call = everything since the last time this browser looked). */
  const onRemote = async (snap: QuerySnapshot) => {
    if (!alive) return;
    let newest = pulledAt;
    for (const ch of snap.docChanges()) {
      if (ch.type === "removed" || ch.doc.metadata.hasPendingWrites) continue; // our own unsent write: wait for the server's copy
      const id = ch.doc.id;
      const data = ch.doc.data();
      const at = (data.serverAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
      const remote = fromRemoteData(id, data);
      if (!remote || !at) continue;
      if (at > newest) newest = at;
      const mine = await readLocal(id);
      const p = pending.get(id);
      const d = decide(remote, mine, p, at > pulledAt, own.get(id));
      if (!alive) return;
      if (d === "apply" && remote.song) {
        applied.set(id, songHash(remote.song));
        own.delete(id);
        pending.delete(id);
        const { id: _id, ...rest } = remote.song;
        // 2026-11-25: slide sizes aren't in the team copy (Firestore rules) — keep this laptop's
        const doc: Record<string, unknown> = { ...rest, ...(mine?.slideSizes && !rest.slideSizes ? { slideSizes: mine.slideSizes } : {}), _id, type: "song" };
        Object.keys(doc).forEach((k) => doc[k] === undefined && delete doc[k]); // PouchDB rejects undefined in some adapters
        await upsertDoc("songs", doc as { _id: string });
      } else if (d === "remove") {
        applied.set(id, DELETED);
        own.delete(id);
        pending.delete(id);
        await removeDoc("songs", id);
      } else if (d === "drop") {
        pending.delete(id);
      }
    }
    if (!alive) return;
    if (!snap.metadata.fromCache) {
      // A real answer from the server (not the empty "you are offline" one).
      pulledAt = newest;
      ready = true;
      clearTimeout(readyTimer);
      failed = null;
      checkpoint();
      void flush();
    } else {
      ready = false; // Firestore says it lost the server: wait for its next real answer before sending
    }
    publish();
  };

  try {
    setStatus({ state: "connecting", message: undefined, pending: 0, team: status.teams.find((t) => t.id === teamId) ?? { id: teamId, name: teamName, ownerEmail: "", memberEmails: [] } });

    // 1) What changed here since the last sync (e.g. edits made offline, or everything on the first sync).
    const past = await local.changes({ since: seq, include_docs: true });
    if (!alive) return;
    for (const c of past.results) onLocal(c, true);
    const last = typeof past.last_seq === "number" ? past.last_seq : parseInt(String(past.last_seq), 10);
    if (isFinite(last) && last > seq) seq = last;

    // 2) Keep listening to local changes.
    const feed = local
      .changes({ since: seq, live: true, include_docs: true })
      .on("change", (c) => {
        void serial(async () => {
          if (!alive) return;
          onLocal(c, false);
          publish();
          scheduleFlush();
        });
      })
      .on("error", () => undefined);
    unsubs.push(() => feed.cancel());

    // 3) The team's changes since the last time we looked, then live.
    const since = fs.Timestamp.fromMillis(Math.max(0, pulledAt - PULL_OVERLAP_MS));
    unsubs.push(
      fs.onSnapshot(
        fs.query(songsCol, fs.where("serverAt", ">", since), fs.orderBy("serverAt")),
        { includeMetadataChanges: true },
        (snap) => void serial(() => onRemote(snap)).catch(fail),
        listenerFail,
      ),
    );

    // 4) The team itself: name + members (also tells us at once when we were removed).
    unsubs.push(
      fs.onSnapshot(
        fs.doc(db, "teams", teamId),
        (d) => {
          const t = d.exists() ? teamFromData(d.id, d.data()) : null;
          if (!alive || !t) return;
          setStatus({ team: t, teams: status.teams.some((x) => x.id === t.id) ? status.teams.map((x) => (x.id === t.id ? t : x)) : [...status.teams, t] });
          if (t.name !== loadTeamSettings().teamName && loadTeamSettings().teamId === t.id) saveTeamSettings({ ...loadTeamSettings(), teamName: t.name });
        },
        listenerFail,
      ),
    );

    const onNet = () => {
      clearTimeout(readyTimer);
      if (!navigator.onLine) {
        ready = false;
      } else if (!ready) {
        // Normally Firestore answers again within a moment. If the connection never really
        // dropped (a short blip) there is no new answer to wait for: carry on after a while.
        readyTimer = setTimeout(() => {
          if (!alive || ready) return;
          ready = true;
          void flush();
        }, ONLINE_WAIT_MS);
      }
      publish();
    };
    window.addEventListener("online", onNet);
    window.addEventListener("offline", onNet);
    unsubs.push(() => {
      window.removeEventListener("online", onNet);
      window.removeEventListener("offline", onNet);
    });
    publish();
  } catch (e) {
    fail(e);
  }
}
