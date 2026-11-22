/**
 * 2026-11-16: account login, first with CouchDB's built-in authentication.
 * 2026-11-21 (Mira): the ACCOUNT is now a Google login (Firebase Auth) and the plan is read from
 *   Firestore accounts/{uid} — see "account state" below. The CouchDB session helpers stay here
 *   because the "Sariling CouchDB (advanced)" sync panel and couchSync.ts still use them.
 *  - Login is OPTIONAL: songs, Bible and projection work with no account and no internet.
 *    An account only unlocks paid features (see lib/entitlements.ts).
 *  - One account = one church = one Google account.
 *  - The last known name + plan are kept in this browser, so a church that paid is not locked
 *    out when the internet drops (OFFLINE_GRACE_MS). This is a convenience, not security:
 *    features that run on the laptop can only be soft-locked.
 * 2026-11-22 (Mira): + email + password login (signUpEmail / loginEmail / resetPassword). Same
 *   Firebase user and plan doc; `verified` says whether the email was confirmed (sync needs it).
 * No PouchDB in here, so the app bar can use it without loading the Simulator's chunk.
 */
import { useSyncExternalStore } from "react";
import type { User } from "firebase/auth";
import { Plan, planFromAccountDoc, rolesOfPlan } from "./entitlements";
import {
  MIN_PASSWORD,
  REQUIRE_EMAIL_VERIFICATION,
  describeAuthError,
  emailSignIn,
  emailSignUp,
  googleSignIn,
  googleSignOut,
  isFirebaseAvailable,
  isFirebaseLoaded,
  loadFirebase,
  onFirebaseUser,
  reloadFirebaseUser,
  resendVerification,
  sendPasswordReset,
} from "./firebase";
import { saveProfile } from "./admin";

export const DEFAULT_ACCOUNT_URL = "http://localhost:5984";
// 2026-11-21: v2 = Google account (uid + plan); the old CouchDB copy (v1) is simply not read.
const CACHE_KEY = "wtp-auth-v2";
const OFFLINE_GRACE_MS = 14 * 24 * 60 * 60 * 1000;
const SESSION_TIMEOUT_MS = 8000;

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

// ---------------------------------------------------------------- account state (Google / Firebase)
// 2026-11-21 (Mira): the account is now a Google login (Firebase Auth), so it works on the
// static Firebase Hosting site too — the old CouchDB account needed the app's own server
// (/api/auth), which Firebase Hosting does not have. The plan comes from Firestore
// accounts/{uid} (see planFromAccountDoc in entitlements.ts). The shape of AuthState did not
// change, so every hasFeature(planFromRoles(auth.roles), …) check works as before.

export interface AuthState {
  status: "loading" | "anon" | "user";
  /** Email of the account (lower-case): Google, or email + password. */
  name: string | null;
  /** 2026-11-22: false = email + password account whose email is not confirmed yet (sync waits). */
  verified: boolean;
  /** Firebase uid: the id Jack uses in accounts/{uid} to set the plan. */
  uid: string | null;
  roles: string[];
  /** End of the paid period (ISO), null = none / set by hand without an end. */
  expiresAt: string | null;
  /** true = the plan could not be read just now; name / roles are the last ones this browser saw. */
  offline: boolean;
}

interface Cached {
  name: string;
  uid: string;
  plan: Plan;
  expiresAt: string | null;
  checkedAt: number;
  /** 2026-11-22; missing in older copies = verified (they were all Google). */
  verified?: boolean;
}

