# Bible files para sa WorshipTech-Pro

I-import sa app: **Simulator → Media Library → Bibles → Import Bible**, tapos piliin ang file.
Naka-save ang Bible sa browser (IndexedDB) — isang beses lang i-import bawat browser/PC.

| File | Version | License | Verses |
|---|---|---|---|
| `AngBiblia1905.wtp-bible.json` | Ang Dating Biblia (1905), Philippine Bible Society | Public Domain | 31,102 |
| `KJV.wtp-bible.json` | King James Version (1769), Pure Cambridge Edition | Public Domain | 31,102 |

**Source:** scrollmapper/bible_databases (GitHub) — `TagAngBiblia` at `KJVPCE`, parehong naka-label na Public Domain.
Ginawa ni Jarvis noong 2026-10-20: tinanggal ang `¶` marks; inayos ang malalaking unang salita ng bawat kabanata
(hal. "IN the beginning" → "In the beginning"); pinunan ang 4 na blangkong verse sa KJVPCE (Josue 15:1, Job 7:1,
Oseas 8:1, Roma 8:1) mula sa KJV text ng parehong repo. Paalala: "Lord" ang nakasulat kahit "LORD" (small caps)
sa orihinal na KJV — ganoon ang source data.

Huwag maglagay dito ng copyrighted na Bible (hal. MBB buo, NIV) nang walang permiso.

Format (`.wtp-bible.json`): `{ app: "WorshipTech-Pro", type: "bible", version: 1, id, name, shortName, language,
license, source, verseCount, books: [{ name, tl, chapters: [[verse1, verse2, ...], ...] }] }`
