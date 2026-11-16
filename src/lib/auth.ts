/**
 * 2026-11-16: account login with CouchDB's built-in authentication (_users + /_session cookie).
 *  - Login is OPTIONAL: songs, Bible and projection work with no account and no internet.
 *    An account only unlocks paid features (see lib/entitlements.ts).
 *  - One account = one church. The login name is the email used at sign-up.
 *  - The browser talks to CouchDB directly for login / logout / "who am I" (session cookie,
 *    HttpOnly). The password is only sent, never saved.
 *  - Sign-up goes through the app's server (POST /api/auth/signup, authServer.ts): CouchDB 3
 *    does not let visitors write to _users.
 *  - The last known name + roles are kept in this browser, so a church that paid is not locked
 *    out when the internet drops (OFFLINE_GRACE_MS). This is a convenience, not security:
 *    features that run on the laptop can only be soft-locked.
 *  - CouchDB's session lasts 10 minutes by default; while logged in the app checks the session
 *    every few minutes, which also renews the cookie.
 * No PouchDB in here, so the app bar can use it without loading the Simulator's chunk.
 */
import { useSyncExternalStore } from "react";

export const DEFAULT_ACCOUNT_URL = "http://localhost:5984";
const CACHE_KEY = "wtp-auth-v1";
const OFFLINE_GRACE_MS = 14 * 24 * 60 * 60 * 1000;
const KEEPALIVE_MS = 4 * 60 * 1000;
const SESSION_TIMEOUT_MS = 8000;
export const PASSWORD_MIN = 8;

export const trimUrl = (url: string) => url.replace(/\/+$/, "");

// ---------------------------------------------------------------- CouchDB session (any server)

export interface CouchSession {
  name: string | null;
  roles: string[];
  /** false = no answer from the server (offline, CouchDB stopped, CORS not set up). */
  reachable: boolean;
}

/** Who is logged in at that CouchDB (name null = nobody). */
export async function couchSession(base: string): Promise<CouchSession> {
  try {
    // The timeout matters: paid features wait for this answer (a server that never replies = offline).
    const res = await fetch(`${trimUrl(base)}/_session`, { credentials: "include", signal: AbortSignal.timeout(SESSION_TIMEOUT_MS) });
    if (res.status >= 500) return { name: null, roles: [], reachable: false };
    if (!res.ok) return { name: null, roles: [], reachable: true };
    const j = (await res.json()) as { userCtx?: { name?: unknown; roles?: unknown } };
    const name = typeof j.userCtx?.name === "string" && j.userCtx.name ? j.userCtx.name : null;
    const roles = Array.isArray(j.userCtx?.roles) ? j.userCtx.roles.filter((r): r is string => typeof r === "string") : [];
    return { name, roles: name ? roles : [], reachable: true };
  } catch {
    return { name: null, roles: [], reachable: false };
  }
}

