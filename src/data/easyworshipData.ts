import { SongItem, ScriptureVerse, ScheduleItem, WorkflowGuide } from "../types";

// 2026-10-20 (Jarvis): sample songs are PUBLIC DOMAIN hymns only. The old samples
// (Goodness of God, 10,000 Reasons, Way Maker) are copyrighted, and publishing their
// full lyrics in a public app needs a licence. "Dakilang Katapatan" lyrics/author could
// not be verified. Do not add modern worship lyrics here; title/author/CCLI # only.
export const SAMPLE_SONGS: SongItem[] = [
  {
    id: "song-1",
    title: "Holy, Holy, Holy",
    author: "Reginald Heber / John B. Dykes",
    key: "D",
    ccli: "Public Domain",
    slides: [
      {
        label: "Verse 1",
        text: "Holy, holy, holy! Lord God Almighty!\nEarly in the morning our song shall rise to Thee;\nHoly, holy, holy! Merciful and mighty!\nGod in three Persons, blessed Trinity!",
      },
      {
        label: "Verse 2",
        text: "Holy, holy, holy! All the saints adore Thee,\nCasting down their golden crowns around the glassy sea;\nCherubim and seraphim falling down before Thee,\nWhich wert, and art, and evermore shalt be.",
      },
      {
        label: "Verse 3",
        text: "Holy, holy, holy! Though the darkness hide Thee,\nThough the eye of sinful man Thy glory may not see;\nOnly Thou art holy; there is none beside Thee,\nPerfect in power, in love, and purity.",
      },
      {
        label: "Verse 4",
        text: "Holy, holy, holy! Lord God Almighty!\nAll Thy works shall praise Thy name, in earth, and sky, and sea;\nHoly, holy, holy! Merciful and mighty!\nGod in three Persons, blessed Trinity!",
      },
    ],
    defaultBackground: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
  },
  {
    id: "song-2",
    title: "It Is Well with My Soul",
    author: "Horatio G. Spafford / Philip P. Bliss",
    key: "C",
    ccli: "Public Domain",
    slides: [
      {
        label: "Verse 1",
        text: "When peace like a river attendeth my way,\nWhen sorrows like sea billows roll;\nWhatever my lot, Thou hast taught me to say,\nIt is well, it is well with my soul.",
      },
      {
        label: "Chorus",
        text: "It is well with my soul,\nIt is well, it is well with my soul.",
      },
      {
        label: "Verse 2",
        text: "Though Satan should buffet, though trials should come,\nLet this blest assurance control,\nThat Christ has regarded my helpless estate,\nAnd hath shed His own blood for my soul.",
      },
    ],
    defaultBackground: "linear-gradient(135deg, #14532d 0%, #0f172a 100%)",
  },
  {
    id: "song-3",
    title: "Blessed Assurance",
    author: "Fanny J. Crosby / Phoebe P. Knapp",
    key: "D",
    ccli: "Public Domain",
    slides: [
      {
        label: "Verse 1",
        text: "Blessed assurance, Jesus is mine!\nO what a foretaste of glory divine!\nHeir of salvation, purchase of God,\nBorn of His Spirit, washed in His blood.",
      },
      {
        label: "Chorus",
        text: "This is my story, this is my song,\nPraising my Savior all the day long;\nThis is my story, this is my song,\nPraising my Savior all the day long.",
      },
      {
        label: "Verse 2",
        text: "Perfect submission, perfect delight,\nVisions of rapture now burst on my sight;\nAngels descending bring from above\nEchoes of mercy, whispers of love.",
      },
    ],
    defaultBackground: "linear-gradient(135deg, #701a75 0%, #0f172a 100%)",
  },
  {
    id: "song-4",
    title: "Be Thou My Vision",
    author: "Irish trad. / tr. Mary E. Byrne, vers. Eleanor H. Hull",
    key: "Eb",
    ccli: "Public Domain",
    slides: [
      {
        label: "Verse 1",
        text: "Be Thou my Vision, O Lord of my heart;\nNaught be all else to me, save that Thou art;\nThou my best thought, by day or by night,\nWaking or sleeping, Thy presence my light.",
      },
      {
        label: "Verse 2",
        text: "Be Thou my Wisdom, and Thou my true Word;\nI ever with Thee and Thou with me, Lord;\nThou my great Father, I Thy true son;\nThou in me dwelling, and I with Thee one.",
      },
    ],
    defaultBackground: "linear-gradient(135deg, #0c4a6e 0%, #0f172a 100%)",
  },
  {
    id: "song-5",
    title: "Amazing Grace",
    author: "John Newton",
    key: "F",
    ccli: "22025",
    slides: [
      {
        label: "Verse 1",
        text: "Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see.",
      },
      {
        label: "Verse 2",
        text: "'Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed!",
      },
    ],
    defaultBackground: "linear-gradient(135deg, #431407 0%, #0f172a 100%)",
  },
];

