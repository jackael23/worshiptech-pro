/**
 * 2026-10-29 (Jarvis): Phone remote — the local server is the bridge between the laptop
 * (Simulator, "host") and phones on the same WiFi ("remotes", opened at /?remote).
 *
 *  Host (laptop) — ONLY from this computer (127.0.0.1 / ::1):
 *    GET  /api/remote/info         PIN + LAN links + how many phones are connected
 *    POST /api/remote/new-pin      new PIN; every connected phone is logged out
 *    GET  /api/remote/host-events  SSE: commands from phones + phone count + which tab is in charge
 *    POST /api/remote/host-state   snapshot (live screen + schedule) → sent to all phones
 *    POST /api/remote/take-over    this tab becomes the one the phones follow
 *  Remote (phone) — needs the PIN:
 *    POST /api/remote/login        {pin} → {token}   (limited tries per IP)
 *    GET  /api/remote/events       SSE (?token=): snapshots + whether the laptop is connected
 *    POST /api/remote/cmd          {cmd} with header X-Remote-Token
 *    GET  /api/remote/check        200 = token still valid, 401 = log in again
 *
 * Uses Server-Sent Events (plain HTTP) — no extra packages. The PIN changes every time
 * the server starts, and is only shown on the laptop (and in the server console).
 *
 * 2026-11-05: only ONE laptop tab is in charge ("active host"). Each tab keeps its own schedule
 * (browser storage), so before, the phone showed whichever tab sent last, and phone commands
 * ran in every tab. Now the newest tab takes over; snapshots from other tabs are refused (409),
 * commands go to the active tab only, and the other tabs are told so (they show a warning).
 * Header X-Host-Id = the id the tab got in its "role" message on host-events.
 */
import express, { Express, Request, Response } from "express";
import crypto from "crypto";
import os from "os";

const RL = {
  LOGIN_WINDOW_MS: 5 * 60 * 1000,
  LOGIN_MAX: 10, // PIN tries per IP per 5 minutes
  MAX_REMOTES: 10, // phones connected at the same time
  MAX_HOSTS: 4, // laptop tabs with the Simulator open
  CMD_PER_SEC: 20, // commands per phone per second
  STATE_BODY: "3mb", // snapshot (includes small slide pictures)
  CMD_BODY: "4kb",
  ALERT_MAX: 200,
  HEARTBEAT_MS: 15000,
};

const ALLOWED_CMDS = ["next", "prev", "golive", "black", "clear", "logo", "live", "select", "alert"] as const;
type RemoteCmd =
  | { type: "next" | "prev" | "golive" | "black" | "clear" | "logo" }
  | { type: "live" | "select"; itemId: string; slide: number }
  | { type: "alert"; text: string; show: boolean };

function isLocal(req: Request): boolean {
  const a = req.socket.remoteAddress || "";
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}

function newPin(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function lanUrls(port: number): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === "IPv4" && !ni.internal) out.push(`http://${ni.address}:${port}/?remote`);
    }
  }
  return out;
}

/** Validates a command from a phone; returns a clean copy or null. */
function cleanCmd(raw: unknown): RemoteCmd | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const type = c.type;
  if (typeof type !== "string" || !(ALLOWED_CMDS as readonly string[]).includes(type)) return null;
  if (type === "live" || type === "select") {
    if (typeof c.itemId !== "string" || c.itemId.length > 100) return null;
    const slide = Number(c.slide);
    if (!Number.isInteger(slide) || slide < 0 || slide > 10000) return null;
    return { type, itemId: c.itemId, slide };
  }
  if (type === "alert") {
    if (typeof c.text !== "string") return null;
    return { type, text: c.text.slice(0, RL.ALERT_MAX), show: c.show === true };
  }
  return { type } as RemoteCmd;
}

