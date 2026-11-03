/**
 * 2026-10-20 (Jarvis): Bibles tab of the simulator's Media Library.
 *  - Built-in sample verses (Ang Biblia, KJV, MBB short quotes).
 *  - Full Bibles imported from a .wtp-bible.json file (KJV, Ang Dating Biblia 1905 — public
 *    domain), saved in IndexedDB. Type a reference ("Juan 3:16", "Awit 23", "1 Cor 13:4-7")
 *    or a word to search.
 * 2026-11-03b: saved in PouchDB + optional CouchDB sync (bibleStore.ts / couchSync.ts).
 */
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Upload, Settings2, Trash2, Info, AlertTriangle, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { ScriptureVerse } from "../types";
import { SAMPLE_VERSES, BIBLE_VERSIONS, BIBLE_COPYRIGHT, scriptureSlideText } from "../data/easyworshipData";
import { BIBLE_BOOKS, parseReference } from "../lib/bibleBooks";
import { BibleMeta, WtpBible, BIBLE_LIMITS, listBibles, getBible, saveBible, deleteBible, validateBible, toMeta, watchBibles } from "../lib/bibleStore";
import { CouchSyncPanel, autoStartCouchSync } from "./CouchSyncPanel";

export interface Passage {
  title: string;
  slides: { label: string; text: string }[];
}

interface BibleLibraryProps {
  searchQuery: string;
  onAddPassage: (p: Passage) => void;
  onLivePassage: (p: Passage) => void;
}

const MAX_KEYWORD_RESULTS = 50;
const MAX_PASSAGE_VERSES = 60;
/** Built-in sample version that an imported Bible replaces (hide the duplicate chip). */
const SAMPLE_EQUIVALENT: Record<string, ScriptureVerse["version"]> = { KJV: "KJV", ADB1905: "Tagalog Ang Biblia" };

const chipCls = (on: boolean) =>
  `tap-target px-2 py-1 rounded border text-xs transition-all ${on ? "bg-accent-soft text-accent-text border-accent/30 font-semibold" : "bg-surface-2 text-fg-muted border-line hover:bg-surface-3"}`;
const btnLive = "touch-44 lg:min-h-0 lg:min-w-0 bg-live-soft hover:bg-live-soft text-live-text px-2.5 py-2 lg:px-2 lg:py-1 rounded text-xs font-bold border border-live/30 transition-all";
const btnAdd = "touch-44 lg:min-h-0 lg:min-w-0 justify-center bg-accent-soft hover:bg-accent/20 text-accent-text px-2.5 py-2 lg:px-2 lg:py-1 rounded text-xs font-semibold border border-accent/30 transition-all flex items-center gap-1";

interface VerseHit {
  b: number;
  c: number;
  v: number;
  text: string;
}

