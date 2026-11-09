import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { HOTKEYS_TEXT, HOTKEYS_VERIFIED_FOR } from "./src/data/easyworshipData";
import { isLocal, registerRemoteRoutes } from "./remoteServer";

dotenv.config();

// 2026-10-20 (Jarvis): removed __filename/__dirname (import.meta.url) — unused, and
// it is undefined in the CJS bundle from `npm run build`, so `npm start` crashed.

// ---------------------------------------------------------------------------
// 2026-10-20 (Jarvis): API hardening — /api/chat was open to anyone with no
// limits, so the Gemini quota (and bill) could be drained by any visitor/bot.
// ---------------------------------------------------------------------------
const LIMITS = {
  RATE_WINDOW_MS: 10 * 60 * 1000, // 10 minutes
  RATE_MAX: 20, // chat requests per IP per window
  USER_MESSAGE_MAX: 1000, // characters per question
  HISTORY_MAX: 20, // last N messages sent to Gemini
  HISTORY_ITEM_MAX: 4000, // characters per history message (assistant replies can be long)
  BODY_MAX: "64kb",
};

const ALLOWED_VERSIONS = ["EasyWorship 7", "EasyWorship 6", "EasyWorship 2009"] as const;
const ALLOWED_LANGUAGES = ["Tagalog", "English", "Taglish"] as const;

/** Simple in-memory fixed-window limiter (per server instance). */
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(key: string): { limited: boolean; retryAfterSec: number } {
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + LIMITS.RATE_WINDOW_MS };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  return {
    limited: bucket.count > LIMITS.RATE_MAX,
    retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
  };
}
// Drop expired buckets so the map does not grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) if (now >= bucket.resetAt) rateBuckets.delete(key);
}, LIMITS.RATE_WINDOW_MS).unref();

function pickAllowed<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}


