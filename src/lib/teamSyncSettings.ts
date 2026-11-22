/**
 * 2026-11-17 (Jarvis): Team sync settings — "is Team sync on, and for which team".
 * Kept apart from teamSync.ts on purpose: this file has NO Firebase import, so couchSync.ts can
 * ask "is Team sync on?" without pulling the Firebase SDK into the first page load.
 *  - Settings: localStorage "wtp-team-sync-v1".
 *  - Checkpoint per team: localStorage "wtp-team-sync-state-v1:<teamId>" — how far this browser's
 *    songs were already sent (PouchDB seq) and received (Firestore server time).
 */
import { useSyncExternalStore } from "react";

export interface TeamSyncSettings {
  enabled: boolean;
  teamId: string;
  teamName: string;
  /** 2026-11-22 (Mira): true = the user turned sync off by hand, so a Google login no longer turns it on by itself. */
  autoOff?: boolean;
}

const SETTINGS_KEY = "wtp-team-sync-v1";
const STATE_KEY = "wtp-team-sync-state-v1:";
const OFF: TeamSyncSettings = { enabled: false, teamId: "", teamName: "" };

/** Firebase uids (= team ids) are letters and digits; keep it strict because it becomes a storage key and a path. */
export const TEAM_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function read(): TeamSyncSettings {
  try {
    const o = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "null") as Partial<TeamSyncSettings> | null;
    if (!o || typeof o.teamId !== "string" || !TEAM_ID_RE.test(o.teamId)) return OFF;
    return { enabled: o.enabled === true, teamId: o.teamId, teamName: typeof o.teamName === "string" ? o.teamName.slice(0, 60) : "", autoOff: o.autoOff === true };
  } catch {
    return OFF;
  }
}

let current: TeamSyncSettings | null = null;
const listeners = new Set<() => void>();

export function loadTeamSettings(): TeamSyncSettings {
  current ??= read();
  return current;
}

export function saveTeamSettings(next: TeamSyncSettings): void {
  current = next;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* ignore: stays on for this page only */
  }
  listeners.forEach((fn) => fn());
}

/** true = songs belong to Team sync right now, so the CouchDB sync leaves the songs database alone. */
export const isTeamSyncOn = (): boolean => loadTeamSettings().enabled;

export function subscribeTeamSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export const useTeamSettings = (): TeamSyncSettings => useSyncExternalStore(subscribeTeamSettings, loadTeamSettings);

// ---------------------------------------------------------------- checkpoint

export interface TeamCheckpoint {
  /** Local songs DB (PouchDB) changes up to this seq were sent to the team. */
  seq: number;
  /** Team changes up to this server time (ms) were received here. */
  pulledAt: number;
}

/** null = this browser never synced with that team (the first sync is a merge: nothing is deleted). */
export function loadCheckpoint(teamId: string): TeamCheckpoint | null {
  try {
    const o = JSON.parse(window.localStorage.getItem(STATE_KEY + teamId) || "null") as Partial<TeamCheckpoint> | null;
    if (!o || typeof o.seq !== "number" || !isFinite(o.seq) || typeof o.pulledAt !== "number" || !isFinite(o.pulledAt)) return null;
    return { seq: Math.max(0, o.seq), pulledAt: Math.max(0, o.pulledAt) };
  } catch {
    return null;
  }
}

export function saveCheckpoint(teamId: string, c: TeamCheckpoint): void {
  try {
    window.localStorage.setItem(STATE_KEY + teamId, JSON.stringify(c));
  } catch {
    /* ignore: the next start repeats some work, nothing is lost */
  }
}
