import express from "express";
import path from "path";
import dotenv from "dotenv";
import { isLocal, registerRemoteRoutes } from "./remoteServer";
import { registerAuthRoutes } from "./authServer";
import { registerBillingRoutes } from "./billingServer";
import { registerCloudRoutes } from "./cloudServer";
import { registerCouchProxy } from "./couchProxy";

dotenv.config();

// 2026-10-20 (Jarvis): removed __filename/__dirname (import.meta.url) — unused, and
// it is undefined in the CJS bundle from `npm run build`, so `npm start` crashed.

// 2026-11-17 (Jarvis): the Gemini AI chat (/api/chat, its rate limiter and system prompt) was
// removed — the Chat tab is now offline Help that runs in the browser (src/lib/helpSearch.ts),
// so no API key and no server are needed for it.
const JSON_BODY_MAX = "64kb";

// ---------------------------------------------------------------------------
// 2026-11-05 (Jarvis): auto-stop — when the app is closed on the laptop, the server
// (the CMD window) stops by itself. Every laptop page (main app + projector windows,
// not phones) keeps /api/app/presence open. When the last one closes, the server waits
// AUTO_STOP.GRACE_MS (a page refresh reconnects well before that) and then exits.
// It never stops before the first page has opened. AUTO_STOP=0 in .env turns this off.
// ---------------------------------------------------------------------------
const AUTO_STOP = { GRACE_MS: 15000, HEARTBEAT_MS: 15000 };

function registerAutoStop(app: express.Express) {
  if (process.env.AUTO_STOP === "0") return;
  const pages = new Set<express.Response>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  setInterval(() => pages.forEach((p) => p.write(": ping\n\n")), AUTO_STOP.HEARTBEAT_MS).unref();

  app.get("/api/app/presence", (req, res) => {
    if (!isLocal(req)) return res.status(403).end();
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
    res.write("retry: 1000\n\n");
    pages.add(res);
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    req.on("close", () => {
      pages.delete(res);
      if (pages.size || timer) return;
      timer = setTimeout(() => {
        console.log("App closed on the laptop — stopping the server. (AUTO_STOP=0 in .env to keep it running)");
        process.exit(0);
      }, AUTO_STOP.GRACE_MS);
    });
  });
}

async function startServer() {
  const app = express();
  // 2026-11-16: hosting platforms choose the port (PORT); on the laptop it stays 3000.
  const PORT = Number(process.env.PORT) || 3000;

  // Behind one proxy (Cloud Run / AI Studio) so req.ip is the real client IP.
  // 2026-11-09: only there. On the church laptop there is no proxy, and trusting
  // X-Forwarded-For let anyone on the WiFi fake their IP to skip the rate limits.
  // Cloud Run sets K_SERVICE; elsewhere behind a proxy, set TRUST_PROXY=1 in .env.
  if (process.env.TRUST_PROXY === "1" || process.env.K_SERVICE) app.set("trust proxy", 1);
  // 2026-10-29 (Jarvis): phone remote (same WiFi). Registered before the 64kb JSON parser
  // because the laptop's snapshot (with small slide pictures) can be bigger.
  registerRemoteRoutes(app, PORT);
  registerAutoStop(app);
  // 2026-11-16: CouchDB behind this address (/couch); on a church laptop it also passes the
  // account routes on to the hosted server — so it comes first, and before any body parser.
  registerCouchProxy(app);
  // cloud sync databases (Pro) + PayMongo subscriptions (the webhook needs the raw body)
  const cloud = registerCloudRoutes(app);
  registerBillingRoutes(app, { onPlanChange: cloud.reconcile });
  app.use(express.json({ limit: JSON_BODY_MAX }));
  // 2026-11-16: accounts (sign-up + which CouchDB holds them) — see authServer.ts
  registerAuthRoutes(app);

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`WorshipTech-Pro server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
