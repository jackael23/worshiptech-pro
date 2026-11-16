# WorshipTech-Pro

AI assistant at practice simulator para sa mga church media volunteer na gumagamit ng **EasyWorship** (EW7, EW6, EW2009). Tagalog / English / Taglish.

## Mga feature

- **Chat** — AI (Gemini) na sumasagot ng step-by-step na EasyWorship workflow. May offline na sagot kapag walang API key.
- **Simulator** — practice ng Library → Schedule → LIVE gamit ang totoong EW7 hotkeys (Page Down = Go Live, Ctrl+B = Black, Ctrl+C = Text, Ctrl+L = Logo). Double-click sa slide, schedule item, kanta o verse = LIVE agad.
  - **Songs:** public-domain hymns; **My Songs** (sariling lyrics, naka-save lang sa browser); import ng SongSelect `.txt` / `.usr` / `.bin` at ChordPro; export/import ng backup `.json`; Reference list (title/artist lang, walang lyrics).
  - **Bibles:** sample verses (Ang Biblia, KJV, MBB maikling sipi) + **Import Bible** ng buong Bible mula sa `bibles/` (Ang Dating Biblia 1905, KJV — public domain). Browse aklat → kabanata → verses, o i-search ang reference (hal. `Juan 3:16`, `Awit 23`, `1 Cor 13:4-7`).
- **Lineups** *(Basic / Pro)* — Simulator → Schedule → **Lineups**: i-save ang Schedule na may pangalan at petsa ng service (hal. bawat Linggo), ihanda nang maaga ang susunod, at buksan ulit ang mga dati. **Buksan** = papalitan ang kasalukuyang Schedule; **I-save dito** = palitan ang laman ng naka-save. Naka-save sa browser ng laptop (hindi pa kasama sa CouchDB sync). Libre pa rin ang kasalukuyang Schedule.
- **Text style** — Simulator → Output → Text style: font, size (50–150%, auto-fit pa rin), Bold/Italic, kulay, alignment, outline/shadow. Global (naka-save sa browser) o sariling style bawat schedule item. Lumalabas agad sa Live, projector at phone.
- **Stage screen (musicians)** — Simulator → Output → **Open Stage screen**: lyrics na may chords, key, next slide at orasan sa TV / second monitor ng musicians. Sa Live panel, ang **Stage monitor** tab ang eksaktong preview nito.
  - **Stage announcement** — sa ibaba ng Live panel: mag-type o pumili ng preset (Ulitin ang chorus, Last chorus, Bridge, Slow down, Key up, Tapusin na) → **Send sa Stage**. Dilaw na banner sa taas ng Stage screen lang, hindi sa projector. Habang nagta-type, may dashed na **DRAFT** sa preview (laptop lang). Opsyonal na kumikislap pag bagong labas.
- **Phone remote** — kontrolin ang Live gamit ang phone sa parehong WiFi (tingnan sa ibaba).
- **Guides** — step-by-step na mga gabay (kanta, scripture, NDI/OBS, foldback).
- **Hotkeys** — official EW7 shortcut list (may babala para sa EW6/2009).
- **Itsura ("Sanctuary")** — midnight blue + candle gold, ivory na text, serif na section titles, coral na GO LIVE / LIVE (pati sa phone remote). May light mode (ivory). Sa **Appearance** (palette icon): **Candle** ang default na kulay; **Blue** = ang dating itsura.

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

**Paid feature (Basic / Pro).** Kailangang naka-login sa laptop ang account na may plan (tingnan ang "Account" sa ibaba); ang CouchDB admin ay bilang Pro. Kung wala, "naka-lock" ang lalabas sa Phone remote panel at walang makokontrol ang phone kahit alam ang PIN.

1. Patakbuhin ang app sa laptop (`npm run dev` o ang production build) at buksan ang http://localhost:3000.
2. **Simulator → Output → Phone remote**: makikita ang **PIN** at ang link (hal. `http://192.168.1.25:3000/?remote`).
3. Sa phone (parehong WiFi): buksan ang link at ilagay ang PIN.
   - **Live:** kasalukuyan + susunod na slide, Prev / Next, GO LIVE (preview ng laptop), Black / Clear / Logo
   - **Schedule:** tap = piliin, ▶ o double-tap = LIVE
   - **Notes:** malaking text para sa preacher / worship leader
   - **Alert:** **Projector** = message ticker para sa congregation; **Stage** = announcement sa Stage screen ng musicians (may preview at DRAFT)

Mga paalala:

