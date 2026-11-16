/**
 * 2026-11-16: CouchDB behind the app's own address.
 *
 *    /couch/_session             login / logout / who am I
 *    /couch/wtpc-<id>-<kind>/…   a church's cloud databases (cloudServer.ts)
 *
 * Why: the login is a cookie, and browsers only keep and send a cookie reliably to the site the
 * page itself came from. With CouchDB at <app>/couch the same cookie works for the login, for
 * sync and for the server routes that need to know who is asking — on the hosted site and on
 * a church laptop alike, with no CORS set-up.
 *
 * Only those two kinds of path pass. Not _users, _all_dbs, _node, Fauxton or any other
 * database: a laptop's server is open to the whole WiFi, and CouchDB's admin side must not be.
 * The Authorization header is dropped (cookie login only), and login tries are limited per IP.
 *
 * On a church laptop (CLOUD_URL set) CouchDB is the hosted server's /couch, and the account
 * routes (/api/auth, /api/billing, /api/cloud) are passed on to the hosted server as well.
 * Bodies are streamed, never buffered (a Media video can be hundreds of MB).
 */
import type { Express, Request, Response } from "express";
import http from "http";
import https from "https";
import { couchEnv, sameOrigin } from "./serverCouch";
import { isLocal } from "./remoteServer";

const ALLOWED = /^\/(_session|wtpc-[0-9a-f]{32}-[a-z]{1,20})(\/|$)/;
const LOGIN = { WINDOW_MS: 5 * 60 * 1000, MAX: 20 };

const logins = new Map<string, { count: number; resetAt: number }>();
function tooManyLogins(ip: string): boolean {
  const now = Date.now();
  let b = logins.get(ip);
  if (!b || now >= b.resetAt) logins.set(ip, (b = { count: 0, resetAt: now + LOGIN.WINDOW_MS }));
  return ++b.count > LOGIN.MAX;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, b] of logins) if (now >= b.resetAt) logins.delete(ip);
}, LOGIN.WINDOW_MS).unref();

/** Sends the request on to `base` + `path` and streams the answer back. */
function pass(req: Request, res: Response, base: URL, path: string, opts: { dropAuthorization: boolean }) {
  const headers: http.OutgoingHttpHeaders = { ...req.headers, host: base.host };
  delete headers.origin; // server-to-server from here on
  delete headers.referer;
  if (opts.dropAuthorization) delete headers.authorization;
  const up = (base.protocol === "https:" ? https : http).request(
    { protocol: base.protocol, hostname: base.hostname, port: base.port || undefined, method: req.method, path: base.pathname.replace(/\/+$/, "") + path, headers },
    (ur) => {
      const h = { ...ur.headers };
      // The cookie belongs to THIS address now: no Domain; no Secure when the page is plain http (laptop).
      if (h["set-cookie"]) h["set-cookie"] = h["set-cookie"].map((c) => (req.secure ? c : c.replace(/;\s*Secure/gi, "")).replace(/;\s*Domain=[^;]*/gi, ""));
      res.writeHead(ur.statusCode || 502, h);
      ur.pipe(res);
    },
  );
  up.on("error", () => {
    if (res.headersSent) res.destroy();
    else res.status(502).json({ error: "bad_gateway", reason: "Hindi maabot ang server." });
  });
  res.on("close", () => up.destroy()); // e.g. a _changes long-poll the browser gave up on
  req.pipe(up);
}

/** Register BEFORE express.json() and before the routes it may pass on. */
export function registerCouchProxy(app: Express) {
  const { couchUrl, cloudUrl } = couchEnv();
  const couch = new URL(couchUrl);

  app.use("/couch", (req, res) => {
    const pathname = req.url.split("?")[0];
    if (!ALLOWED.test(pathname) || pathname.includes("..")) return res.status(404).json({ error: "not_found" });
    if (req.method === "POST" && pathname === "/_session" && tooManyLogins(req.ip || "unknown")) {
      return res.status(429).json({ error: "too_many_requests", reason: "Sobrang daming subok mag-login. Subukan ulit mamaya." });
    }
    pass(req, res, couch, req.url, { dropAuthorization: true });
  });

  if (cloudUrl) {
    const cloud = new URL(cloudUrl);
    app.use(["/api/auth", "/api/billing", "/api/cloud"], (req, res) => {
      if (req.method !== "GET" && !sameOrigin(req)) return res.status(403).json({ error: "Hindi pinapayagan." });
      // Same rule as on a stand-alone laptop: accounts are made from the laptop itself, not from the WiFi.
      if (req.originalUrl.startsWith("/api/auth/signup") && !isLocal(req)) return res.status(403).json({ error: "Sa laptop na may app lang puwedeng gumawa ng account." });
      pass(req, res, cloud, req.originalUrl, { dropAuthorization: true });
    });
  }
}