/** Logs in (session cookie). The password is only sent, never saved. */
export async function couchLogin(base: string, name: string, password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${trimUrl(base)}/_session`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, error: "Mali ang username o password." };
    return { ok: false, error: `CouchDB: HTTP ${res.status}` };
  } catch {
    return { ok: false, error: "Hindi maabot ang CouchDB. Bukas ba ito, at naka-enable ang CORS (credentials) para sa address ng app?" };
  }
}

export async function couchLogout(base: string): Promise<void> {
  try {
    await fetch(`${trimUrl(base)}/_session`, { method: "DELETE", credentials: "include" });
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- account server

export interface AuthConfig {
  /** CouchDB that holds the accounts. */
  couchUrl: string;
  /** false = this server cannot create accounts (no admin login in .env, or no local server). */
  signup: boolean;
}

let config: Promise<AuthConfig> | null = null;
/** Asked once from the app's server; without it (e.g. static hosting) the default local CouchDB. */
export function getAuthConfig(): Promise<AuthConfig> {
  config ??= fetch("/api/auth/config")
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { couchUrl?: unknown; signup?: unknown } | null) => ({
      // Normally "/couch": CouchDB behind the app's own address (couchProxy.ts) — made absolute here.
      couchUrl: typeof j?.couchUrl === "string" && j.couchUrl ? trimUrl(new URL(j.couchUrl, window.location.origin).href) : DEFAULT_ACCOUNT_URL,
      signup: j?.signup === true,
    }))
    .catch(() => ({ couchUrl: DEFAULT_ACCOUNT_URL, signup: false }));
  return config;
}

// ---------------------------------------------------------------- account state

export interface AuthState {
  status: "loading" | "anon" | "user";
  name: string | null;
  roles: string[];
  /** true = the account server did not answer; name / roles are the last ones this browser saw. */
  offline: boolean;
}

interface Cached {
  name: string;
  roles: string[];
  checkedAt: number;
}

function loadCache(): Cached | null {
  try {
    const o = JSON.parse(window.localStorage.getItem(CACHE_KEY) || "null") as Partial<Cached> | null;
    if (!o || typeof o.name !== "string" || !o.name || typeof o.checkedAt !== "number" || !Array.isArray(o.roles)) return null;
    return { name: o.name, roles: o.roles.filter((r): r is string => typeof r === "string"), checkedAt: o.checkedAt };
  } catch {
    return null;
  }
}

function saveCache(c: Cached | null): void {
  try {
    if (c) window.localStorage.setItem(CACHE_KEY, JSON.stringify(c));
    else window.localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

let state: AuthState = { status: "loading", name: null, roles: [], offline: false };
const listeners = new Set<() => void>();
let started = false;
let checkNo = 0;

function setState(next: AuthState): void {
  const same = next.status === state.status && next.name === state.name && next.offline === state.offline && next.roles.join("\n") === state.roles.join("\n");
  if (same) return;
  state = next;
  listeners.forEach((fn) => fn());
}

export const getAuth = (): AuthState => state;

/** Asks the account server who is logged in and updates the state (and the offline copy). */
export async function refreshAuth(): Promise<AuthState> {
  const mine = ++checkNo;
  const { couchUrl } = await getAuthConfig();
  const s = await couchSession(couchUrl);
  if (mine !== checkNo) return state; // a newer check (e.g. right after login) wins
  if (s.reachable) {
    saveCache(s.name ? { name: s.name, roles: s.roles, checkedAt: Date.now() } : null);
    setState(s.name ? { status: "user", name: s.name, roles: s.roles, offline: false } : { status: "anon", name: null, roles: [], offline: false });
  } else {
    const c = loadCache();
    const fresh = c && Date.now() - c.checkedAt < OFFLINE_GRACE_MS && Date.now() >= c.checkedAt;
    setState(fresh ? { status: "user", name: c.name, roles: c.roles, offline: true } : { status: "anon", name: null, roles: [], offline: true });
  }
  return state;
}

function start(): void {
  if (started) return;
  started = true;
  void refreshAuth();
  // Only while logged in: keeps the 10-minute CouchDB session alive during a service,
  // and people without CouchDB don't get a failed request every few minutes.
  setInterval(() => state.status === "user" && void refreshAuth(), KEEPALIVE_MS);
  document.addEventListener("visibilitychange", () => !document.hidden && state.status === "user" && void refreshAuth());
}

/** Calls `fn` on every change. The first subscriber starts the session check. */
export function subscribeAuth(fn: () => void): () => void {
  listeners.add(fn);
  start();
  return () => {
    listeners.delete(fn);
  };
}

export const useAuth = (): AuthState => useSyncExternalStore(subscribeAuth, getAuth);

// "Open the Account window" from anywhere (e.g. a locked feature); the app bar listens.
const ACCOUNT_EVENT = "wtp-open-account";
export const openAccount = () => window.dispatchEvent(new Event(ACCOUNT_EVENT));
export function onOpenAccount(fn: () => void): () => void {
  window.addEventListener(ACCOUNT_EVENT, fn);
  return () => window.removeEventListener(ACCOUNT_EVENT, fn);
}

/** Emails are stored in small letters at sign-up; other names (e.g. a CouchDB admin) stay as typed. */
const cleanName = (name: string) => (name.includes("@") ? name.trim().toLowerCase() : name.trim());

export async function login(name: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const { couchUrl } = await getAuthConfig();
  const r = await couchLogin(couchUrl, cleanName(name), password);
  if (!r.ok) return r;
  const after = await refreshAuth();
  if (after.status !== "user") {
    // CouchDB said yes but the next request had no cookie: the browser refused to keep it.
    return { ok: false, error: "Tama ang password, pero hindi na-save ng browser ang session cookie. Dapat nasa parehong site ang app at ang CouchDB (o payagan ang cookies)." };
  }
  return { ok: true };
}

export async function logout(): Promise<void> {
  const { couchUrl } = await getAuthConfig();
  await couchLogout(couchUrl);
  // Even when the server was not reachable: this browser forgets the account.
  checkNo++;
  saveCache(null);
  setState({ status: "anon", name: null, roles: [], offline: false });
}

export interface SignupInput {
  church: string;
  email: string;
  password: string;
}

/** Creates the account on the server, then logs in. */
export async function signup(input: SignupInput): Promise<{ ok: boolean; error?: string }> {
  let res: Response;
  try {
    res = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  } catch {
    return { ok: false, error: "Hindi maabot ang server ng app." };
  }
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: unknown } | null;
    return { ok: false, error: typeof j?.error === "string" ? j.error : `Hindi nagawa ang account (HTTP ${res.status}).` };
  }
  return login(input.email, input.password);
}