export const BibleLibrary: React.FC<BibleLibraryProps> = ({ searchQuery, onAddPassage, onLivePassage }) => {
  const [selected, setSelected] = useState<string>("Tagalog Ang Biblia"); // sample version name or "imp:<id>"
  const [imported, setImported] = useState<BibleMeta[]>([]);
  const [persistent, setPersistent] = useState(true);
  const [bible, setBible] = useState<WtpBible | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const browseTopRef = useRef<HTMLDivElement>(null);
  const query = useDeferredValue(searchQuery.trim());
  // 2026-10-20: Browse (book → chapter → verses) for imported Bibles, with verse tick-boxes.
  const [browse, setBrowse] = useState<{ book: number | null; chapter: number | null }>({ book: null, chapter: null });
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const goBrowse = (book: number | null, chapter: number | null) => {
    setBrowse({ book, chapter });
    setPicked(new Set());
    browseTopRef.current?.scrollIntoView({ block: "nearest" });
  };

  // 2026-11-03b: bumped when Bibles change in the database (e.g. pulled from CouchDB) → reload.
  const [dbRev, setDbRev] = useState(0);
  useEffect(() => {
    let alive = true;
    listBibles().then(({ bibles, persistent: p }) => {
      if (!alive) return;
      setImported(bibles);
      setPersistent(p);
    });
    return () => {
      alive = false;
    };
  }, [dbRev]);
  useEffect(() => {
    void autoStartCouchSync();
    return watchBibles(() => setDbRev((r) => r + 1));
  }, []);

  // Load the selected imported Bible.
  useEffect(() => {
    if (!selected.startsWith("imp:")) {
      setBible(null);
      return;
    }
    const id = selected.slice(4);
    let alive = true;
    setBrowse({ book: null, chapter: null });
    setPicked(new Set());
    setBusy("Binubuksan ang Bible…");
    getBible(id).then((b) => {
      if (!alive) return;
      setBusy(null);
      setBible(b);
      if (!b) setNotice({ text: "Hindi mabuksan ang Bible. Subukang i-import ulit.", tone: "warn" });
    });
    return () => {
      alive = false;
    };
  }, [selected, dbRev]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > BIBLE_LIMITS.MAX_FILE_BYTES) {
      setNotice({ text: "Masyadong malaki ang file (max 20 MB).", tone: "warn" });
      return;
    }
    setBusy("Ini-import ang Bible…");
    try {
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        setNotice({ text: "Hindi mabasa ang file. Siguraduhing .wtp-bible.json ito.", tone: "warn" });
        return;
      }
      const { bible: clean, error } = validateBible(data);
      if (!clean) {
        setNotice({ text: error || "Sirang Bible file.", tone: "warn" });
        return;
      }
      if (imported.length >= BIBLE_LIMITS.MAX_BIBLES && !imported.some((m) => m.id === clean.id)) {
        setNotice({ text: `Hanggang ${BIBLE_LIMITS.MAX_BIBLES} Bible lang. Mag-delete muna sa Manage.`, tone: "warn" });
        return;
      }
      const ok = await saveBible(clean);
      const { bibles, persistent: p } = await listBibles();
      setImported(ok ? bibles : [...bibles.filter((b) => b.id !== clean.id), toMeta(clean)]);
      setPersistent(ok && p);
      setSelected(`imp:${clean.id}`);
      setNotice({
        text: ok
          ? `Na-import ang ${clean.name} (${clean.verseCount.toLocaleString()} verses).`
          : `Na-import ang ${clean.name}, pero hindi ma-save sa browser na ito — mawawala pag-reload.`,
        tone: ok ? "ok" : "warn",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteBible(id);
    setImported((list) => list.filter((b) => b.id !== id));
    setConfirmDeleteId(null);
    if (selected === `imp:${id}`) setSelected("Tagalog Ang Biblia");
    setNotice({ text: "Na-delete ang Bible.", tone: "ok" });
  };

  // ---------- chips ----------
  const hiddenSamples = new Set(imported.map((m) => SAMPLE_EQUIVALENT[m.id]).filter(Boolean));
  const sampleChips = BIBLE_VERSIONS.filter((v) => !hiddenSamples.has(v));
  useEffect(() => {
    // If the selected sample chip got replaced by an imported full Bible, switch to it.
    const replacedBy = imported.find((m) => SAMPLE_EQUIVALENT[m.id] === selected);
    if (replacedBy) setSelected(`imp:${replacedBy.id}`);
  }, [imported, selected]);

  // ---------- imported Bible helpers ----------
  const isTl = bible?.language === "tl";
  const bookName = (b: number) => {
    const bk = bible?.books[b];
    return (isTl ? bk?.tl : bk?.name) || bk?.name || BIBLE_BOOKS[b]?.[0] || "?";
  };
  const label = (h: VerseHit) => `${bookName(h.b)} ${h.c}:${h.v}`;
  const singlePassage = (h: VerseHit): Passage => ({
    title: `${label(h)} (${bible?.shortName})`,
    slides: [{ label: label(h), text: h.text }],
  });

  const flat = useMemo(() => {
    if (!bible) return [] as (VerseHit & { lower: string })[];
    const out: (VerseHit & { lower: string })[] = [];
    bible.books.forEach((bk, b) =>
      bk.chapters.forEach((ch, c) => ch.forEach((text, v) => text && out.push({ b, c: c + 1, v: v + 1, text, lower: text.toLowerCase() }))),
    );
    return out;
  }, [bible]);

  const result = useMemo(() => {
    if (!bible || !query) return null;
    const ref = parseReference(query);
    if (ref && ref.book < bible.books.length) {
      const chapter = bible.books[ref.book].chapters[ref.chapter - 1];
      if (!chapter) return { kind: "error" as const, text: `Walang kabanata ${ref.chapter} sa ${bookName(ref.book)}.` };
      const from = ref.from ?? 1;
      const to = Math.min(ref.to ?? chapter.length, chapter.length, from + MAX_PASSAGE_VERSES - 1);
      if (from > chapter.length) return { kind: "error" as const, text: `${bookName(ref.book)} ${ref.chapter} ay may ${chapter.length} verses lang.` };
      const hits: VerseHit[] = [];
      for (let v = from; v <= to; v++) hits.push({ b: ref.book, c: ref.chapter, v, text: chapter[v - 1] });
      const title = `${bookName(ref.book)} ${ref.chapter}:${from}${to > from ? `-${to}` : ""}`;
      return { kind: "ref" as const, title, hits };
    }
    if (query.length < 3) return { kind: "error" as const, text: "Mag-type ng reference (hal. Juan 3:16) o salitang may 3+ letra." };
    const q = query.toLowerCase();
    const hits: VerseHit[] = [];
    for (const f of flat) {
      if (f.lower.includes(q)) {
        hits.push(f);
        if (hits.length >= MAX_KEYWORD_RESULTS) break;
      }
    }
    return { kind: "word" as const, hits };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bible, query, flat]);

  // ---------- built-in samples ----------
  const sampleVerses = SAMPLE_VERSES.filter((v) => {
    if (v.version !== selected) return false;
    const ql = query.toLowerCase();
    return !ql || v.book.toLowerCase().includes(ql) || `${v.book} ${v.chapter}:${v.verse}`.toLowerCase().includes(ql) || v.text.toLowerCase().includes(ql);
  });
  const samplePassage = (v: ScriptureVerse): Passage => ({
    title: `${v.book} ${v.chapter}:${v.verse} (${v.version})`,
    slides: [{ label: `${v.book} ${v.chapter}:${v.verse}`, text: scriptureSlideText(v) }],
  });

  const verseRow = (key: string, heading: string, text: string, p: Passage) => (
    <div
      key={key}
      onDoubleClick={(e) => !(e.target as HTMLElement).closest("button") && onLivePassage(p)}
      title="Double-click = LIVE"
      className="bg-surface-2 hover:bg-surface-3 border border-line rounded-lg p-2.5 transition-all text-xs group shadow-xs cursor-pointer select-none touch-manipulation"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="font-bold text-accent-text">{heading}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onLivePassage(p)} className={btnLive} title="Instant direct projection">
            LIVE NOW
          </button>
          <button onClick={() => onAddPassage(p)} className={btnAdd}>
            <Plus className="w-3 h-3" />
            <span>Add</span>
          </button>
        </div>
      </div>
      <p className="text-fg-muted text-xs line-clamp-3 leading-relaxed italic">"{text}"</p>
    </div>
  );

  /** [1,2,3,5,7,8] → "1-3,5,7-8" */
  const compactRanges = (nums: number[]) => {
    const out: string[] = [];
    for (let i = 0; i < nums.length; i++) {
      let j = i;
      while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
      out.push(j > i ? `${nums[i]}-${nums[j]}` : `${nums[i]}`);
      i = j;
    }
    return out.join(",");
  };

  const navBtn = "touch-44 lg:min-h-0 lg:min-w-0 justify-center px-2.5 py-2 lg:px-2 lg:py-1 rounded border border-line bg-surface-2 hover:bg-surface-3 text-xs text-fg flex items-center gap-0.5 disabled:opacity-40";
  const gridBtn = "py-3 lg:py-2 min-h-[44px] lg:min-h-0 rounded border border-line bg-surface-2 hover:bg-accent/20 hover:border-accent/40 text-xs text-fg transition-all";

  const renderBrowse = () => {
    if (!bible) return null;
    const { book, chapter } = browse;
    // 1) Books
    if (book === null) {
      const group = (name: string, from: number, to: number) => (
        <div>
          <div className="text-xs font-bold text-fg-muted uppercase tracking-wider mb-1">{name}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            {bible.books.slice(from, to).map((_, i) => (
              <button key={from + i} onClick={() => goBrowse(from + i, null)} className={`${gridBtn} px-2 text-left truncate`}>
                {bookName(from + i)}
              </button>
            ))}
          </div>
        </div>
      );
      return (
        <div className="space-y-3">
          {bible.books.length === 66 ? (
            <>
              {group(isTl ? "Lumang Tipan" : "Old Testament", 0, 39)}
              {group(isTl ? "Bagong Tipan" : "New Testament", 39, 66)}
            </>
          ) : (
            group(isTl ? "Mga Aklat" : "Books", 0, bible.books.length)
          )}
        </div>
      );
    }
    const chapters = bible.books[book].chapters;
    // 2) Chapters
    if (chapter === null) {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button onClick={() => goBrowse(null, null)} className={navBtn}>
              <ChevronLeft className="w-3.5 h-3.5" /> {isTl ? "Mga Aklat" : "Books"}
            </button>
            <span className="text-sm font-bold text-accent-text">{bookName(book)}</span>
          </div>
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-1">
            {chapters.map((_, i) => (
              <button key={i} onClick={() => goBrowse(book, i + 1)} className={`${gridBtn} font-semibold`}>
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      );
    }
    // 3) Verses
    const verses = chapters[chapter - 1] || [];
    const hits: VerseHit[] = verses.map((text, i) => ({ b: book, c: chapter, v: i + 1, text })).filter((h) => h.text);
    const chosen = hits.filter((h) => picked.has(h.v));
    const use = chosen.length ? chosen : hits;
    const range = chosen.length ? compactRanges(chosen.map((h) => h.v)) : hits.length > 1 ? `1-${verses.length}` : "1";
    const passage: Passage = {
      title: `${bookName(book)} ${chapter}:${range} (${bible.shortName})`,
      slides: use.map((h) => ({ label: label(h), text: h.text })),
    };
    const prev = chapter > 1 ? { b: book, c: chapter - 1 } : book > 0 ? { b: book - 1, c: bible.books[book - 1].chapters.length } : null;
    const next = chapter < chapters.length ? { b: book, c: chapter + 1 } : book < bible.books.length - 1 ? { b: book + 1, c: 1 } : null;
    const toggle = (v: number) =>
      setPicked((s) => {
        const n = new Set(s);
        n.has(v) ? n.delete(v) : n.add(v);
        return n;
      });
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => goBrowse(null, null)} className={navBtn}>
            <ChevronLeft className="w-3.5 h-3.5" /> {isTl ? "Mga Aklat" : "Books"}
          </button>
          <button onClick={() => goBrowse(book, null)} className={navBtn}>
            <ChevronLeft className="w-3.5 h-3.5" /> {isTl ? "Kabanata" : "Chapters"}
          </button>
          <span className="text-sm font-bold text-accent-text ml-1">
            {bookName(book)} {chapter}
          </span>
          <span className="ml-auto flex gap-1">
            <button onClick={() => prev && goBrowse(prev.b, prev.c)} disabled={!prev} className={navBtn} aria-label="Previous chapter">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => next && goBrowse(next.b, next.c)} disabled={!next} className={navBtn} aria-label="Next chapter">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 bg-accent-soft border border-accent/30 rounded-lg px-2.5 py-2">
          <span className="text-xs text-fg">
            {chosen.length ? (
              <>
                <strong>{chosen.length}</strong> napili ({range}) ·{" "}
                <button onClick={() => setPicked(new Set())} className="text-accent-text underline">
                  Clear
                </button>
              </>
            ) : (
              <>Buong kabanata ({hits.length} verses) — o i-tick ang verses</>
            )}
          </span>
          <span className="flex gap-1">
            <button onClick={() => onLivePassage(passage)} className={btnLive}>
              {chosen.length ? `LIVE (${chosen.length})` : "LIVE ALL"}
            </button>
            <button onClick={() => onAddPassage(passage)} className={btnAdd}>
              <Plus className="w-3 h-3" />
              {chosen.length ? `Add (${chosen.length})` : "Add all"}
            </button>
          </span>
        </div>
        {hits.map((h) => (
          <div
            key={h.v}
            onDoubleClick={(e) => !(e.target as HTMLElement).closest("button, input") && onLivePassage(singlePassage(h))}
            title="Double-click = LIVE"
            className={`flex gap-2 items-start bg-surface-2 border rounded-lg p-2 text-xs select-none touch-manipulation ${picked.has(h.v) ? "border-accent/40 bg-accent-soft" : "border-line"}`}
          >
            <label className="flex items-start gap-2 flex-1 min-w-0 min-h-[44px] lg:min-h-0 cursor-pointer">
              <input type="checkbox" checked={picked.has(h.v)} onChange={() => toggle(h.v)} className="mt-0.5 w-5 h-5 lg:w-4 lg:h-4 shrink-0" aria-label={`Piliin ang verse ${h.v}`} />
              <span>
                <strong className="text-accent-text mr-1">{h.v}</strong>
                <span className="text-fg leading-relaxed">{h.text}</span>
              </span>
            </label>
            <span className="flex flex-col gap-1 shrink-0">
              <button onClick={() => onLivePassage(singlePassage(h))} className={btnLive} title="Instant direct projection">
                LIVE
              </button>
              <button onClick={() => onAddPassage(singlePassage(h))} className={btnAdd} aria-label={`Add verse ${h.v}`}>
                <Plus className="w-3 h-3" />
              </button>
            </span>
          </div>
        ))}
        {next && (
          <button onClick={() => goBrowse(next.b, next.c)} className={`${navBtn} w-full justify-center py-2`}>
            {bookName(next.b)} {next.c} <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  };

  const selectedMeta = selected.startsWith("imp:") ? imported.find((m) => `imp:${m.id}` === selected) : undefined;

  return (
    <div className="space-y-2">
      {/* Version chips */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-fg-subtle mr-0.5">Version:</span>
        {imported.map((m) => (
          <button key={m.id} onClick={() => setSelected(`imp:${m.id}`)} className={chipCls(selected === `imp:${m.id}`)} title={`${m.name} — buong Bible`}>
            {m.shortName}
          </button>
        ))}
        {sampleChips.map((v) => (
          <button key={v} onClick={() => setSelected(v)} className={chipCls(selected === v)} title="Sample verses lang">
            {v}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => fileRef.current?.click()} disabled={!!busy} className="tap-target px-2.5 py-1.5 rounded-md text-xs font-semibold border bg-surface-2 hover:bg-surface-3 text-fg border-line flex items-center gap-1 disabled:opacity-50">
          <Upload className="w-3.5 h-3.5" />
          Import Bible
        </button>
        {imported.length > 0 && (
          <button onClick={() => setManageOpen((o) => !o)} className="tap-target px-2.5 py-1.5 rounded-md text-xs font-semibold border bg-surface-2 hover:bg-surface-3 text-fg border-line flex items-center gap-1">
            <Settings2 className="w-3.5 h-3.5" />
            Manage
          </button>
        )}
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImport} data-testid="bible-import-input" />
      </div>

      <CouchSyncPanel />

      {busy && (
        <p className="text-xs text-fg-muted flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> {busy}
        </p>
      )}
      {!persistent && (
        <p className="text-xs text-warn-text bg-warn-soft border border-warn/30 rounded-md px-2 py-1.5 flex gap-1.5">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Hindi makapag-save ng Bible sa browser na ito (private mode?). Kailangang i-import ulit pag-reload.
        </p>
      )}
      {notice && (
        <p role="status" className={`text-xs rounded-md px-2 py-1.5 border ${notice.tone === "ok" ? "text-fg bg-ok-soft border-ok/30" : "text-warn-text bg-warn-soft border-warn/30"}`}>
          {notice.text}
        </p>
      )}

      {/* Manage imported Bibles */}
      {manageOpen && imported.length > 0 && (
        <div className="bg-surface-2 border border-line rounded-lg p-2 space-y-1.5">
          {imported.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate">
                <strong>{m.shortName}</strong> · {m.verseCount.toLocaleString()} verses · {m.license || "—"}
              </span>
              {confirmDeleteId === m.id ? (
                <span className="flex gap-1 shrink-0">
                  <button onClick={() => handleDelete(m.id)} className="px-3 py-2 lg:px-2 lg:py-1 rounded bg-live text-white font-semibold">Delete</button>
                  <button onClick={() => setConfirmDeleteId(null)} className="px-3 py-2 lg:px-2 lg:py-1 rounded border border-line">Cancel</button>
                </span>
              ) : (
                <button onClick={() => setConfirmDeleteId(m.id)} className="p-2.5 lg:p-1.5 rounded text-fg-subtle hover:text-live-text hover:bg-live-soft" aria-label={`Delete ${m.shortName}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Copyright line for sample MBB */}
      {BIBLE_COPYRIGHT[selected as keyof typeof BIBLE_COPYRIGHT] && (
        <p className="text-xs text-fg-subtle">{BIBLE_COPYRIGHT[selected as keyof typeof BIBLE_COPYRIGHT]} Ginagamit nang may pahintulot (maikling sipi).</p>
      )}
      {selectedMeta && (
        <p className="text-xs text-fg-subtle">
          {selectedMeta.name} · {selectedMeta.license}
        </p>
      )}

      {/* ---------- Results ---------- */}
      {!selected.startsWith("imp:") && (
        <>
          {imported.length === 0 && (
            <p className="text-xs text-fg-subtle bg-surface-2 border border-dashed border-line-strong rounded-lg p-2.5 flex gap-1.5">
              <Info className="w-4 h-4 shrink-0 text-accent-text" />
              <span>Sample verses lang ito. Para sa buong Bible, i-click ang <strong>Import Bible</strong> at piliin ang <code>.wtp-bible.json</code> file.</span>
            </p>
          )}
          {sampleVerses.map((v, i) => verseRow(`s${i}`, `${v.book} ${v.chapter}:${v.verse} (${v.version})`, v.text, samplePassage(v)))}
        </>
      )}

      {selected.startsWith("imp:") && bible && (
        <>
          <div ref={browseTopRef} />
          {!query && (
            <>
              <p className="text-xs text-fg-subtle">
                Pumili ng aklat at kabanata, o i-type sa search ang reference (hal. <strong>Juan 3:16</strong>, <strong>Awit 23</strong>) o isang salita.
              </p>
              {renderBrowse()}
            </>
          )}
          {result?.kind === "error" && <p className="text-xs text-fg-subtle p-1">{result.text}</p>}
          {result?.kind === "ref" && (
            <>
              <div className="flex items-center justify-between gap-2 bg-accent-soft border border-accent/30 rounded-lg px-2.5 py-2">
                <span className="text-xs font-bold text-accent-text">
                  {result.title} <span className="font-normal text-fg-subtle">({bible.shortName} · {result.hits.length} verse{result.hits.length === 1 ? "" : "s"})</span>
                </span>
                {result.hits.length > 1 && (
                  <span className="flex gap-1 shrink-0">
                    <button
                      onClick={() => onLivePassage({ title: `${result.title} (${bible.shortName})`, slides: result.hits.map((h) => ({ label: label(h), text: h.text })) })}
                      className={btnLive}
                    >
                      LIVE ALL
                    </button>
                    <button
                      onClick={() => onAddPassage({ title: `${result.title} (${bible.shortName})`, slides: result.hits.map((h) => ({ label: label(h), text: h.text })) })}
                      className={btnAdd}
                    >
                      <Plus className="w-3 h-3" />
                      Add all
                    </button>
                  </span>
                )}
              </div>
              {result.hits.map((h) => verseRow(`r${h.b}-${h.c}-${h.v}`, label(h), h.text, singlePassage(h)))}
            </>
          )}
          {result?.kind === "word" && (
            <>
              <p className="text-xs text-fg-subtle px-1">
                {result.hits.length === 0 ? `Walang verse na may "${query}".` : `${result.hits.length}${result.hits.length >= MAX_KEYWORD_RESULTS ? "+" : ""} verse na may "${query}"`}
              </p>
              {result.hits.map((h) => verseRow(`w${h.b}-${h.c}-${h.v}`, label(h), h.text, singlePassage(h)))}
            </>
          )}
        </>
      )}
    </div>
  );
};
