/**
 * 2026-11-16: accounts — server side of the login (see src/lib/auth.ts).
 *
 *    GET  /api/auth/config   { couchUrl, signup } — which CouchDB holds the accounts, and
 *                            whether this server can create them
 *    POST /api/auth/signup   { church, email, password } → creates the CouchDB user
 *
 * Login / logout do NOT pass through here: the browser talks to CouchDB's /_session itself.
 * Sign-up needs a server because CouchDB 3 lets only an admin write to _users, and the admin
 * password must never reach the browser. It is read from .env:
 *    COUCHDB_URL (default http://localhost:5984), COUCHDB_ADMIN_USER, COUCHDB_ADMIN_PASSWORD
 *
 * New accounts get NO roles (= Free plan). The plan is a role ("plan:basic" / "plan:pro",
 * src/lib/entitlements.ts) that only an admin can set — later, the payment webhook.
 *
 * On the church laptop the server is open to the whole WiFi, so sign-up is accepted only from
 * the laptop itself. Behind a proxy (TRUST_PROXY=1 / Cloud Run) it is public, with a rate limit.
 */
import type { Express } from "express";
import { isLocal } from "./remoteServer";

const RL = {
  SIGNUP_WINDOW_MS: 60 * 60 * 1000,
  SIGNUP_MAX: 10, // sign-up tries per IP per hour
  COUCH_TIMEOUT_MS: 8000,
};
const PASSWORD_MIN = 8; // same as src/lib/auth.ts
const PASSWORD_MAX = 128;
const EMAIL_MAX = 80;
const CHURCH_MAX = 80;
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

const tries = new Map<string, { count: number; resetAt: number }>();
function tooMany(ip: string): boolean {
  const now = Date.now();
  let b = tries.get(ip);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + RL.SIGNUP_WINDOW_MS };
    tries.set(ip, b);
  }
  b.count += 1;
  return b.count > RL.SIGNUP_MAX;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, b] of tries) if (now >= b.resetAt) tries.delete(ip);
}, RL.SIGNUP_WINDOW_MS).unref();

/** Call after express.json() is registered. */
export function registerAuthRoutes(app: Express) {
  // Read here, not at import time: dotenv has not run yet when this file is first loaded.
  const couchUrl = (process.env.COUCHDB_URL || "http://localhost:5984").replace(/\/+$/, "");
  const adminUser = process.env.COUCHDB_ADMIN_USER || "";
  const adminPassword = process.env.COUCHDB_ADMIN_PASSWORD || "";
  const canSignup = !!adminUser && !!adminPassword;
  const publicSignup = process.env.TRUST_PROXY === "1" || !!process.env.K_SERVICE;

  app.get("/api/auth/config", (_req, res) => {
    res.json({ couchUrl, signup: canSignup });
  });

  app.post("/api/auth/signup", async (req, res) => {
    if (!publicSignup && !isLocal(req)) return res.status(403).json({ error: "Sa laptop na may app lang puwedeng gumawa ng account." });
    if (!canSignup) return res.status(503).json({ error: "Hindi pa naka-setup ang paggawa ng account sa server na ito." });
    if (tooMany(req.ip || "unknown")) return res.status(429).json({ error: "Sobrang daming subok. Subukan ulit mamaya." });

    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const church = typeof body.church === "string" ? body.church.trim().replace(/\s+/g, " ") : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) return res.status(400).json({ error: "Mali ang email." });
    if (church.length < 2 || church.length > CHURCH_MAX) return res.status(400).json({ error: `Ilagay ang pangalan ng simbahan (2–${CHURCH_MAX} characters).` });
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      return res.status(400).json({ error: `Dapat ${PASSWORD_MIN}–${PASSWORD_MAX} characters ang password.` });
    }

    try {
      const r = await fetch(`${couchUrl}/_users/${encodeURIComponent(`org.couchdb.user:${email}`)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(`${adminUser}:${adminPassword}`).toString("base64")}`,
        },
        // CouchDB hashes `password` itself and never stores it as typed.
        body: JSON.stringify({ name: email, type: "user", roles: [], password, church, createdAt: new Date().toISOString() }),
        signal: AbortSignal.timeout(RL.COUCH_TIMEOUT_MS),
      });
      if (r.status === 201 || r.status === 202) return res.status(201).json({ ok: true });
      if (r.status === 409) return res.status(409).json({ error: "May account na sa email na ito. Mag-login na lang." });
      // The reason stays in the server log (it can name the admin user); never log the body we sent.
      console.error(`[auth] signup: CouchDB answered HTTP ${r.status}${r.status === 401 ? " — check COUCHDB_ADMIN_USER / COUCHDB_ADMIN_PASSWORD" : ""}`);
      return res.status(502).json({ error: "Hindi nagawa ang account. Subukan ulit mamaya." });
    } catch (err) {
      console.error("[auth] signup: CouchDB not reachable:", (err as Error)?.message);
      return res.status(502).json({ error: "Hindi maabot ang account server. Subukan ulit mamaya." });
    }
  });
}