// 2026-10-20 (Jarvis): popular modern songs as REFERENCE ONLY (title + artist, NO lyrics).
// The user adds the lyrics themselves into "My Songs" (saved in their own browser).
export const SONGSELECT_SEARCH_URL = "https://songselect.ccli.com/search/results?search=";

export const REFERENCE_SONGS: SongItem[] = [
  { id: "ref-1", title: "What a Beautiful Name", author: "Hillsong Worship", slides: [], source: "reference" },
  { id: "ref-2", title: "Cornerstone", author: "Hillsong Worship", slides: [], source: "reference" },
  { id: "ref-3", title: "Mighty to Save", author: "Hillsong Worship", slides: [], source: "reference" },
  { id: "ref-4", title: "Oceans (Where Feet May Fail)", author: "Hillsong UNITED", slides: [], source: "reference" },
  { id: "ref-5", title: "Way Maker", author: "Sinach", slides: [], source: "reference" },
  { id: "ref-6", title: "Goodness of God", author: "Bethel Music", slides: [], source: "reference" },
  { id: "ref-7", title: "10,000 Reasons (Bless the Lord)", author: "Matt Redman", slides: [], source: "reference" },
  { id: "ref-8", title: "Build My Life", author: "Pat Barrett / Housefires", slides: [], source: "reference" },
];

// 2026-10-20 (Jarvis): Bible versions in the simulator.
//  - Tagalog Ang Biblia (1905) and KJV: public domain.
//  - MBB (Magandang Balita Biblia): © Philippine Bible Society. Short quotations (up to 500
//    verses, less than half of a book) are allowed without permission; for slides/bulletins
//    the initials "MBB" must appear at the end of the quotation. NIV was removed (copyrighted).
export const BIBLE_VERSIONS: ScriptureVerse["version"][] = ["Tagalog Ang Biblia", "KJV", "MBB"];
export const BIBLE_COPYRIGHT: Partial<Record<ScriptureVerse["version"], string>> = {
  MBB: "Magandang Balita Biblia, Copyright © Philippine Bible Society 2012.",
};

/** Text to project for a verse; MBB quotations must end with "(MBB)". */
export function scriptureSlideText(verse: ScriptureVerse): string {
  return verse.version === "MBB" ? `${verse.text} (MBB)` : verse.text;
}

