/**
 * 2026-11-17 (Jarvis): Help chat knowledge base — replaces the Gemini AI chat (no API key, no server,
 * works on Firebase Hosting and with no internet). Each article answers one question, in Tagalog
 * (also used for Taglish) and English. lib/helpSearch.ts picks the best article by keywords.
 *  - keywords: lower-case, no accents; multi-word phrases count more than single words.
 *  - Keep answers short and step-by-step. Only describe features that really exist in the app
 *    (or official EasyWorship 7 behavior for the EW-only articles). Hotkeys come from easyworshipData.
 */
import { HOTKEYS_SOURCE_URL, HOTKEYS_TEXT, HOTKEYS_VERIFIED_FOR } from "../data/easyworshipData";

export interface HelpArticle {
  id: string;
  title: { tl: string; en: string };
  keywords: string[];
  tl: string;
  en: string;
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "add-song",
    title: { tl: "Paglalagay ng kanta sa Schedule", en: "Adding a song to the Schedule" },
    keywords: ["add song", "add a song", "magdagdag ng kanta", "maglagay ng kanta", "ilagay ang kanta", "kanta sa schedule", "song to schedule", "service schedule", "schedule", "lineup ng kanta", "kanta", "song", "songs", "add", "dagdag"],
    tl: `**Paano maglagay ng kanta sa Schedule:**

1. Sa **Simulator**, buksan ang **Library** → **Songs** tab.
2. I-type ang pamagat sa search (hal. *Amazing Grace*).
3. Pindutin ang **+** sa tabi ng kanta para mapunta sa **Schedule**.
4. Sa Schedule, **double-click** ang kanta para i-LIVE agad ang unang slide.

_Tip: wala pa ang kanta? Pindutin ang **New song** para gumawa._`,
    en: `**How to add a song to the Schedule:**

1. In the **Simulator**, open **Library** → **Songs**.
2. Type the title in search (e.g. *Amazing Grace*).
3. Press **+** next to the song to add it to the **Schedule**.
4. In the Schedule, **double-click** the song to put its first slide LIVE.

_Tip: song not there yet? Press **New song** to make it._`,
  },
  {
    id: "new-song",
    title: { tl: "Paggawa ng bagong kanta (may chords)", en: "Making a new song (with chords)" },
    keywords: ["new song", "bagong kanta", "gumawa ng kanta", "create song", "song editor", "edit song", "edit lyrics", "lyrics", "i-type ang lyrics", "paste lyrics", "slide", "bagong slide", "verse", "chorus", "bridge"],
    tl: `**Paano gumawa ng bagong kanta:**

1. **Library** → **Songs** → **New song**.
2. Ilagay ang **Title** at **Key** (hal. *G*). Para sa musicians ang Key.
3. I-paste ang lyrics:
   - **Blank line** = bagong slide
   - \`Verse 1\`, \`Chorus\`, \`[Bridge]\` = label ng slide
   - \`[G]\`, \`[Am7]\`, \`[D/F#]\` sa loob ng linya = **chord** (hal. \`[G]Amazing [C]grace\`)
4. **Save**.

_Hindi lumalabas ang chords sa projector. Sa **Stage screen** at sa **Chords** tab ng phone lang sila makikita._`,
    en: `**How to make a new song:**

1. **Library** → **Songs** → **New song**.
2. Enter the **Title** and **Key** (e.g. *G*). The key is for the musicians.
3. Paste the lyrics:
   - **Blank line** = new slide
   - \`Verse 1\`, \`Chorus\`, \`[Bridge]\` = slide label
   - \`[G]\`, \`[Am7]\`, \`[D/F#]\` inside a line = **chord** (e.g. \`[G]Amazing [C]grace\`)
4. **Save**.

_Chords never show on the projector. Only the **Stage screen** and the phone's **Chords** tab show them._`,
  },
  {
    id: "chords",
    title: { tl: "Paano maglagay ng chords", en: "How to add chords" },
    keywords: ["chords", "chord", "maglagay ng chords", "add chords", "chordpro", "chord sheet", "lyrics with chords", "lyrics na may chords", "chords sa lyrics", "gitara", "guitar", "keyboard", "bass", "musician", "musicians", "banda", "band"],
    tl: `**Chords para sa musicians:**

1. Buksan ang kanta: **Library** → **Songs** → **Edit** (o **New song**).
2. Ilagay ang chord sa loob ng **[ ]** bago ang salita:
   \`[G]Amazing [C]grace how [G]sweet the [D]sound\`
3. Linyang chords lang (intro): \`[G] [C] [D]\`
4. Ilagay ang **Key** ng kanta (hal. *G*), para tama ang transpose.
5. **Save**. Sa editor, piliin ang **Musicians (chords)** para makita kung paano ito lalabas sa banda.

**Saan makikita ng banda?**
- **Stage screen** (TV sa stage): Output → Projector → **Open Stage screen**
- **Chords** tab sa phone remote

_Hindi kailanman lalabas ang chords sa projector ng congregation._`,
    en: `**Chords for musicians:**

1. Open the song: **Library** → **Songs** → **Edit** (or **New song**).
2. Put each chord in **[ ]** right before the word:
   \`[G]Amazing [C]grace how [G]sweet the [D]sound\`
3. Chord-only line (intro): \`[G] [C] [D]\`
4. Fill in the song's **Key** (e.g. *G*) so transposing is spelled right.
5. **Save**. In the editor, pick **Musicians (chords)** to preview what the band sees.

**Where does the band see them?**
- **Stage screen** (TV on stage): Output → Projector → **Open Stage screen**
- The **Chords** tab on the phone remote

_Chords never appear on the congregation's projector._`,
  },
  {
    id: "transpose",
    title: { tl: "Transpose (paglipat ng key)", en: "Transpose (changing key)" },
    keywords: ["transpose", "mag-transpose", "paano mag transpose", "ilipat ang key", "palitan ang key", "change key", "lower the key", "ibaba ang key", "itaas ang key", "taasan", "babaan", "key", "tono", "half step", "semitone"],
    tl: `**Paano mag-transpose:**

**Sa Stage screen o sa Chords tab ng phone:** pindutin ang **−** o **+** sa tabi ng *Transpose*. Kusang gagalaw lahat ng chords at ang key. Sa screen/phone lang na 'yon naka-save.

**Calculator dito sa Help.** I-type lang ang alinman dito:
- \`G to E\` → ilang step, at ang chords sa bagong key
- \`transpose G C D Em +2\` → A D E F#m
- \`G D Em C baba 1\`

_Paalala: ang 1 = isang half step (isang fret sa gitara)._`,
    en: `**How to transpose:**

**On the Stage screen or the phone's Chords tab:** press **−** or **+** next to *Transpose*. All chords and the key move by themselves. It's saved on that screen/phone only.

**Calculator right here in Help.** Just type one of these:
- \`G to E\` → how many steps, and the chords in the new key
- \`transpose G C D Em +2\` → A D E F#m
- \`G D Em C down 1\`

_Note: 1 = one half step (one fret on guitar)._`,
  },
  {
    id: "capo",
    title: { tl: "Capo calculator", en: "Capo calculator" },
    keywords: ["capo", "kapo", "anong capo", "what capo", "which capo", "fret", "shapes", "guitar shapes"],
    tl: `**Capo calculator.** I-type lang ang alinman dito:

- \`capo 3 G\` → anong key ang tunog (Bb)
- \`anong capo para A gamit ang G shapes\` → capo 2
- \`capo para Bb\` → madadaling shapes + capo para sa Bb

_Kapag naka-capo ka, sabihin sa keyboard at bass ang **tunog** na key, hindi ang shapes na hawak mo._`,
    en: `**Capo calculator.** Just type one of these:

- \`capo 3 G\` → what key it sounds in (Bb)
- \`capo for A with G shapes\` → capo 2
- \`capo for Bb\` → easy shapes + capo for Bb

_With a capo on, tell the keys and bass player the key it **sounds** in, not the shapes you're holding._`,
  },
  {
    id: "stage-screen",
    title: { tl: "Stage screen para sa musicians", en: "Stage screen for musicians" },
    keywords: ["stage screen", "stage display", "stage monitor", "confidence monitor", "confidence screen", "tv sa stage", "tv ng musicians", "screen ng banda", "foldback", "monitor", "worship leader", "singers", "next slide", "susunod na linya", "stage"],
    tl: `**Stage screen (TV ng musicians at worship leader):**

1. Sa **Output**, pindutin ang **Projector**.
2. Sa *Stage screen (musicians · chords)*, pindutin ang **Open Stage screen** (o **On other screen** sa Chrome/Edge).
3. I-drag ang window sa TV ng stage, tapos i-click para mag-fullscreen.

**Makikita rito:** kasalukuyang slide na may chords, unang linya ng susunod na slide, key, at orasan.
- **Transpose**, laki ng text, at **Chords** on/off: nasa itaas ng Stage screen.
- Hindi ito nagba-black kapag **Black** o **Clear** ang projector, para tuloy-tuloy ang banda.
- Pwedeng magpadala ng **Stage announcement** (dilaw na banner, banda lang ang makakakita).`,
    en: `**Stage screen (TV for musicians and the worship leader):**

1. In **Output**, press **Projector**.
2. Under *Stage screen (musicians · chords)*, press **Open Stage screen** (or **On other screen** in Chrome/Edge).
3. Drag the window to the stage TV, then click it for fullscreen.

**It shows:** the current slide with chords, the first lines of the next slide, the key and a clock.
- **Transpose**, text size and **Chords** on/off are at the top of the Stage screen.
- It does NOT go black when the projector is on **Black** or **Clear**, so the band keeps its place.
- You can send a **Stage announcement** (yellow banner, only the band sees it).`,
  },
  {
    id: "phone-remote",
    title: { tl: "Phone remote at Chords sa phone", en: "Phone remote and Chords on the phone" },
    keywords: ["phone", "cellphone", "cp", "phone remote", "remote", "mobile", "chords sa phone", "chords on phone", "pin", "wifi", "control from phone", "kontrolin sa phone"],
    tl: `**Phone remote:**

1. Sa **Output**, pindutin ang **Phone**.
2. Siguraduhing **parehong WiFi** ang laptop at phone.
3. Buksan sa phone ang link na lalabas, tapos ilagay ang **PIN**.

**Sa phone:** Live, Schedule, Library, **Chords** (lyrics na may chords + transpose), Notes, at Alert.

_Kasama ang phone remote sa **Basic / Pro** plan. Libre pa rin ang songs, Bible, at projection._`,
    en: `**Phone remote:**

1. In **Output**, press **Phone**.
2. Make sure the laptop and phone are on the **same WiFi**.
3. Open the link it shows on the phone, then enter the **PIN**.

**On the phone:** Live, Schedule, Library, **Chords** (lyrics with chords + transpose), Notes and Alert.

_The phone remote is part of the **Basic / Pro** plan. Songs, Bible and projection stay free._`,
  },
  {
    id: "bible",
    title: { tl: "Bible verse sa screen", en: "Bible verse on screen" },
    keywords: ["bible", "biblia", "bibliya", "verse", "scripture", "scriptures", "talata", "juan 3:16", "john 3:16", "awit", "psalm", "import bible", "show verse", "ipakita ang verse", "pastor"],
    tl: `**Paano magpakita ng Bible verse:**

1. **Library** → **Bibles** tab.
2. I-type ang reference sa search: *Juan 3:16*, *Awit 23*, o isang salita.
3. Lagyan ng check ang mga talata, tapos **LIVE** (diretso sa screen) o **Add** (papunta sa Schedule).

_Wala pang Bible? Pindutin ang **Import Bible** sa Bibles tab at piliin ang Bible file (.wtp-bible.json)._`,
    en: `**How to show a Bible verse:**

1. **Library** → **Bibles**.
2. Type the reference in search: *John 3:16*, *Psalm 23*, or a word.
3. Tick the verses, then **LIVE** (straight to the screen) or **Add** (to the Schedule).

_No Bible yet? Press **Import Bible** in the Bibles tab and pick the Bible file (.wtp-bible.json)._`,
  },
  {
    id: "hotkeys",
    title: { tl: "Hotkeys / shortcut keys", en: "Hotkeys / shortcut keys" },
    keywords: ["hotkey", "hotkeys", "shortcut", "shortcuts", "keyboard shortcut", "page down", "ctrl+b", "ctrl b", "ctrl+l", "ctrl+c", "black screen", "go live", "emergency", "itim", "blackout", "logo"],
    tl: `**Mahahalagang keys (pareho sa app at sa ${HOTKEYS_VERIFIED_FOR}):**

- **Page Down** = Go Live / susunod
- **↑ / ↓** = nakaraan / susunod na slide
- **Ctrl + B** = Black (itim ang screen)
- **Ctrl + C** = Text on/off (background lang)
- **Ctrl + L** = Logo (⚠️ *hindi* Go Live)

**Buong listahan (${HOTKEYS_VERIFIED_FOR}):**
${HOTKEYS_TEXT}

_Source: [EasyWorship support](${HOTKEYS_SOURCE_URL}). Sa EW6 / 2009, i-check sa Help menu._`,
    en: `**Key shortcuts (same in the app and in ${HOTKEYS_VERIFIED_FOR}):**

- **Page Down** = Go Live / next
- **↑ / ↓** = previous / next slide
- **Ctrl + B** = Black screen
- **Ctrl + C** = Text on/off (background only)
- **Ctrl + L** = Logo (⚠️ *not* Go Live)

**Full list (${HOTKEYS_VERIFIED_FOR}):**
${HOTKEYS_TEXT}

_Source: [EasyWorship support](${HOTKEYS_SOURCE_URL}). For EW6 / 2009, check the Help menu._`,
  },
  {
    id: "projector",
    title: { tl: "Projector / second screen", en: "Projector / second screen" },
    keywords: ["projector", "projection", "second screen", "2nd screen", "output window", "ikalawang screen", "extend", "hdmi", "tv", "screen", "i-project", "fullscreen"],
    tl: `**Paano ilabas sa projector:**

1. Ikabit ang projector at i-**Extend** ang display ng Windows (Win + P → *Extend*).
2. Sa **Output**, pindutin ang **Projector** → **Open output window**.
   - Sa Chrome/Edge: **On 2nd screen** para diretso sa projector (hihingi ng permiso).
3. I-drag ang window sa projector, tapos i-click para mag-fullscreen.

_Berdeng tuldok sa **Projector** = nakakonekta na._`,
    en: `**How to show it on the projector:**

1. Connect the projector and set Windows to **Extend** (Win + P → *Extend*).
2. In **Output**, press **Projector** → **Open output window**.
   - In Chrome/Edge: **On 2nd screen** sends it straight to the projector (asks permission).
3. Drag the window to the projector, then click it for fullscreen.

_Green dot on **Projector** = connected._`,
  },
  {
    id: "logo",
    title: { tl: "Logo screen", en: "Logo screen" },
    keywords: ["logo screen", "logo settings", "church logo", "logo ng church", "logo ng simbahan", "standby screen", "welcome screen"],
    tl: `**Logo screen (Ctrl + L):**

- Pindutin ang **Ctrl + L** para ipakita/itago ang logo.
- Para palitan: pindutin ang **⚙** sa tabi ng **Logo** button (Logo settings) at pumili ng **larawan**, **video**, o built-in, at pwedeng lagyan ng Title / Subtitle.

_Hindi naaapektuhan ng Logo ang Stage screen ng banda._`,
    en: `**Logo screen (Ctrl + L):**

- Press **Ctrl + L** to show/hide the logo.
- To change it: press the **⚙** next to the **Logo** button (Logo settings) and pick an **image**, a **video** or a built-in one, with an optional Title / Subtitle.

_The Logo does not affect the band's Stage screen._`,
  },
  {
    id: "alerts",
    title: { tl: "Nursery alert at stage announcement", en: "Nursery alert and stage announcement" },
    keywords: ["alert", "alerts", "nursery", "nursery alert", "ticker", "message ticker", "announcement", "stage announcement", "paging", "parent", "magulang", "mensahe sa screen"],
    tl: `**Mensahe habang may service:**

- **Nursery alert** (lalabas sa projector bilang ticker): sa ibaba ng Live panel, i-type ang mensahe (hal. *Parent #104*), tapos **Send**.
- **Stage announcement** (banda lang ang makakakita, sa Stage screen): i-type sa *Stage announcement* (hal. *Ulitin ang chorus*), tapos **Send**.

_Pwede rin itong ipadala mula sa **Alert** tab ng phone remote._`,
    en: `**Messages during the service:**

- **Nursery alert** (shows on the projector as a ticker): below the Live panel, type the message (e.g. *Parent #104*) and press **Send**.
- **Stage announcement** (only the band sees it, on the Stage screen): type it in *Stage announcement* (e.g. *Repeat the chorus*) and press **Send**.

_You can also send these from the phone remote's **Alert** tab._`,
  },
  {
    id: "lineups",
    title: { tl: "Lineups (setlist bawat service)", en: "Lineups (setlist per service)" },
    keywords: ["lineup", "lineups", "setlist", "set list", "save schedule", "i-save ang schedule", "sunday", "linggo", "service order", "next sunday"],
    tl: `**Lineups: i-save ang Schedule ng bawat service:**

1. Ayusin ang **Schedule** (mga kanta, verse, atbp.).
2. Sa itaas ng Schedule, pindutin ang **Lineups**.
3. Bigyan ng pangalan at petsa (hal. *Sunday Service, Nov 23*), tapos **Save**.
4. Sa susunod, buksan lang ito ulit sa **Lineups**.

_Kasama sa **Basic / Pro** plan._`,
    en: `**Lineups: save each service's Schedule:**

1. Build the **Schedule** (songs, verses, etc.).
2. At the top of the Schedule, press **Lineups**.
3. Give it a name and date (e.g. *Sunday Service, Nov 23*), then **Save**.
4. Next time, just open it again from **Lineups**.

_Part of the **Basic / Pro** plan._`,
  },
  {
    id: "import-songs",
    title: { tl: "Import / Bulk Add / Export ng kanta", en: "Import / Bulk Add / Export songs" },
    keywords: ["import", "bulk add", "bulk", "maraming kanta", "many songs", "songselect", "ppt lyrics", "powerpoint lyrics", "folder", "export", "backup", "i-backup", "txt"],
    tl: `**Maramihang kanta sa Library → Songs:**

- **Import**: My Songs backup (.json), SongSelect (.txt, .usr, .bin), o ChordPro (.cho, .pro).
- **Bulk Add**: i-paste ang maraming kanta nang sabay (\`---\` sa pagitan ng bawat kanta).
- **PPT**: kunin ang lyrics mula sa PowerPoint (.pptx). May preview bago i-save.
- **Folder**: lahat ng song files sa isang folder.
- **Export**: i-save ang lahat ng My Songs bilang backup (.json).

_Gamitin lang ang lyrics na sakop ng CCLI license ng church ninyo._`,
    en: `**Many songs at once in Library → Songs:**

- **Import**: My Songs backup (.json), SongSelect (.txt, .usr, .bin) or ChordPro (.cho, .pro).
- **Bulk Add**: paste many songs at once (\`---\` between songs).
- **PPT**: take lyrics from PowerPoint (.pptx), with a preview before saving.
- **Folder**: every song file in a folder.
- **Export**: save all My Songs as a backup (.json).

_Only use lyrics covered by your church's CCLI license._`,
  },
  {
    id: "presentations",
    title: { tl: "PowerPoint at larawan bilang slides", en: "PowerPoint and images as slides" },
    keywords: ["powerpoint", "pptx", "presentation", "presentations", "slides", "images", "larawan", "announcement slides", "sermon slides", "pictures"],
    tl: `**PowerPoint o larawan bilang slides:**

1. **Library** → **PPT** tab.
2. **Import .pptx** (text, background, at notes ng bawat slide) o **Import images** (1 larawan = 1 slide).
3. **Add** papunta sa Schedule, o **double-click** para i-LIVE.

_Lalabas ang speaker notes sa Foldback. Hindi gumagana ang lumang .ppt; i-save muna bilang .pptx._`,
    en: `**PowerPoint or images as slides:**

1. **Library** → **PPT**.
2. **Import .pptx** (text, background and notes of each slide) or **Import images** (1 image = 1 slide).
3. **Add** to the Schedule, or **double-click** to put it LIVE.

_Speaker notes show on the Foldback. Old .ppt files don't work; save as .pptx first._`,
  },
  {
    id: "backgrounds",
    title: { tl: "Background at itsura ng text", en: "Backgrounds and text style" },
    keywords: ["background", "backgrounds", "video background", "motion background", "loop", "theme", "themes", "text style", "font", "kulay", "color", "laki ng text", "font size"],
    tl: `**Background at itsura:**

- **Theme** (sa Output): text style + background sa isang click.
- **Text** (sa Output): font, laki, at kulay ng lyrics.
- **Sariling background ng isang kanta** (larawan o video na umuulit): **Edit** ang kanta → **Background** tab.
- Mga larawan at video: **Library** → **Media** tab.`,
    en: `**Backgrounds and look:**

- **Theme** (in Output): text style + background in one click.
- **Text** (in Output): font, size and color of the lyrics.
- **A song's own background** (looping image or video): **Edit** the song → **Background** tab.
- Images and videos: **Library** → **Media**.`,
  },
  {
    id: "sync",
    title: { tl: "Backup at sync", en: "Backup and sync" },
    keywords: ["sync", "cloud", "cloud sync", "couchdb", "backup", "ibang laptop", "other laptop", "nawala", "lost songs", "save", "account", "login"],
    tl: `**Para hindi mawala ang mga kanta:**

- **Export** (Library → Songs): i-save ang My Songs bilang .json. Pwedeng i-**Import** sa ibang laptop.
- **Cloud sync** (Pro): pareho ang songs, Bible, PPT, at Lineups sa lahat ng laptop ng church. Mag-login muna gamit ang **Account** button.

_Naka-save ang lahat sa browser ng laptop na ito. Huwag i-clear ang browser data nang walang backup._`,
    en: `**So your songs don't get lost:**

- **Export** (Library → Songs): save My Songs as .json. You can **Import** it on another laptop.
- **Cloud sync** (Pro): the same songs, Bibles, PPT and Lineups on every church laptop. Log in first with the **Account** button.

_Everything is saved in this laptop's browser. Don't clear browser data without a backup._`,
  },
  {
    id: "ew-ndi",
    title: { tl: "EasyWorship: lyrics sa OBS (NDI)", en: "EasyWorship: lyrics in OBS (NDI)" },
    keywords: ["ndi", "obs", "live stream", "livestream", "stream", "vmix", "lower third", "lower thirds", "facebook live", "youtube live"],
    tl: `**EasyWorship → OBS gamit ang NDI (EW6/EW7):**

1. **EasyWorship:** i-enable ang **NDI output** sa settings ng Live Output.
2. **OBS:** i-install ang NDI plugin, tapos **+** → **NDI™ Source** → piliin ang EasyWorship.
3. Para sa lower-third: gumamit ng theme na **transparent o itim** ang background.

_Iba-iba ang menu sa bawat version. Kung hindi mo makita, i-check ang Help ng EasyWorship mo._`,
    en: `**EasyWorship → OBS with NDI (EW6/EW7):**

1. **EasyWorship:** turn on **NDI output** in the Live Output settings.
2. **OBS:** install the NDI plugin, then **+** → **NDI™ Source** → pick EasyWorship.
3. For lower-thirds: use a theme with a **transparent or black** background.

_Menus differ between versions. If you can't find it, check your EasyWorship Help._`,
  },
  {
    id: "ew-foldback",
    title: { tl: "EasyWorship: Foldback / stage display", en: "EasyWorship: Foldback / stage display" },
    keywords: ["easyworship foldback", "foldback", "enable foldback", "foldback display", "ew foldback"],
    tl: `**Foldback sa EasyWorship:**

1. **Edit** → **Options** → **Foldback**.
2. I-check ang **Enable Foldback**, tapos piliin ang monitor na nakaharap sa stage.
3. Ayusin ang layout: orasan, kasalukuyang slide, at susunod na slide.

_Dito sa app, ang katapat nito ay ang **Stage screen** (may chords pa para sa banda)._`,
    en: `**Foldback in EasyWorship:**

1. **Edit** → **Options** → **Foldback**.
2. Tick **Enable Foldback**, then pick the monitor facing the stage.
3. Set the layout: clock, current slide and next slide.

_In this app, the same thing is the **Stage screen** (with chords for the band, too)._`,
  },
  {
    id: "about-help",
    title: { tl: "Ano ang kaya ng Help na ito?", en: "What can this Help do?" },
    keywords: ["help", "tulong", "ano ang kaya mo", "what can you do", "paano gamitin", "how to use", "hello", "hi", "kumusta", "salamat", "thank you"],
    tl: `**Kaya kong sagutin, kahit walang internet:**

- 🎵 Kanta, chords, Bible, Schedule, at Lineups
- 🖥️ Projector, Stage screen, Logo, at alerts
- 🎸 **Transpose** (\`G to E\`, \`G C D +2\`) at **Capo** (\`capo 3 G\`)
- ⌨️ Hotkeys (Ctrl + B, Page Down…)

_Hindi ito AI. Mga nakahandang sagot ito, kaya maikli at diretso ang itanong mo._`,
    en: `**I can answer these, even offline:**

- 🎵 Songs, chords, Bible, Schedule and Lineups
- 🖥️ Projector, Stage screen, Logo and alerts
- 🎸 **Transpose** (\`G to E\`, \`G C D +2\`) and **Capo** (\`capo 3 G\`)
- ⌨️ Hotkeys (Ctrl + B, Page Down…)

_This isn't AI. These are ready-made answers, so keep your question short and simple._`,
  },
];