- Bagong PIN tuwing nagre-restart ang server, o pindutin ang **New PIN** (mala-logout ang lahat ng phone).
- Kailangang nakabukas ang **Simulator** tab sa laptop.
- Windows: payagan ang Node.js sa **Private network** sa Windows Firewall, at dapat "Private" ang WiFi network ng laptop.
- Hindi gumagana sa Firebase (web.app) na version, dahil ang local server ang nagsisilbing tulay.
- Sa `npm run dev`, may lalabas na "[vite] failed to connect to websocket" sa console ng phone. Hot reload lang ito ng Vite, walang epekto sa remote.

## Account (login) at subscription plan

Opsyonal ang login. Gumagana ang songs, Bible at projection kahit walang account at walang internet. Ang account ay para sa mga paid feature (phone remote, lineup schedule, cloud sync). **Naka-lock ang phone remote at ang Lineups** (Basic o Pro plan); ang cloud sync ay hindi pa.

- **Account button** (icon ng tao sa app bar): Login, Gumawa ng account, Logout, at kung anong plan.
- Isang account = isang simbahan. Email ang login name.
- Ang login ay CouchDB mismo (`_users` + session cookie). Hindi sine-save ang password.
- Kapag hindi maabot ang CouchDB, ang huling alam na plan ang ginagamit (hanggang 14 na araw).
- Kapag iisang CouchDB ang account at ang sync, iisa na rin ang login: sa CouchDB sync panel, **I-on ang sync** na lang (walang password ulit). Ang Logout sa Account ay nagpapatigil din ng sync.

### Setup ng CouchDB (isang beses)

1. Sa `.env` ng app (para sa "Gumawa ng account" — admin lang ang puwedeng magsulat sa `_users`):

   ```
   COUCHDB_URL="http://localhost:5984"
   COUCHDB_ADMIN_USER="admin"
   COUCHDB_ADMIN_PASSWORD="..."
   ```

   Kung wala ang admin user/password, Login lang ang lalabas (walang "Gumawa ng account").
2. CORS sa CouchDB (Fauxton → Configuration → CORS, o sa `local.ini`): enable, origin `http://localhost:3000`, at `credentials = true`.
3. Dapat may `_users` database (ginagawa ito ng Fauxton setup "single node").
4. Inirerekomenda: habaan ang session. 10 minuto lang ang default ng CouchDB; nire-renew ito ng app habang nakabukas, pero pagkasara ng app nang lampas 10 minuto, login ulit. Sa `local.ini`:

   ```
   [chttpd_auth]
   timeout = 2592000   ; 30 araw
   ```

### Pagbibigay ng plan (mano-mano muna, habang wala pang PayMongo)

Ang plan ay **role** ng user: `plan:basic` o `plan:pro`. Admin lang ang makakapagpalit ng roles, kaya hindi ito mababago ng user mismo. Sa Fauxton: `_users` → buksan ang user → `"roles": ["plan:pro"]` → Save. Makikita ito ng app sa susunod na check (sa loob ng ilang minuto, o pag-reload).

## Icon / shortcut sa desktop at phone

May sariling icon ang app (asul na monitor na may play), nasa `public/` (`icon.svg`, `favicon.ico`, PNG icons, `manifest.webmanifest`).

- **Desktop (Chrome / Edge):** menu (⋮) → *Cast, save, and share* → **Install page as app** o **Create shortcut**. Lalabas ang icon sa desktop / taskbar at bubukas sa sariling window.
- **Android (Chrome):** menu (⋮) → **Add to Home screen**.
- **iPhone / iPad (Safari):** Share → **Add to Home Screen**.
- Kapag ginawa ang shortcut habang nasa phone remote (`/?remote`), ang remote ang bubukas, hindi ang buong app.

## Mga Bible file

Nasa `bibles/` ang `.wtp-bible.json` files. I-import sa app: **Simulator → Bibles → Import Bible**. Basahin ang `bibles/README.md` para sa source at license.

## Server / API

- `POST /api/chat` — may rate limit (20 tanong / 10 min bawat IP), max 1,000 characters bawat tanong, huling 20 messages lang ng history ang ipinapadala sa Gemini.
- `GET /api/health`
- `GET /api/auth/config`, `POST /api/auth/signup` — account (tingnan ang `authServer.ts`): 10 subok / oras bawat IP; sa laptop lang tinatanggap ang signup maliban kung naka-deploy sa likod ng proxy.
- `/api/remote/*` — phone remote (tingnan ang `remoteServer.ts`): PIN login (10 subok / 5 min bawat IP), ang laptop-side routes ay para sa localhost lang.

## Copyright

- Walang copyrighted na lyrics na kasama sa app. Ang **My Songs** ay galing sa user at naka-save lang sa sarili niyang browser — gamitin ayon sa CCLI license ng inyong simbahan.
- Bible: Ang Dating Biblia (1905) at KJV = public domain. MBB (Magandang Balita Biblia) © Philippine Bible Society — maikling sipi lang, may "(MBB)" sa dulo.