const WORSHIPTECH_PRO_SYSTEM_INSTRUCTION = `You are "WorshipTech-Pro," an AI assistant specifically trained in the operation, features, and best practices of the church presentation software, EasyWorship (focusing on versions EasyWorship 7, EasyWorship 6, and EasyWorship 2009).

## YOUR GOAL:
Provide clear, practical, and minimalist-style guidance to church media technicians, volunteers, pastors, and AV teams.

## CORE PRINCIPLES:
1. Simplify and Clarify: Avoid unnecessary technical jargon where possible, or clearly explain it in plain church AV terms. Prioritize ease of understanding for tech team volunteers of all skill levels.
2. Focus on Workflow: Frame answers as numbered, step-by-step actions that directly tell the user how to DO things in the software.
3. Minimalist Visual Thinking: When describing features or interfaces, imagine and describe them using the minimalist, iconic, and color-coded style seen in user interface guides. Think 'clean boxes, clear labels, and panel locations' (e.g., [Media Library Panel], [Service Schedule / Canvas], [Preview Window], [LIVE Output], [Foldback / Stage Display]).
4. No Hallucinations: Only answer with genuine, supported EasyWorship features. If a requested feature (like advanced multi-output video matrixing, built-in DMX lighting control, or native PTZ camera tracking) is NOT supported in EasyWorship, state it clearly and provide practical workarounds (such as using OBS, Companion, or external hardware switchers). Never make things up.
5. Multilingual and Regional Support: Comfortably answer in Tagalog / Filipino, English, Taglish, Spanish, or any language the user prompts with, maintaining the exact friendly, step-by-step clarity.

## KEY EASYWORSHIP CONCEPTS & PANELS TO REFERENCE:
- Media Library (Tabs: Songs, Scriptures/Bibles, Media/Videos/Images, Presentations, Themes, Audio)
- Service Schedule / Service Canvas (The ordered liturgy list on the left/center where items are placed)
- Preview Window & Slides Area (Where individual verses, choruses, or presentation slides are selected)
- LIVE Output & Main Projection (The Go LIVE button [Page Down], Black [Ctrl + B], Text on/off [Ctrl + C], Logo [Ctrl + L])
- Foldback / Stage Display (Confidence monitor for worship team/pastor with current slide, next slide, clock, and stage messages)
- Live Stream & NDI (Network Device Interface output in EW6/EW7 for transparent lyrics overlay into OBS Studio, vMix, or ATEM)
- Alerts (Nursery Alert ticker, Countdown timers, and Message banners)
- Song Editor & Scripture Formatting (Themes, font shadows, outlines, background overrides)

## FORMATTING STYLE:
- Use bold step headings and clean numbered steps.
- Highlight panel names in quotes or brackets (e.g. 'Media Library' -> 'Songs').
- Include practical keyboard shortcuts where applicable, using ONLY the official list below.
- Keep answers concise, punchy, and actionable.

## OFFICIAL KEYBOARD SHORTCUTS (verified for ${HOTKEYS_VERIFIED_FOR}):
${HOTKEYS_TEXT}
- WARNING: [Ctrl + L] is LOGO, not Go Live. F5 / F6 / F7 are NOT EasyWorship hotkeys. Never invent other hotkeys.
- For EasyWorship 6 or 2009, say these are the EW7 keys and ask the user to confirm in that version's Help menu.`;

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
  const PORT = 3000;

  // Behind one proxy (Cloud Run / AI Studio) so req.ip is the real client IP.
  // 2026-11-09: only there. On the church laptop there is no proxy, and trusting
  // X-Forwarded-For let anyone on the WiFi fake their IP to skip the chat rate limit.
  // Cloud Run sets K_SERVICE; elsewhere behind a proxy, set TRUST_PROXY=1 in .env.
  if (process.env.TRUST_PROXY === "1" || process.env.K_SERVICE) app.set("trust proxy", 1);
  // 2026-10-29 (Jarvis): phone remote (same WiFi). Registered before the 64kb JSON parser
  // because the laptop's snapshot (with small slide pictures) can be bigger.
  registerRemoteRoutes(app, PORT);
  registerAutoStop(app);
  app.use(express.json({ limit: LIMITS.BODY_MAX }));

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Chat endpoint
  app.post("/api/chat", async (req, res) => {
    try {
      const rate = isRateLimited(req.ip || "unknown");
      if (rate.limited) {
        res.set("Retry-After", String(rate.retryAfterSec));
        return res.status(429).json({
          error: `Sobrang dami ng tanong. Maghintay muna ng mga ${Math.ceil(rate.retryAfterSec / 60)} minuto bago magtanong ulit.`,
        });
      }

      const { messages } = req.body ?? {};
      const userMessage = typeof req.body?.userMessage === "string" ? req.body.userMessage.trim() : "";
      if (!userMessage) {
        return res.status(400).json({ error: "Walang tanong na natanggap." });
      }
      if (userMessage.length > LIMITS.USER_MESSAGE_MAX) {
        return res.status(400).json({
          error: `Masyadong mahaba ang tanong (max ${LIMITS.USER_MESSAGE_MAX} characters). Paikliin muna.`,
        });
      }
      // Whitelisted, so the user cannot inject text into the system prompt.
      const language = pickAllowed(req.body?.language, ALLOWED_LANGUAGES, "Taglish");
      const version = pickAllowed(req.body?.version, ALLOWED_VERSIONS, "EasyWorship 7");
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        // Provide intelligent local fallback response if no API key is set yet
        const queryLower = (userMessage || "").toLowerCase();
        let fallbackResponse = "";

        if (queryLower.includes("kanta") || queryLower.includes("song") || queryLower.includes("schedule")) {
          fallbackResponse = `**Upang magdagdag ng kanta sa Service Schedule:**\n\n1. Pumunta sa **'Media Library'** panel (ibabang kaliwa).\n2. I-click ang **'Songs'** tab icon.\n3. I-type ang pamagat ng kanta sa search bar.\n4. I-drag ang nahanap na kanta at i-drop ito sa iyong **'Service Schedule / Canvas'** panel sa kaliwa.\n\n*Tip: Maaari mo ring i-double click ang kanta para mapunta agad sa Schedule!*`;
        } else if (queryLower.includes("scripture") || queryLower.includes("bible") || queryLower.includes("talata") || queryLower.includes("john") || queryLower.includes("juan")) {
          fallbackResponse = `**Upang mabilis na i-project ang Scripture / Bible verse:**\n\n1. Sa **'Media Library'**, i-click ang **'Scriptures' (Bible)** tab icon.\n2. Piliin ang nais na bersyon (hal. Tagalog Ang Biblia, KJV, NIV).\n3. I-type ang Book, Chapter, at Verse (hal. *"John 3:16"*) sa search field.\n4. I-click ang **'Go LIVE'** button (o pindutin ang [Page Down]) para mai-project agad sa screen!`;
        } else if (queryLower.includes("ndi") || queryLower.includes("obs") || queryLower.includes("stream") || queryLower.includes("live stream")) {
          fallbackResponse = `**Paano isama ang lyrics sa OBS Live Stream via NDI:**\n\n1. **EasyWorship Setup:**\n   - Pumunta sa **'Edit'** > **'Options'** > **'Live Output'** (o 'Output' menu).\n   - Sa Output Type, piliin ang **'NDI Output'** o i-enable ang NDI support.\n2. **OBS Studio Setup:**\n   - Buksan ang OBS Studio, magdagdag ng bagong Source sa pamamagitan ng pag-click sa **'+'** icon.\n   - Piliin ang **'NDI™ Source'**.\n   - Sa Source Props, piliin ang EasyWorship output mula sa network list.\n3. **Transparent Lower Thirds:**\n   - Gumamit ng theme sa EasyWorship na may transparent o black background (gamit ang Color Key / Alpha channel sa OBS) para malinis na lower-third lyrics!`;
        } else if (queryLower.includes("foldback") || queryLower.includes("stage") || queryLower.includes("confidence")) {
          fallbackResponse = `**Paano i-setup ang Foldback (Stage Display / Confidence Monitor):**\n\n1. Pumunta sa **'Edit'** > **'Options'** > **'Foldback'**.\n2. Siguruhing naka-check ang **'Enable Foldback Support'**.\n3. Piliin ang display monitor na nakatutok sa stage/musicians sa **'Foldback Display'** dropdown.\n4. I-customize ang layout: Clock, Current Slide Lyrics, at Next Slide preview para handa ang worship team sa susunod na linya!`;
        } else if (queryLower.includes("shortcut") || queryLower.includes("hotkey")) {
          fallbackResponse = `**EasyWorship Keyboard Shortcuts (official, ${HOTKEYS_VERIFIED_FOR}):**\n\n${HOTKEYS_TEXT}\n\n*Para sa EW6 / 2009: i-check sa Help menu ng software.*`;
        } else {
          fallbackResponse = `Magandang araw! Ako si **WorshipTech-Pro**, ang iyong assistant para sa EasyWorship 7, 6, at 2009.\n\nPaano kita matutulungan ngayon?\n- **Paghahanda ng Service Schedule** (Kanta, Liturhiya, Bibles)\n- **Mabilisang Pagpapakita ng Scripture / Verses**\n- **Live Streaming Setup gamit ang NDI papuntang OBS / vMix**\n- **Stage Foldback Monitor configuration**\n- **Video Background looping & Themes**\n- **Nursery / Message ticker alerts**`;
        }

        return res.json({ text: fallbackResponse });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      // Prepare conversation history
      const formattedContents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

      if (Array.isArray(messages)) {
        // Only the last HISTORY_MAX messages, each capped — saves tokens and blocks huge payloads.
        for (const msg of messages.slice(-LIMITS.HISTORY_MAX)) {
          if (
            msg &&
            typeof msg.content === "string" &&
            msg.content &&
            (msg.role === "user" || msg.role === "model" || msg.role === "assistant")
          ) {
            formattedContents.push({
              role: msg.role === "assistant" ? "model" : (msg.role as "user" | "model"),
              parts: [{ text: msg.content.slice(0, LIMITS.HISTORY_ITEM_MAX) }],
            });
          }
        }
      }

      formattedContents.push({
        role: "user",
        parts: [{ text: userMessage }],
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: formattedContents,
        config: {
          systemInstruction:
            WORSHIPTECH_PRO_SYSTEM_INSTRUCTION +
            `\n\nThe user is running: ${version}. Tailor menu paths and features to this version; if unsure for this version, say so.` +
            `\nUser preferred response language: ${language}`,
          temperature: 0.7,
        },
      });

      const replyText = response.text || "No response generated.";
      res.json({ text: replyText });
    } catch (error: any) {
      // Full error stays in the server log only; the client gets a generic message.
      console.error("Gemini API Error:", error);
      res.status(500).json({
        error: "May problema sa AI assistant ngayon. Subukang muli mamaya.",
      });
    }
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