function openSse(res: Response) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 2000\n\n");
}
const send = (res: Response, data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

export function registerRemoteRoutes(app: Express, port: number) {
  let pin = newPin();
  const tokens = new Set<string>();
  const hosts = new Map<Response, string>(); // res → host id
  let activeHost: Response | null = null;
  const remotes = new Map<Response, string>(); // res → token
  const loginTries = new Map<string, { count: number; resetAt: number }>();
  const cmdRate = new Map<string, { count: number; at: number }>();
  let lastState = ""; // last snapshot (JSON), sent to phones when they connect

  const log = () => {
    console.log(`📱 Phone remote PIN: ${pin}`);
    for (const u of lanUrls(port)) console.log(`   ${u}`);
  };
  log();

  const tellHosts = (data: unknown) => hosts.forEach((_id, h) => send(h, data));
  const setActive = (res: Response | null) => {
    if (activeHost !== res) lastState = ""; // the new tab sends its own snapshot right away
    activeHost = res;
    hosts.forEach((id, h) => send(h, { type: "role", hostId: id, active: h === res }));
  };
  const isActiveId = (req: Request) => {
    const id = String(req.get("X-Host-Id") || "");
    return !!activeHost && !!id && hosts.get(activeHost) === id;
  };
  const tellRemotes = (data: unknown) => remotes.forEach((_t, r) => send(r, data));
  const counts = () => {
    tellHosts({ type: "remotes", count: remotes.size });
    tellRemotes({ type: "host", connected: hosts.size > 0 });
  };

  setInterval(() => {
    hosts.forEach((_id, h) => h.write(": ping\n\n"));
    remotes.forEach((_t, r) => r.write(": ping\n\n"));
    const now = Date.now();
    for (const [k, v] of loginTries) if (now >= v.resetAt) loginTries.delete(k);
    for (const k of cmdRate.keys()) if (!tokens.has(k)) cmdRate.delete(k);
  }, RL.HEARTBEAT_MS).unref();

  const localOnly = (req: Request, res: Response, next: () => void) => {
    if (!isLocal(req)) return res.status(403).json({ error: "Sa laptop lang ito (localhost)." });
    next();
  };
  const tokenOf = (req: Request) => String(req.get("X-Remote-Token") || req.query.token || "");

  // ----- host (laptop) -----
  app.get("/api/remote/info", localOnly, (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ pin, urls: lanUrls(port), remotes: remotes.size });
  });

  app.post("/api/remote/new-pin", localOnly, (_req, res) => {
    pin = newPin();
    tokens.clear();
    remotes.forEach((_t, r) => {
      send(r, { type: "logout" });
      r.end();
    });
    remotes.clear();
    log();
    counts();
    res.json({ pin });
  });

  app.get("/api/remote/host-events", localOnly, (req, res) => {
    if (hosts.size >= RL.MAX_HOSTS) return res.status(429).end();
    openSse(res);
    hosts.set(res, crypto.randomBytes(12).toString("hex"));
    setActive(res); // the newest tab takes over
    send(res, { type: "remotes", count: remotes.size });
    counts();
    req.on("close", () => {
      hosts.delete(res);
      if (activeHost === res) setActive([...hosts.keys()].pop() ?? null); // next newest tab
      counts();
    });
  });

  app.post("/api/remote/take-over", localOnly, (req, res) => {
    const id = String(req.get("X-Host-Id") || "");
    const h = [...hosts].find(([, hid]) => hid === id)?.[0];
    if (!h) return res.status(404).end();
    setActive(h);
    res.status(204).end();
  });

  app.post("/api/remote/host-state", localOnly, express.json({ limit: RL.STATE_BODY }), (req, res) => {
    if (!isActiveId(req)) return res.status(409).end(); // another tab is in charge
    if (!req.body || typeof req.body !== "object") return res.status(400).end();
    lastState = JSON.stringify({ type: "state", state: req.body });
    remotes.forEach((_t, r) => r.write(`data: ${lastState}\n\n`));
    res.status(204).end();
  });

  // ----- remote (phone) -----
  app.post("/api/remote/login", express.json({ limit: "1kb" }), (req, res) => {
    const ip = req.socket.remoteAddress || "?";
    const now = Date.now();
    let t = loginTries.get(ip);
    if (!t || now >= t.resetAt) {
      t = { count: 0, resetAt: now + RL.LOGIN_WINDOW_MS };
      loginTries.set(ip, t);
    }
    if (t.count >= RL.LOGIN_MAX) {
      res.set("Retry-After", String(Math.ceil((t.resetAt - now) / 1000)));
      return res.status(429).json({ error: "Sobrang daming mali. Subukan ulit pagkalipas ng ilang minuto." });
    }
    const given = String(req.body?.pin ?? "").trim();
    const ok = given.length === pin.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(pin));
    if (!ok) {
      t.count += 1;
      return res.status(401).json({ error: "Maling PIN." });
    }
    loginTries.delete(ip);
    const token = crypto.randomBytes(24).toString("hex");
    tokens.add(token);
    res.json({ token });
  });

  app.get("/api/remote/check", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.status(tokens.has(tokenOf(req)) ? 200 : 401).json({ host: hosts.size > 0 });
  });

  app.get("/api/remote/events", (req, res) => {
    const token = tokenOf(req);
    if (!tokens.has(token)) return res.status(401).end();
    if (remotes.size >= RL.MAX_REMOTES) return res.status(429).end();
    openSse(res);
    remotes.set(res, token);
    send(res, { type: "host", connected: hosts.size > 0 });
    if (lastState) res.write(`data: ${lastState}\n\n`);
    counts();
    req.on("close", () => {
      remotes.delete(res);
      counts();
    });
  });

  app.post("/api/remote/cmd", express.json({ limit: RL.CMD_BODY }), (req, res) => {
    const token = tokenOf(req);
    if (!tokens.has(token)) return res.status(401).json({ error: "Mag-login ulit (PIN)." });
    const now = Date.now();
    const r = cmdRate.get(token);
    if (r && now - r.at < 1000) {
      if (++r.count > RL.CMD_PER_SEC) return res.status(429).end();
    } else cmdRate.set(token, { count: 1, at: now });
    const cmd = cleanCmd(req.body?.cmd);
    if (!cmd) return res.status(400).json({ error: "Hindi kilalang command." });
    if (!activeHost) return res.status(409).json({ error: "Buksan ang Simulator sa laptop." });
    send(activeHost, { type: "cmd", cmd }); // only the tab in charge runs phone commands
    res.status(204).end();
  });
}