export const SAMPLE_VERSES: ScriptureVerse[] = [
  {
    book: "John",
    chapter: 3,
    verse: 16,
    version: "Tagalog Ang Biblia",
    text: "Sapagka't gayon na lamang ang pagsinta ng Dios sa sanglibutan, na ibinigay Niya ang Kaniyang bugtong na Anak, upang ang sinomang sa Kaniya'y sumampalataya ay huwag mapahamak, kundi magkaroon ng buhay na walang hanggan.",
  },
  {
    book: "John",
    chapter: 3,
    verse: 16,
    version: "KJV",
    text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
  },
  {
    book: "John",
    chapter: 3,
    verse: 16,
    version: "MBB",
    text: "Sapagkat gayon na lamang ang pag-ibig ng Diyos sa sangkatauhan, kaya't ibinigay niya ang kanyang kaisa-isang Anak, upang ang sinumang sumampalataya sa kanya ay hindi mapahamak, kundi magkaroon ng buhay na walang hanggan.",
  },
  {
    book: "Psalm",
    chapter: 23,
    verse: 1,
    version: "Tagalog Ang Biblia",
    text: "Ang Panginoon ay aking pastor; hindi ako mangangailangan.",
  },
  {
    book: "Psalm",
    chapter: 23,
    verse: 1,
    version: "KJV",
    text: "The LORD is my shepherd; I shall not want.",
  },
  {
    book: "Philippians",
    chapter: 4,
    verse: 13,
    version: "Tagalog Ang Biblia",
    text: "Lahat ng mga bagay ay aking magagawa doon sa nagpapalakas sa akin.",
  },
  {
    book: "Philippians",
    chapter: 4,
    verse: 13,
    version: "MBB",
    text: "Ang lahat ng ito'y magagawa ko dahil sa lakas na kaloob sa akin ni Cristo.",
  },
  {
    book: "Jeremiah",
    chapter: 29,
    verse: 11,
    version: "MBB",
    text: "Sapagkat batid kong lubos ang mga plano ko para sa inyo; mga planong hindi ninyo ikakasama kundi para sa inyong ikabubuti. Ito'y mga planong magdudulot sa inyo ng kinabukasang punung-puno ng pag-asa.",
  },
  {
    book: "Romans",
    chapter: 8,
    verse: 28,
    version: "Tagalog Ang Biblia",
    text: "At nalalaman natin na ang lahat ng mga bagay ay nagkakalakip na gumagawa sa ikabubuti ng mga nagsisiibig sa Dios, sa makatuwid baga'y niyaong mga tinawag alinsunod sa Kaniyang panukala.",
  },
];

/**
 * 2026-10-29 (Jarvis): built-in backgrounds — pure CSS (no files, no internet), so they work
 * offline at church. Replaced the old Unsplash links (online only, 300 px).
 */
export const SAMPLE_BACKGROUNDS: { id: string; name: string; css: string }[] = [
  { id: "bg-deep-blue", name: "Deep Blue", css: "radial-gradient(120% 90% at 20% 10%, #2b4fa8 0%, transparent 55%), radial-gradient(90% 80% at 85% 90%, #0e3a6b 0%, transparent 60%), #0a1530" },
  { id: "bg-sunrise", name: "Sunrise", css: "radial-gradient(90% 70% at 50% 110%, #f59e0b 0%, transparent 60%), linear-gradient(180deg, #1e1b4b 0%, #7c2d12 70%, #b45309 100%)" },
  { id: "bg-forest", name: "Forest", css: "radial-gradient(100% 80% at 80% 0%, #166534 0%, transparent 55%), linear-gradient(160deg, #052e16 0%, #064e3b 60%, #022c22 100%)" },
  { id: "bg-purple", name: "Purple Haze", css: "radial-gradient(80% 70% at 15% 85%, #7e22ce 0%, transparent 60%), radial-gradient(70% 60% at 85% 15%, #db2777 0%, transparent 55%), #1e0b33" },
  { id: "bg-ocean", name: "Ocean", css: "linear-gradient(180deg, #082f49 0%, #0e7490 55%, #155e75 100%)" },
  { id: "bg-charcoal", name: "Charcoal", css: "radial-gradient(100% 100% at 50% 0%, #3f3f46 0%, #18181b 60%, #09090b 100%)" },
];

export const INITIAL_SCHEDULE: ScheduleItem[] = [
  {
    id: "sched-1",
    title: "1. Welcome & Call to Worship",
    type: "presentation",
    activeSlideIndex: 0,
    slides: [
      {
        label: "Welcome Slide",
        text: "Welcome to Sunday Celebration Service!\nPlease find your seats and prepare your hearts.",
      },
      {
        label: "Theme Verse",
        text: "Enter His gates with thanksgiving and His courts with praise! (Psalm 100:4)",
      },
    ],
    background: "linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)",
  },
  {
    id: "sched-2",
    title: "2. Holy, Holy, Holy",
    type: "song",
    activeSlideIndex: 0,
    slides: SAMPLE_SONGS[0].slides,
    background: SAMPLE_SONGS[0].defaultBackground,
  },
  {
    id: "sched-3",
    title: "3. It Is Well with My Soul",
    type: "song",
    activeSlideIndex: 0,
    slides: SAMPLE_SONGS[1].slides,
    background: SAMPLE_SONGS[1].defaultBackground,
  },
  {
    id: "sched-4",
    title: "4. Scripture: John 3:16",
    type: "scripture",
    activeSlideIndex: 0,
    slides: [
      {
        label: "John 3:16 (Tagalog)",
        text: "Sapagka't gayon na lamang ang pagsinta ng Dios sa sanglibutan, na ibinigay Niya ang Kaniyang bugtong na Anak...",
      },
    ],
    background: "linear-gradient(135deg, #0284c7 0%, #082f49 100%)",
  },
];

