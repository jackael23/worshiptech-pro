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

Opsyonal ang login. Gumagana ang songs, Bible at projection kahit walang account at walang internet. Ang account ay para sa mga paid feature: **phone remote at Lineups** (Basic o Pro) at **cloud sync** (Pro).

- **Account button** (icon ng tao sa app bar): Login, Gumawa ng account, Logout, at kung anong plan.
- Isang account = isang simbahan. Email ang login name.
- Ang login ay CouchDB mismo (`_users` + session cookie). Hindi sine-save ang password.
- Kapag hindi maabot ang CouchDB, ang huling alam na plan ang ginagamit (hanggang 14 na araw).
- Ang app ay kumakausap sa CouchDB sa sarili nitong address (`/couch`), kaya walang CORS na kailangan para sa login. Ang Logout sa Account ay nagpapatigil din ng sync.

### Setup ng CouchDB (isang beses)

1. Sa `.env` ng app (para sa "Gumawa ng account" — admin lang ang puwedeng magsulat sa `_users`):

   ```
   COUCHDB_URL="http://localhost:5984"
   COUCHDB_ADMIN_USER="admin"
   COUCHDB_ADMIN_PASSWORD="..."
   ```

   Kung wala ang admin user/password, Login lang ang lalabas (walang "Gumawa ng account").
2. CORS sa CouchDB: kailangan lang kung gagamit ng **Sariling CouchDB** sa sync panel (Fauxton → Configuration → CORS: enable, origin `http://localhost:3000`, `credentials = true`). Hindi kailangan para sa login o sa cloud sync.
3. Dapat may `_users` database (ginagawa ito ng Fauxton setup "single node").
4. Inirerekomenda: habaan ang session. 10 minuto lang ang default ng CouchDB; nire-renew ito ng app habang nakabukas, pero pagkasara ng app nang lampas 10 minuto, login ulit. Sa `local.ini`:

   ```
   [chttpd_auth]
   timeout = 2592000   ; 30 araw
   ```

### Online na bayad (PayMongo)

Prepaid: bumibili ang simbahan ng **1 buwan** o **1 taon (2 buwan libre)**: Basic ₱299 / ₱2,990, Pro ₱699 / ₱6,990. Walang kusang sinisingil ulit. Kapag nag-upgrade mula Basic papuntang Pro, ang halaga ng natitirang araw ay idinadagdag sa Pro. Ang presyo ay nasa itaas ng `billingServer.ts`.

Paano gumagana: Account → pindutin ang presyo → bubukas ang bayaran ng PayMongo sa bagong tab → pagkabayad, lalagyan ng server ang account ng role na `plan:basic` at ng petsa ng katapusan. Kapag lumampas ang petsa (+3 araw na palugit), kusang tinatanggal ang plan. Ang bayad nang maaga ay idinadagdag sa natitirang panahon.

**Kailangan nito ng server na naaabot ng PayMongo** (naka-host, hindi ang laptop ng simbahan). Setup:

1. Sa `.env` ng naka-host na server:

   ```
   PAYMONGO_SECRET_KEY="sk_test_..."        # sk_live_... kapag totoo na
   PAYMONGO_WEBHOOK_SECRET="whsk_..."       # galing sa step 2
   APP_URL="https://ang-site-mo"            # dito ibinabalik ang tao pagkabayad
   # PAYMONGO_METHODS="gcash,card"          # mga paraang naka-enable sa PayMongo account mo
   ```

   Kasama ang `COUCHDB_ADMIN_USER` / `COUCHDB_ADMIN_PASSWORD` (pareho sa "Gumawa ng account").
2. Sa PayMongo Dashboard → Developers → Webhooks: gumawa ng webhook sa `https://ang-site-mo/api/billing/webhook` para sa event na `checkout_session.payment.paid`, at kopyahin ang secret nito sa `PAYMONGO_WEBHOOK_SECRET`.
3. Sa laptop ng simbahan: `CLOUD_URL="https://ang-site-mo"` lang sa `.env`. Ang login, bayad at cloud sync ng laptop ay ipapasa sa naka-host na server (walang key o password sa laptop).

**Subukan muna gamit ang test keys bago mag-live.** Ang code ay nasubukan laban sa kunwaring PayMongo server, hindi pa sa totoong PayMongo. Kung tinatanggihan ang totoong webhook ("bad signature" sa log ng server), alisin muna ang `PAYMONGO_WEBHOOK_SECRET`: ligtas pa rin, dahil bawat bayad ay kinukumpirma ng server sa PayMongo API mismo bago magbigay ng plan.

### Cloud sync (Pro)

Iisang library (songs, Bible, PPT, media, Lineups) sa lahat ng computer ng simbahan, at kopya sa cloud. Sa alinmang Library tab → **Sync** (sa ibaba) → **I-on ang cloud sync**. Gawin ito sa bawat computer, gamit ang parehong account.

- Bawat simbahan ay may sariling pribadong mga database sa naka-host na CouchDB; ang account lang nila ang nakakabasa.
- Kanta at Lineups: sumasabay agad. Bible, PPT at media: tuwing may binago, at kada 2 minuto.
- Laging naka-save muna sa browser, kaya gumagana kahit walang internet; hahabol ang sync pagbalik nito.
- Kapag natapos ang Pro, naka-lock ang cloud (walang binubura); bumabalik ito pag-renew. Ang nasa browser ay hindi nagagalaw.
- Kailangan ng naka-host na server: tingnan ang `deploy/README.md` (Docker: app + CouchDB + HTTPS).
- Nandiyan pa rin ang **Sariling CouchDB (advanced)** sa parehong panel para sa may sariling server.

### Pagbibigay ng plan nang mano-mano

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
- `/couch/*` — CouchDB sa likod ng app (`couchProxy.ts`): `_session` at mga cloud database lang ang pinapadaan.
- `/api/cloud/*` — cloud sync (`cloudServer.ts`): `status`, `provision`.
- `/api/billing/*` — PayMongo (tingnan ang `billingServer.ts`): `plans`, `status`, `checkout`, `confirm`, `webhook`.
- `/api/remote/*` — phone remote (tingnan ang `remoteServer.ts`): PIN login (10 subok / 5 min bawat IP), ang laptop-side routes ay para sa localhost lang.

## Copyright

- Walang copyrighted na lyrics na kasama sa app. Ang **My Songs** ay galing sa user at naka-save lang sa sarili niyang browser — gamitin ayon sa CCLI license ng inyong simbahan.
- Bible: Ang Dating Biblia (1905) at KJV = public domain. MBB (Magandang Balita Biblia) © Philippine Bible Society — maikling sipi lang, may "(MBB)" sa dulo.
