/**
 * 2026-11-17 (Jarvis): Team sync — the pure part (no Firebase, no DOM, no storage).
 * What a song looks like in Firestore, and who wins when the laptop and the team disagree.
 *
 * Firestore: teams/{teamId}/songs/{songId}
 *   { title, author, key, ccli, copyright?, lyrics, bgId?, bgSettings?, createdAt, updatedAt,
 *     deleted, by, serverAt }
 *   - A deleted song stays as an EMPTY doc with deleted: true ("tombstone"), so every laptop
 *     learns about the delete — also one that was offline for a week.
 *   - serverAt = Firestore server time of the last write; laptops only download what changed
 *     after the last time they looked (cheap on the free quota).
 */
import { StoredSong, sanitizeSong } from "./mySongsStore";

export const TEAM_LIMITS = { MAX_MEMBERS: 30, MAX_NAME: 60 };
/** Same id rule as sanitizeSong; also keeps "/" out of the Firestore path. */
export const TEAM_SONG_ID_RE = /^user-[\w-]{1,80}$/;
export const DELETED = "deleted";

/** Same text for the same song content (fixed key order), used to tell "nothing really changed". */
export function songHash(s: StoredSong): string {
  return JSON.stringify([s.id, s.title, s.author, s.key, s.ccli, s.copyright ?? "", s.lyrics, s.bgId ?? "", s.bgId ? s.bgSettings ?? null : null, s.createdAt, s.updatedAt]);
}

/** The song fields as saved in Firestore (no undefined: Firestore rejects it). `by` and `serverAt` are added by the caller. */
export function toRemoteData(s: StoredSong): Record<string, unknown> {
  const d: Record<string, unknown> = { title: s.title, author: s.author, key: s.key, ccli: s.ccli, lyrics: s.lyrics, createdAt: s.createdAt, updatedAt: s.updatedAt, deleted: false };
  if (s.copyright) d.copyright = s.copyright;
  if (s.bgId) {
    d.bgId = s.bgId;
    if (s.bgSettings) d.bgSettings = { dim: s.bgSettings.dim, blur: s.bgSettings.blur, fit: s.bgSettings.fit };
  }
  return d;
}

/** What replaces a deleted song: no lyrics stay in the cloud. */
export function tombstoneData(nowIso: string): Record<string, unknown> {
  return { title: "", author: "", key: "", ccli: "", lyrics: "", createdAt: nowIso, updatedAt: nowIso, deleted: true };
}

export interface RemoteSong {
  deleted: boolean;
  /** null when deleted. */
  song: StoredSong | null;
  updatedAt: string;
}

/** Cleans a doc read from Firestore (never trusted as is). null = not usable, skip it. */
export function fromRemoteData(id: string, data: unknown): RemoteSong | null {
  if (!TEAM_SONG_ID_RE.test(id) || !data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const updatedAt = typeof o.updatedAt === "string" ? o.updatedAt.slice(0, 40) : "";
  if (o.deleted === true) return { deleted: true, song: null, updatedAt };
  const song = sanitizeSong({ ...o, id });
  if (!song || song.id !== id) return null;
  return { deleted: false, song, updatedAt: song.updatedAt };
}

/** A change made on this laptop that the team does not have yet. */
export interface PendingLocal {
  deleted: boolean;
  song: StoredSong | null;
}

export const hashOf = (x: { deleted: boolean; song: StoredSong | null }): string => (x.deleted || !x.song ? DELETED : songHash(x.song));

const time = (iso: string): number => {
  const t = Date.parse(iso);
  return isFinite(t) ? t : 0;
};

/**
 * What to do with one song that came from the team:
 *  - "skip"  nothing (same content, or our own save coming back)
 *  - "apply" write the team's version here       - "remove" delete it here
 *  - "drop"  both sides already agree: forget our unsent change
 *  - "keep"  our unsent change wins and will be sent
 * `apply` / `remove` also forget the unsent change.
 *
 * Rules when BOTH sides changed the same song since the last sync (`isNew` + `pending`):
 *  - two edits            → the later save (updatedAt) wins; a tie keeps ours
 *  - our delete, their edit → their edit wins (never lose someone's work to a delete)
 *  - our edit, their delete → the later one wins
 */
export type Decision = "skip" | "apply" | "remove" | "drop" | "keep";

export function decide(
  remote: RemoteSong,
  local: StoredSong | null,
  pending: PendingLocal | undefined,
  /** The team's doc changed after the last time this laptop looked. */
  isNew: boolean,
  /** Hash of what this laptop last sent for this song (our own save coming back). */
  ownHash: string | undefined,
): Decision {
  const remoteHash = hashOf(remote);
  if (ownHash !== undefined && ownHash === remoteHash) return "skip";
  if (!pending) {
    if (remote.deleted) return local ? "remove" : "skip";
    return local && songHash(local) === remoteHash ? "skip" : "apply";
  }
  if (hashOf(pending) === remoteHash) return "drop";
  if (!isNew) return "keep";
  if (pending.deleted || !pending.song) return remote.deleted ? "drop" : "apply";
  if (remote.deleted) return time(remote.updatedAt) > time(pending.song.updatedAt) ? "remove" : "keep";
  return time(remote.updatedAt) > time(pending.song.updatedAt) ? "apply" : "keep";
}

// ---------------------------------------------------------------- team + members

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/** Lower-cased, trimmed email, or null when it does not look like one. */
export function cleanEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

/** Member list as saved: owner first, no doubles, at most MAX_MEMBERS. */
export function cleanMembers(ownerEmail: string, emails: readonly unknown[]): string[] {
  const out = [ownerEmail];
  for (const v of emails) {
    const e = cleanEmail(v);
    if (e && !out.includes(e) && out.length < TEAM_LIMITS.MAX_MEMBERS) out.push(e);
  }
  return out;
}

export const cleanTeamName = (v: unknown): string => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, TEAM_LIMITS.MAX_NAME) : "");

export interface TeamInfo {
  id: string;
  name: string;
  ownerEmail: string;
  memberEmails: string[];
}

/** Cleans a team doc read from Firestore. */
export function teamFromData(id: string, data: unknown): TeamInfo | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const ownerEmail = cleanEmail(o.ownerEmail);
  const name = cleanTeamName(o.name);
  if (!ownerEmail || !name || !Array.isArray(o.memberEmails)) return null;
  return { id, name, ownerEmail, memberEmails: cleanMembers(ownerEmail, o.memberEmails) };
}