export const WORKFLOW_GUIDES: WorkflowGuide[] = [
  {
    id: "wf-songs",
    title: "Adding Songs to Service Schedule",
    titleTl: "Pagdaragdag ng Kanta sa Service Schedule",
    category: "Songs",
    summary: "How to search, select, and sequence worship songs onto your service schedule canvas.",
    summaryTl: "Paano maghanap, pumili, at mag-ayos ng mga kanta papunta sa service schedule.",
    panelsInvolved: ["Media Library (Songs)", "Service Schedule / Canvas", "Preview Window"],
    steps: [
      {
        stepNumber: 1,
        title: "Open Media Library",
        titleTl: "Pumunta sa Media Library",
        panel: "Media Library",
        description: "Locate the 'Media Library' dock (usually bottom-left panel in EW7/EW6) and click the 'Songs' icon tab.",
        descriptionTl: "Pumunta sa 'Media Library' panel at i-click ang 'Songs' icon.",
      },
      {
        stepNumber: 2,
        title: "Search Song Title",
        titleTl: "I-search ang Pamagat",
        panel: "Media Library",
        description: "Type the song title or first line of lyrics in the instant search box.",
        descriptionTl: "I-type ang pamagat ng kanta o lyrics sa search bar.",
      },
      {
        stepNumber: 3,
        title: "Drag & Drop to Schedule",
        titleTl: "I-drag sa Service Canvas",
        panel: "Service Canvas",
        description: "Drag the found song and drop it into the 'Service Schedule' canvas on the left. Alternatively, double-click the song.",
        descriptionTl: "I-drag ang kanta at i-drop sa iyong 'Service Canvas' panel.",
        proTip: "You can drag to re-order songs in the schedule list anytime.",
      },
      {
        stepNumber: 4,
        title: "Go LIVE",
        titleTl: "I-project (Go LIVE)",
        panel: "LIVE Output",
        description: "Select the slide (Verse 1, Chorus) in the Preview window, then click 'Go LIVE' or press [Page Down].",
        descriptionTl: "Piliin ang slide at i-click ang 'LIVE' button sa preview (o pindutin ang [Page Down]).",
        shortcut: "Page Down",
      },
    ],
  },
  {
    id: "wf-scripture",
    title: "Quick Scripture Projection on the Fly",
    titleTl: "Mabilisang Pagpapakita ng Scripture (Talata)",
    category: "Scripture",
    summary: "Instantly locate and project bible verses when the Pastor quotes an unannounced passage.",
    summaryTl: "Mabilisang pag-project ng talata sa Biblia kapag biglang binanggit ng Pastor.",
    panelsInvolved: ["Media Library (Scripture)", "Preview Window", "LIVE Output"],
    steps: [
      {
        stepNumber: 1,
        title: "Select Bibles Tab",
        titleTl: "I-click ang Scriptures Tab",
        panel: "Media Library",
        description: "In the 'Media Library', click the 'Scripture' / Bible icon tab.",
        descriptionTl: "Sa 'Media Library', i-click ang 'Scripture' o 'Bible' icon.",
      },
      {
        stepNumber: 2,
        title: "Choose Version",
        titleTl: "Piliin ang Bersyon ng Biblia",
        panel: "Media Library",
        description: "Select the church's preferred translation (e.g., Tagalog Ang Biblia, KJV, NIV, ESV).",
        descriptionTl: "I-select ang bersyon (hal. Tagalog, KJV, NIV).",
      },
      {
        stepNumber: 3,
        title: "Type Reference",
        titleTl: "I-type ang Talata",
        panel: "Media Library",
        description: "Type the book name, chapter, and verse (e.g., 'John 3:16' or 'Rom 8:28') in the search field.",
        descriptionTl: "I-type ang 'John 3:16' sa search field.",
        proTip: "EasyWorship auto-completes book names as you type.",
      },
      {
        stepNumber: 4,
        title: "Direct LIVE Projection",
        titleTl: "I-project Agad",
        panel: "LIVE Output",
        description: "Double click the verse directly or click 'LIVE' in the Preview panel to immediately display it to the congregation.",
        descriptionTl: "I-click ang 'LIVE' button sa preview window (o pindutin ang [Page Down]).",
        shortcut: "Page Down",
      },
    ],
  },
  {
    id: "wf-ndi-obs",
    title: "NDI Streaming Setup with OBS Studio",
    titleTl: "Live Stream Setup gamit ang NDI papuntang OBS",
    category: "Streaming",
    summary: "Route live song lyrics and lower-third overlays digitally over local network into OBS or vMix.",
    summaryTl: "Pagpapadala ng lyrics bilang transparent overlay papuntang OBS via local network.",
    panelsInvolved: ["Options Menu", "OBS Studio", "LIVE Output"],
    steps: [
      {
        stepNumber: 1,
        title: "Enable NDI in EasyWorship",
        titleTl: "I-on ang NDI sa EasyWorship",
        panel: "Options Menu",
        description: "Go to 'Edit' > 'Options' > 'Live Output' (or 'Output' menu). Change output to 'NDI Output' and check enable.",
        descriptionTl: "Sa EasyWorship 'Output' menu, siguruhing naka-on ang NDI support.",
        proTip: "Requires NewTek NDI Tools installed on both machines if running across two computers.",
      },
      {
        stepNumber: 2,
        title: "Add NDI Source in OBS",
        titleTl: "Magdagdag ng NDI Source sa OBS",
        panel: "Options Menu",
        description: "Open OBS Studio. Under Sources, click '+' and select 'NDI™ Source'. Name it 'EasyWorship Lyrics'.",
        descriptionTl: "Sa OBS, magdagdag ng bagong 'NDI Source'.",
      },
      {
        stepNumber: 3,
        title: "Select EasyWorship Feed",
        titleTl: "Piliin ang EasyWorship Output",
        panel: "Options Menu",
        description: "In the NDI source properties dropdown, select the EasyWorship computer feed from the network list.",
        descriptionTl: "I-select ang EasyWorship output mula sa network list.",
      },
      {
        stepNumber: 4,
        title: "Transparent Lower-Third Filter",
        titleTl: "I-set ang Alpha / Lower-Third",
        panel: "LIVE Output",
        description: "In EasyWorship, apply a Lower-Third theme with black or transparent alpha background so video camera feeds show underneath the lyrics.",
        descriptionTl: "Malinis na output na may transparent background para sa camera video.",
      },
    ],
  },
  {
    id: "wf-foldback",
    title: "Stage Display / Foldback Confidence Monitor",
    titleTl: "Foldback / Stage Display para sa Worship Team & Pastor",
    category: "Hardware",
    summary: "Set up the back-of-house confidence monitor showing current lyrics, next line, and time clock.",
    summaryTl: "Pag-setup ng monitor sa likod ng entablado para sa mang-aawit at tagapagsalita.",
    panelsInvolved: ["Options Menu", "Preview Window", "LIVE Output"],
    steps: [
      {
        stepNumber: 1,
        title: "Enable Foldback Support",
        titleTl: "I-enable ang Foldback",
        panel: "Options Menu",
        description: "Click 'Edit' > 'Options' > 'Foldback'. Check 'Enable Foldback (Confidence Screen)'.",
        descriptionTl: "Pumunta sa 'Edit' > 'Options' > 'Foldback' at i-enable ito.",
      },
      {
        stepNumber: 2,
        title: "Assign Stage Monitor Output",
        titleTl: "Piliin ang Stage Monitor",
        panel: "Options Menu",
        description: "Select your 3rd display output (the TV or projector pointing at the stage) from the 'Foldback Display' dropdown.",
        descriptionTl: "Piliin ang display monitor na nakatutok sa stage.",
        proTip: "Windows must be set to 'Extend these displays' across all 2 or 3 monitors (Win + P).",
      },
      {
        stepNumber: 3,
        title: "Customize Stage Layout",
        titleTl: "I-customize ang Layout",
        panel: "Options Menu",
        description: "Configure Clock, Service Timer, Current Verse, and Next Verse preview colors (yellow/green highlight).",
        descriptionTl: "I-set ang orasan, kasalukuyang liriko, at preview ng susunod na talata.",
      },
      {
        stepNumber: 4,
        title: "Send Stage Alert Message",
        titleTl: "Magpadala ng Mensahe sa Stage",
        panel: "LIVE Output",
        description: "Use the Foldback Message box to send discreet notices directly to the pastor (e.g. '5 mins left' or 'Mic 2 battery low').",
        descriptionTl: "Gamitin ang message tool para sa pribadong mensahe sa Pastor o worship leader.",
      },
    ],
  },
];

