/**
 * 2026-11-16: what the server-side account features share (authServer / billingServer /
 * cloudServer / couchProxy): where CouchDB is, the admin login, and "who is asking".
 *
 * Two kinds of server run this code:
 *  - the HOSTED server: has the CouchDB admin login (and PayMongo keys). It creates accounts,
 *    takes payments and creates the cloud databases.
 *  - a church LAPTOP: has CLOUD_URL=https://<hosted app> instead. It has no admin login; its
 *    /couch and its account routes are passed on to the hosted server (couchProxy.ts).
 * With neither set it is a stand-alone install with its own CouchDB on localhost:5984.
 *
 * Read with couchEnv() at start-up, not at import time (dotenv has not run yet then).
 */
import type { Request } from "express";

const TIMEOUT_MS = 15000;

export interface UserDoc {
  _id: string;
  _rev: string;
  name: string;
  roles?: string[];
  [k: string]: unknown;
}

export function couchEnv() {
  const cloudUrl = /^https?:\/\//.test(process.env.CLOUD_URL || "") ? process.env.CLOUD_URL!.replace(/\/+$/, "") : null;
  const couchUrl = cloudUrl ? `${cloudUrl}/couch` : (process.env.COUCHDB_URL || "http://localhost:5984").replace(/\/+$/, "");
  const adminUser = cloudUrl ? "" : process.env.COUCHDB_ADMIN_USER || "";
  const adminPassword = cloudUrl ? "" : process.env.COUCHDB_ADMIN_PASSWORD || "";
  const hasAdmin = !!adminUser && !!adminPassword;
  const adminAuth = `Basic ${Buffer.from(`${adminUser}:${adminPassword}`).toString("base64")}`;

  /** A request to CouchDB as the server admin. */
  const couch = (path: string, init: RequestInit = {}) =>
    fetch(`${couchUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: adminAuth, ...(init.headers as Record<string, string>) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  const userPath = (name: string) => `/_users/${encodeURIComponent(`org.couchdb.user:${name}`)}`;

  async function getUser(name: string): Promise<UserDoc | null> {
    const r = await couch(userPath(name));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`CouchDB _users: HTTP ${r.status}`);
    return (await r.json()) as UserDoc;
  }

  /**
   * Whose CouchDB session cookie (AuthSession) came with this request — CouchDB is asked, the
   * cookie is never trusted by itself. Null = nobody. The browser sends that cookie to this
   * server because CouchDB is reached through this same address (/couch).
   */
  async function sessionOf(req: Request): Promise<{ name: string; roles: string[] } | null> {
    const m = /(?:^|;\s*)AuthSession=([^;]+)/.exec(String(req.headers.cookie || ""));
    if (!m) return null;
    try {
      const r = await fetch(`${couchUrl}/_session`, { headers: { Cookie: `AuthSession=${m[1]}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      const j = (await r.json()) as { userCtx?: { name?: unknown; roles?: unknown } };
      const name = typeof j.userCtx?.name === "string" && j.userCtx.name ? j.userCtx.name : null;
      if (!name) return null;
      return { name, roles: Array.isArray(j.userCtx?.roles) ? j.userCtx.roles.filter((x): x is string => typeof x === "string") : [] };
    } catch {
      return null;
    }
  }

  return { cloudUrl, couchUrl, hasAdmin, couch, userPath, getUser, sessionOf };
}

export type CouchEnv = ReturnType<typeof couchEnv>;

/** Cookie-authenticated POSTs: refuse pages of other sites (their Origin is not ours). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(String(origin)).host === req.headers.host;
  } catch {
    return false;
  }
}
