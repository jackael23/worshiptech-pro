# WorshipTech-Pro

AI assistant at practice simulator para sa mga church media volunteer na gumagamit ng **EasyWorship** (EW7, EW6, EW2009). Tagalog / English / Taglish.

## Mga feature

- **Chat** — AI (Gemini) na sumasagot ng step-by-step na EasyWorship workflow. May offline na sagot kapag walang API key.
- **Simulator** — practice ng Library → Schedule → LIVE gamit ang totoong EW7 hotkeys (Page Down = Go Live, Ctrl+B = Black, Ctrl+C = Text, Ctrl+L = Logo). Double-click sa slide, schedule item, kanta o verse = LIVE agad.
  - **Songs:** public-domain hymns; **My Songs** (sariling lyrics, naka-save lang sa browser); import ng SongSelect `.txt` / `.usr` / `.bin` at ChordPro; export/import ng backup `.json`; Reference list (title/artist lang, walang lyrics).
  - **Bibles:** sample verses (Ang Biblia, KJV, MBB maikling sipi) + **Import Bible** ng buong Bible mula sa `bibles/` (Ang Dating Biblia 1905, KJV — public domain). Browse aklat → kabanata → verses, o i-search ang reference (hal. `Juan 3:16`, `Awit 23`, `1 Cor 13:4-7`).
- **Text style** — Simulator → Output → Text style: font, size (50–150%, auto-fit pa rin), Bold/Italic, kulay, alignment, outline/shadow. Global (naka-save sa browser) o sariling style bawat schedule item. Lumalabas agad sa Live, projector at phone.
- **Phone remote** — kontrolin ang Live gamit ang phone sa parehong WiFi (tingnan sa ibaba).
- **Guides** — step-by-step na mga gabay (kanta, scripture, NDI/OBS, foldback).
- **Hotkeys** — official EW7 shortcut list (may babala para sa EW6/2009).

## Patakbuhin sa sariling PC

Kailangan: Node.js 20+

1. `npm install`
2. Kopyahin ang `.env.example` bilang `.env` at ilagay ang `GEMINI_API_KEY` (opsyonal — kung wala, offline na sagot ang chat).
3. `npm run dev` → http://localhost:3000

Production build: `npm run build`, saka patakbuhin na may `NODE_ENV=production`:

- PowerShell: `$env:NODE_ENV="production"; npm start`
- Git Bash / macOS / Linux: `NODE_ENV=production npm start`

| Script | Gamit |
|---|---|
| `npm run dev` | dev server (Express + Vite) |
| `npm run build` | frontend sa `dist/` + server sa `dist/server.cjs` |
| `npm start` | patakbuhin ang build (lagyan ng `NODE_ENV=production`, tingnan sa itaas) |
| `npm run lint` | TypeScript check |

## Phone remote (parehong WiFi)

1. Patakbuhin ang app sa laptop (`npm run dev` o ang production build) at buksan ang http://localhost:3000.
2. **Simulator → Output → Phone remote**: makikita ang **PIN** at ang link (hal. `http://192.168.1.25:3000/?remote`).
3. Sa phone (parehong WiFi): buksan ang link at ilagay ang PIN.
   - **Live:** kasalukuyan + susunod na slide, Prev / Next, GO LIVE (preview ng laptop), Black / Clear / Logo
   - **Schedule:** tap = piliin, ▶ o double-tap = LIVE
   - **Notes:** malaking text para sa preacher / worship leader
   - **Alert:** magpadala / magtago ng message ticker

Mga paalala:

- Bagong PIN tuwing nagre-restart ang server, o pindutin ang **New PIN** (mala-logout ang lahat ng phone).
- Kailangang nakabukas ang **Simulator** tab sa laptop.
- Windows: payagan ang Node.js sa **Private network** sa Windows Firewall, at dapat "Private" ang WiFi network ng laptop.
- Hindi gumagana sa Firebase (web.app) na version, dahil ang local server ang nagsisilbing tulay.
- Sa `npm run dev`, may lalabas na "[vite] failed to connect to websocket" sa console ng phone. Hot reload lang ito ng Vite, walang epekto sa remote.

## Mga Bible file

Nasa `bibles/` ang `.wtp-bible.json` files. I-import sa app: **Simulator → Bibles → Import Bible**. Basahin ang `bibles/README.md` para sa source at license.

## Server / API

- `POST /api/chat` — may rate limit (20 tanong / 10 min bawat IP), max 1,000 characters bawat tanong, huling 20 messages lang ng history ang ipinapadala sa Gemini.
- `GET /api/health`
- `/api/remote/*` — phone remote (tingnan ang `remoteServer.ts`): PIN login (10 subok / 5 min bawat IP), ang laptop-side routes ay para sa localhost lang.

## Copyright

- Walang copyrighted na lyrics na kasama sa app. Ang **My Songs** ay galing sa user at naka-save lang sa sarili niyang browser — gamitin ayon sa CCLI license ng inyong simbahan.
- Bible: Ang Dating Biblia (1905) at KJV = public domain. MBB (Magandang Balita Biblia) © Philippine Bible Society — maikling sipi lang, may "(MBB)" sa dulo.