function loadCache(): Cached | null {
  try {
    const o = JSON.parse(window.localStorage.getItem(CACHE_KEY) || "null") as Partial<Cached> | null;
    if (!o || typeof o.name !== "string" || !o.name || typeof o.uid !== "string" || !o.uid || typeof o.checkedAt !== "number") return null;
    const plan: Plan = o.plan === "basic" || o.plan === "pro" ? o.plan : "free";
    return { name: o.name, uid: o.uid, plan, expiresAt: typeof o.expiresAt === "string" ? o.expiresAt : null, checkedAt: o.checkedAt, verified: o.verified !== false };
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

/**
 * "Someone is signed in to Google on this browser" — kept apart from the plan copy, so a login
 * whose plan could not be read (offline) is still picked up after a reload.
 */
const SIGNED_IN_KEY = "wtp-auth-signed-in";
function setSignedIn(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(SIGNED_IN_KEY, "1");
    else window.localStorage.removeItem(SIGNED_IN_KEY);
  } catch {
    /* ignore */
  }
}
function wasSignedIn(): boolean {
  try {
    return window.localStorage.getItem(SIGNED_IN_KEY) === "1";
  } catch {
    return false;
  }
}

const isFresh = (c: Cached) => Date.now() - c.checkedAt < OFFLINE_GRACE_MS && Date.now() >= c.checkedAt;
/** A cached plan whose end date (plus grace) has passed counts as Free, also offline. */
const cachedPlan = (c: Cached): Plan => planFromAccountDoc({ plan: c.plan, expiresAt: c.expiresAt ?? undefined }).plan;
const ANON: AuthState = { status: "anon", name: null, uid: null, verified: false, roles: [], expiresAt: null, offline: false };

let state: AuthState = { ...ANON, status: "loading" };
const listeners = new Set<() => void>();
let started = false;
let checkNo = 0;

function setState(next: AuthState): void {
  const same =
    next.status === state.status && next.name === state.name && next.uid === state.uid && next.offline === state.offline && next.verified === state.verified &&
    next.expiresAt === state.expiresAt && next.roles.join("\n") === state.roles.join("\n");
  if (same) return;
  state = next;
  listeners.forEach((fn) => fn());
}

export const getAuth = (): AuthState => state;

/** Reads the plan of this Google user from Firestore and updates the state (and the offline copy). */
async function applyUser(u: User | null): Promise<AuthState> {
  const mine = ++checkNo;
  if (!u) {
    saveCache(null);
    setSignedIn(false);
    setState(ANON);
    return state;
  }
  setSignedIn(true);
  const name = (u.email || u.uid).trim().toLowerCase();
  const verified = u.emailVerified;
  try {
    const { db, fs } = await loadFirebase();
    const snap = await fs.getDoc(fs.doc(db, "accounts", u.uid));
    if (mine !== checkNo) return state; // a newer check (e.g. right after login) wins
    const { plan, expiresAt } = planFromAccountDoc(snap.exists() ? snap.data() : null);
    saveCache({ name, uid: u.uid, plan, expiresAt, checkedAt: Date.now(), verified });
    setState({ status: "user", name, uid: u.uid, verified, roles: rolesOfPlan(plan), expiresAt, offline: false });
    // 2026-11-22 (Mira): email + name for the admin's account list (once a day; a failure changes nothing here).
    // Only a confirmed email, so nobody can put someone else's address in Jack's list.
    // (While REQUIRE_EMAIL_VERIFICATION is off — testing — every account is listed.)
    if (verified || !REQUIRE_EMAIL_VERIFICATION) void saveProfile(u).catch(() => undefined);
  } catch {
    // Offline (or Firestore not reachable): Google still knows who this is; the plan is the last one seen.
    if (mine !== checkNo) return state;
    const c = loadCache();
    const same = c && c.uid === u.uid && isFresh(c);
    setState({ status: "user", name, uid: u.uid, verified, roles: same ? rolesOfPlan(cachedPlan(c)) : [], expiresAt: same ? c.expiresAt : null, offline: true });
  }
  return state;
}

/** Asks again who is logged in and what plan they have (e.g. after Jack changed the plan). */
export async function refreshAuth(): Promise<AuthState> {
  if (!isFirebaseAvailable()) {
    setState(ANON);
    return state;
  }
  try {
    const { auth } = await loadFirebase();
    await auth.authStateReady();
    // 2026-11-22: not verified yet → ask Firebase again (the link may have been clicked in another tab).
    // reloadFirebaseUser tells every listener (this file included), so nothing more to do here.
    if (REQUIRE_EMAIL_VERIFICATION && auth.currentUser && !auth.currentUser.emailVerified) {
      try {
        await reloadFirebaseUser();
        return state;
      } catch {
        /* offline: fall through with what Firebase remembers */
      }
    }
    return await applyUser(auth.currentUser);
  } catch {
    // Firebase itself could not load (offline on a browser that never loaded it): keep the offline copy.
    const c = loadCache();
    if (c && isFresh(c)) setState({ status: "user", name: c.name, uid: c.uid, verified: c.verified !== false, roles: rolesOfPlan(cachedPlan(c)), expiresAt: c.expiresAt, offline: true });
    else setState({ ...ANON, offline: true });
    return state;
  }
}

function start(): void {
  if (started) return;
  started = true;
  // Hear every login / logout, also the ones made from the Team sync panel (same Google login).
  onFirebaseUser((u) => void applyUser(u));
  const c = loadCache();
  if (c && isFresh(c)) {
    // Someone logged in on this browser before: show that at once, then confirm with Firebase.
    setState({ status: "user", name: c.name, uid: c.uid, verified: c.verified !== false, roles: rolesOfPlan(cachedPlan(c)), expiresAt: c.expiresAt, offline: false });
    void refreshAuth();
  } else if (wasSignedIn() && isFirebaseAvailable()) {
    // Signed in, but no recent plan copy (e.g. the plan could not be read last time): ask Firebase.
    setState({ ...ANON, status: "loading" });
    void refreshAuth();
  } else {
    // Nobody logged in here: do not load the Firebase SDK on first paint (free features need no account).
    saveCache(null);
    setState(ANON);
  }
  // Back to the app (e.g. after the plan was changed): read the plan again.
  document.addEventListener("visibilitychange", () => !document.hidden && state.status === "user" && isFirebaseLoaded() && void refreshAuth());
}

/** Calls `fn` on every change. The first subscriber starts the check. */
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

/** Google sign-in (popup), then reads the plan. */
export async function login(): Promise<{ ok: boolean; error?: string }> {
  if (!isFirebaseAvailable()) return { ok: false, error: "Hindi pa naka-setup ang Google sign-in sa app na ito." };
  try {
    const u = await googleSignIn();
    await applyUser(u);
    return { ok: true };
  } catch (e) {
    const code = (e as { code?: string })?.code || "";
    return { ok: false, error: describeAuthError(code) ?? (code ? `Error: ${code}` : "Hindi naka-login. Subukan ulit.") };
  }
}

// ---------------------------------------------------------------- email + password (2026-11-22, Mira)

type Result = { ok: boolean; error?: string };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const authFail = (e: unknown, fallback: string): Result => {
  const code = (e as { code?: string })?.code || "";
  return { ok: false, error: describeAuthError(code) ?? (code ? `Error: ${code}` : fallback) };
};

function checkInput(email: string, password?: string): string | null {
  if (!isFirebaseAvailable()) return "Hindi pa naka-setup ang login sa app na ito.";
  if (!EMAIL_RE.test(email.trim())) return "Mali ang email. Ilagay ang buong email address.";
  if (password !== undefined && !password) return "Ilagay ang password.";
  return null;
}

/** New email + password account; a verification email is sent. */
export async function signUpEmail(email: string, password: string, confirm: string): Promise<Result> {
  const bad = checkInput(email, password);
  if (bad) return { ok: false, error: bad };
  if (password.length < MIN_PASSWORD) return { ok: false, error: `Ang password ay dapat hindi bababa sa ${MIN_PASSWORD} character.` };
  if (password !== confirm) return { ok: false, error: "Hindi magkapareho ang dalawang password." };
  try {
    await applyUser(await emailSignUp(email, password));
    return { ok: true };
  } catch (e) {
    return authFail(e, "Hindi nagawa ang account. Subukan ulit.");
  }
}

/** Email + password login. */
export async function loginEmail(email: string, password: string): Promise<Result> {
  const bad = checkInput(email, password);
  if (bad) return { ok: false, error: bad };
  try {
    await applyUser(await emailSignIn(email, password));
    return { ok: true };
  } catch (e) {
    return authFail(e, "Hindi naka-login. Subukan ulit.");
  }
}

/** "Nakalimutan ang password": sends the reset email. */
export async function resetPassword(email: string): Promise<Result> {
  const bad = checkInput(email);
  if (bad) return { ok: false, error: bad };
  try {
    await sendPasswordReset(email);
    return { ok: true };
  } catch (e) {
    return authFail(e, "Hindi naipadala. Subukan ulit.");
  }
}

/** Sends the verification email again. */
export async function resendVerifyEmail(): Promise<Result> {
  try {
    await resendVerification();
    return { ok: true };
  } catch (e) {
    return authFail(e, "Hindi naipadala. Subukan ulit.");
  }
}

/** "Na-verify ko na": asks Firebase again. ok = verified now. */
export async function checkVerified(): Promise<Result> {
  try {
    const u = await reloadFirebaseUser();
    if (u?.emailVerified) return { ok: true };
    return { ok: false, error: "Hindi pa verified. Buksan ang link sa email (tingnan din ang Spam), saka pindutin ulit." };
  } catch (e) {
    return authFail(e, "Hindi ma-check ngayon. Subukan ulit.");
  }
}

/** Logs out of Google (this also ends Team sync's login: it is the same one). */
export async function logout(): Promise<void> {
  checkNo++;
  await googleSignOut();
  // Even when Firebase was not reachable: this browser forgets the account.
  saveCache(null);
  setSignedIn(false);
  setState(ANON);
}