// 2026-10-20 (Jarvis): hotkeys aligned to the OFFICIAL EasyWorship 7 list.
// The old list had Ctrl+L = "Go LIVE" (it is actually LOGO in EW7) and F5/F6/F7,
// which are not EasyWorship hotkeys. This list is the single source of truth:
// the Hotkeys tab, the simulator, the chat UI and the server AI prompt all read it.
// EW6 / EW2009 are NOT verified yet; the UI and the AI say so.
export const HOTKEYS_SOURCE_URL =
  "https://support.easyworship.com/support/solutions/articles/24000020383-shortcut-keys";
export const HOTKEYS_VERIFIED_FOR = "EasyWorship 7";

export const EW_KEYS = {
  goLive: "Page Down",
  black: "Ctrl + B",
  text: "Ctrl + C",
  logo: "Ctrl + L",
} as const;

export const EASYWORSHIP_SHORTCUTS = [
  { key: EW_KEYS.goLive, action: "Go LIVE", category: "Output" },
  { key: EW_KEYS.black, action: "Black screen on / off", category: "Emergency" },
  { key: EW_KEYS.text, action: "Live text on / off (keeps the background)", category: "Emergency" },
  { key: EW_KEYS.logo, action: "Logo on / off", category: "Emergency" },
  { key: "Ctrl + Space", action: "Switch live output / control screen (single monitor)", category: "Output" },
  { key: "Down / Up Arrow", action: "Next / previous slide", category: "Navigation" },
  { key: "Left / Right Arrow", action: "Previous / next schedule item", category: "Navigation" },
  { key: "Home / End", action: "First / last slide", category: "Navigation" },
  { key: "V + Enter / C + Enter", action: "First verse / first chorus", category: "Navigation" },
  { key: "Number + Enter", action: "Go to that slide number", category: "Navigation" },
  { key: "V + # + Enter / C + # + Enter", action: "Go to a verse / chorus number (e.g. V 2 Enter)", category: "Navigation" },
  { key: "Ctrl + O", action: "Open a schedule", category: "Schedule" },
  { key: "Ctrl + S", action: "Save the active schedule", category: "Schedule" },
  { key: "Ctrl + Del", action: "Delete the selected schedule item", category: "Schedule" },
  { key: "Ctrl + N", action: "Open the Alerts window", category: "Schedule" },
  { key: "Ctrl + M", action: "New live message alert", category: "Schedule" },
  { key: "Ctrl + F", action: "New foldback (stage) message", category: "Schedule" },
  { key: "Ctrl + Enter", action: "New slide / split slide (in the editor)", category: "Schedule" },
];

/** Plain-text hotkey list for the AI system prompt and the offline fallback. */
export const HOTKEYS_TEXT = EASYWORSHIP_SHORTCUTS.map((s) => `- [${s.key}] : ${s.action}`).join("\n");
