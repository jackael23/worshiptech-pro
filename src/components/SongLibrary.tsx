/**
 * 2026-10-20 (Jarvis): Songs tab of the simulator's Media Library.
 *  - Samples: built-in public-domain hymns.
 *  - My Songs: added by the user (browser only), with edit / delete / export / import.
 *  - Reference: popular modern songs, title + artist only (no lyrics). "Add lyrics" turns
 *    one into a My Song that the user fills in themselves.
 * 2026-11-03: My Songs are saved in PouchDB (browser) + optional CouchDB sync (songsDb.ts).
 * 2026-11-06: Bulk Add (one big paste, "---" between songs) + Import folder, both with a preview first.
 * 2026-11-06 (b): a My Song can have its own background; Add / double-click puts it on the schedule item.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Download, Upload, ExternalLink, FilePlus2, AlertTriangle, ListPlus, FolderOpen, Image as ImageIcon, Presentation } from "lucide-react";
import { SongItem } from "../types";
import { SAMPLE_SONGS, REFERENCE_SONGS, SONGSELECT_SEARCH_URL } from "../data/easyworshipData";
import {
  StoredSong,
  SongDraft,
  MY_SONGS_LIMITS,
  toSongItem,
  newSongId,
  exportMySongsJson,
  importMySongsJson,
  upsertSongs,
} from "../lib/mySongsStore";
import { decodeTextFile, parseSongFile, parseSongFileForBulk, SONG_FILE_EXTENSIONS, MAX_SONG_FILE_BYTES } from "../lib/songImport";
import { SongEditorModal } from "./SongEditorModal";
import { BulkAddModal } from "./BulkAddModal";
import { BulkSong } from "../lib/bulkPaste";
// 2026-11-09: loaded only when a PowerPoint is imported (brings JSZip).
const parsePptxForBulk = async (...args: Parameters<typeof import("../lib/pptxSongImport").parsePptxForBulk>) =>
  (await import("../lib/pptxSongImport")).parsePptxForBulk(...args);
import { resolveSongBackground } from "../lib/songBackground";
import { loadSongsFromDb, saveSongsDiff, reloadSongs, watchSongs } from "../lib/songsDb";
import { CouchSyncPanel, autoStartCouchSync } from "./CouchSyncPanel";

type SongFilter = "all" | "sample" | "user" | "reference";

interface SongLibraryProps {
  searchQuery: string;
  onAddToSchedule: (song: SongItem) => void;
  /** 2026-10-20: double-click a song row = add to schedule + LIVE. */
  onLiveSong?: (song: SongItem) => void;
}

const FILTERS: { id: SongFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sample", label: "Hymns" },
  { id: "user", label: "My Songs" },
  { id: "reference", label: "Reference" },
];

// 2026-10-29: lg:py-1 — shorter rows on desktop (phones keep 44px tap targets via .tap-target)
const smallBtn =
  "tap-target px-2.5 py-1.5 lg:py-1 rounded-md text-xs font-semibold border transition-all flex items-center gap-1 shrink-0";

export const SongLibrary: React.FC<SongLibraryProps> = ({ searchQuery, onAddToSchedule, onLiveSong }) => {
  const [filter, setFilter] = useState<SongFilter>("all");
  const [mySongs, setMySongs] = useState<StoredSong[]>([]);
  const [storageOk, setStorageOk] = useState(true);
  const [editor, setEditor] = useState<{ mode: "new" | "edit"; id?: string; initial?: Partial<SongDraft> } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pptInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [bulk, setBulk] = useState<{ mode: "paste" | "review"; songs?: BulkSong[]; note?: string } | null>(null);
  const [readingFolder, setReadingFolder] = useState(false);

  // Always the latest list, so async saves diff against what is really on screen.
  const mySongsRef = useRef<StoredSong[]>([]);
  const setSongs = (next: StoredSong[]) => {
    mySongsRef.current = next;
    setMySongs(next);
  };

  useEffect(() => {
    let alive = true;
    loadSongsFromDb().then(({ songs, available, migrated }) => {
      if (!alive) return;
      setSongs(songs);
      setStorageOk(available);
      if (migrated > 0) setNotice({ text: `Nailipat ang ${migrated} kanta sa bagong database (PouchDB).`, tone: "ok" });
    });
    void autoStartCouchSync();
    // Changes pulled from CouchDB (or another tab) → refresh the list.
    const stop = watchSongs(() => {
      reloadSongs()
        .then((songs) => alive && setSongs(songs))
        .catch(() => undefined);
    });
    return () => {
      alive = false;
      stop();
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const persist = (next: StoredSong[]) => {
    const prev = mySongsRef.current;
    setSongs(next);
    saveSongsDiff(prev, next)
      .then((ok) => {
        setStorageOk(ok);
        if (!ok) setNotice({ text: "Hindi na-save ang ilang kanta sa database. I-Export para may backup, saka i-reload.", tone: "warn" });
      })
      .catch(() => {
        setStorageOk(false);
        setNotice({ text: "Hindi ma-save sa database (blocked o puno). Mawawala ito pag-reload; i-Export para may backup.", tone: "warn" });
      });
  };

  const handleSave = (draft: SongDraft) => {
    const now = new Date().toISOString();
    if (editor?.mode === "edit" && editor.id) {
      persist(mySongs.map((s) => (s.id === editor.id ? { ...s, ...draft, updatedAt: now } : s)));
      setNotice({ text: `Na-update ang "${draft.title}".`, tone: "ok" });
    } else {
      if (mySongs.length >= MY_SONGS_LIMITS.MAX_SONGS) {
        setNotice({ text: `Puno na ang My Songs (max ${MY_SONGS_LIMITS.MAX_SONGS}). Mag-delete muna.`, tone: "warn" });
        return;
      }
      persist([...mySongs, { id: newSongId(), ...draft, createdAt: now, updatedAt: now }]);
      setNotice({ text: `Naidagdag ang "${draft.title}" sa My Songs.`, tone: "ok" });
      setFilter((f) => (f === "reference" || f === "sample" ? "user" : f));
    }
    setEditor(null);
  };

  const handleDelete = (id: string) => {
    const song = mySongs.find((s) => s.id === id);
    persist(mySongs.filter((s) => s.id !== id));
    setConfirmDeleteId(null);
    if (song) setNotice({ text: `Na-delete ang "${song.title}".`, tone: "ok" });
  };

  const handleExport = () => {
    const blob = new Blob([exportMySongsJson(mySongs)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `worshiptech-my-songs-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice({ text: `Na-export ang ${mySongs.length} kanta.`, tone: "ok" });
  };

  // 2026-11-08: PowerPoint files (.pptx) → one song each (the slides' text), shown in the Bulk Add preview first.
  const isPptFile = (f: File) => /\.(pptx|ppt|pps)$/i.test(f.name);
  const readPptFiles = async (pptFiles: File[]) => {
    setReadingFolder(true);
    const songs: BulkSong[] = [];
    const warnings: string[] = [];
    try {
      for (const f of pptFiles) {
        const name = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
        const r = await parsePptxForBulk(f, name);
        songs.push(...r.songs);
        warnings.push(...r.warnings);
      }
    } finally {
      setReadingFolder(false);
    }
    return { songs, warnings };
  };
  const handlePptFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(isPptFile);
    e.target.value = "";
    if (files.length === 0) {
      setNotice({ text: "Piliin ang PowerPoint file (.pptx).", tone: "warn" });
      return;
    }
    const { songs, warnings } = await readPptFiles(files);
    const note = [`${files.length} PowerPoint ang nabasa — text ng bawat slide ang naging lyrics (title = pangalan ng file)`, ...warnings.slice(0, 3)].join(" · ");
    setBulk({ mode: "review", songs, note: note + "." });
  };

  // 2026-10-20: also accepts SongSelect (.txt / .usr / .bin) and ChordPro files, several at once.
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow choosing the same file again
    if (files.length === 0) return;
    // 2026-11-08: PowerPoint files go to the preview (below); the rest is imported as before.
    const pptFiles = files.filter(isPptFile);
    const songFiles = files.filter((f) => !f.name.toLowerCase().endsWith(".json") && !isPptFile(f));
    if (songFiles.length > 0) {
      const drafts: SongDraft[] = [];
      const errors: string[] = [];
      for (const f of songFiles) {
        if (f.size > MAX_SONG_FILE_BYTES) {
          errors.push(`${f.name}: masyadong malaki`);
          continue;
        }
        const { song, error } = parseSongFile(f.name, decodeTextFile(await f.arrayBuffer()));
        if (song) drafts.push(song);
        else if (error) errors.push(error);
      }
      const r = upsertSongs(mySongsRef.current, drafts);
      if (r.added || r.updated) {
        persist(r.songs);
        setFilter("user");
      }
      const skipped = r.skipped + errors.length;
      setNotice({
        text: `Import: ${r.added} bago, ${r.updated} na-update${skipped ? `, ${skipped} hindi nabasa` : ""}.${errors.length ? ` (${errors.slice(0, 3).join("; ")})` : ""}`,
        tone: skipped ? "warn" : "ok",
      });
      if (files.length === songFiles.length) return;
    }
    if (pptFiles.length > 0) {
      const { songs, warnings } = await readPptFiles(pptFiles);
      const note = [`${pptFiles.length} PowerPoint ang nabasa — text ng bawat slide ang naging lyrics`, ...warnings.slice(0, 3)].join(" · ");
      setBulk({ mode: "review", songs, note: note + "." });
      if (files.length === pptFiles.length + songFiles.length) return;
    }
    const file = files.find((f) => f.name.toLowerCase().endsWith(".json"));
    if (!file) return;
    if (file.size > MY_SONGS_LIMITS.MAX_IMPORT_BYTES) {
      setNotice({ text: "Masyadong malaki ang file (max 20 MB).", tone: "warn" });
      return;
    }
    const result = importMySongsJson(await file.text(), mySongsRef.current);
    if (result.error) {
      setNotice({ text: result.error, tone: "warn" });
      return;
    }
    persist(result.songs);
    setFilter("user");
    setNotice({
      text: `Import: ${result.added} bago, ${result.updated} na-update${result.skipped ? `, ${result.skipped} nilaktawan` : ""}.`,
      tone: result.skipped ? "warn" : "ok",
    });
  };

  // 2026-11-06 (b): the song's own background → resolved CSS (+ upload id) for the schedule item.
  const withBackground = async (song: SongItem): Promise<SongItem> => {
    if (!song.bgId) return song;
    const r = await resolveSongBackground(song.bgId);
    if (!r.css) {
      setNotice({ text: `Wala na sa browser na ito ang background ng "${song.title}" (na-delete o hindi pa nasi-sync) — default ang ginamit.`, tone: "warn" });
      return song;
    }
    return { ...song, defaultBackground: r.css, bgMediaId: r.mediaId };
  };

  // 2026-11-06: Bulk Add / Import folder → save only the songs checked in the preview.
  const handleBulkSave = (drafts: SongDraft[]) => {
    const r = upsertSongs(mySongsRef.current, drafts);
    if (r.added || r.updated) {
      persist(r.songs);
      setFilter("user");
    }
    setNotice({
      text: `Bulk Add: ${r.added} bago, ${r.updated} na-update${r.skipped ? `, ${r.skipped} hindi na-save` : ""}.`,
      tone: r.skipped ? "warn" : "ok",
    });
    setBulk(null);
  };

  // 2026-11-06: Import folder — reads every song file in the chosen folder (and subfolders).
  const MAX_FOLDER_FILES = 1000;
  const handleImportFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    const pathOf = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const isSongFile = (f: File) => SONG_FILE_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext)) || isPptFile(f);
    const songFiles = files
      .filter(isSongFile)
      .sort((a, b) => pathOf(a).localeCompare(pathOf(b), undefined, { numeric: true, sensitivity: "base" }));
    const otherCount = files.length - songFiles.length;
    if (songFiles.length === 0) {
      setNotice({ text: `Walang lyrics file sa folder (${files.length} file, hindi .txt / SongSelect / ChordPro / PowerPoint).`, tone: "warn" });
      return;
    }
    setReadingFolder(true);
    const songs: BulkSong[] = [];
    try {
      for (const f of songFiles.slice(0, MAX_FOLDER_FILES)) {
        const name = pathOf(f);
        if (isPptFile(f)) {
          const r = await parsePptxForBulk(f, name);
          songs.push(...r.songs);
          continue;
        }
        if (f.size > MAX_SONG_FILE_BYTES) {
          songs.push({ line: 1, draft: { title: f.name, author: "", key: "", ccli: "", copyright: "", lyrics: "" }, slideCount: 0, error: "Masyadong malaki ang file (max 512 KB).", source: name });
          continue;
        }
        songs.push(...parseSongFileForBulk(name, decodeTextFile(await f.arrayBuffer())));
      }
    } finally {
      setReadingFolder(false);
    }
    const notes: string[] = [`${songFiles.length} lyrics file ang nabasa`];
    if (otherCount) notes.push(`${otherCount} ibang file ang nilaktawan (hindi .txt / SongSelect / ChordPro / PowerPoint)`);
    if (songFiles.length > MAX_FOLDER_FILES) notes.push(`max ${MAX_FOLDER_FILES} file lang bawat import`);
    setBulk({ mode: "review", songs, note: notes.join(" · ") + "." });
  };

  const q = searchQuery.trim().toLowerCase();
  const matches = (s: { title: string; author?: string }) =>
    !q || s.title.toLowerCase().includes(q) || (s.author || "").toLowerCase().includes(q);

  const myItems = useMemo(() => mySongs.map(toSongItem), [mySongs]);
  const rows: SongItem[] = [
    ...(filter === "all" || filter === "user" ? myItems : []),
    ...(filter === "all" || filter === "sample" ? SAMPLE_SONGS : []),
    ...(filter === "all" || filter === "reference" ? REFERENCE_SONGS : []),
  ].filter(matches);

  return (
    <div className="space-y-2">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`tap-target px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              filter === f.id ? "bg-accent text-white border-accent" : "bg-surface-2 text-fg-muted border-line hover:bg-surface-3"
            }`}
          >
            {f.label}
            {f.id === "user" && mySongs.length > 0 ? ` (${mySongs.length})` : ""}
          </button>
        ))}
      </div>

      {/* My Songs toolbar */}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setEditor({ mode: "new" })} className={`${smallBtn} bg-accent hover:bg-accent-hover text-white border-accent`}>
          <FilePlus2 className="w-3.5 h-3.5" />
          New Song
        </button>
        <button onClick={() => fileInputRef.current?.click()} className={`${smallBtn} bg-surface-2 hover:bg-surface-3 text-fg border-line`} title="Import: My Songs backup (.json), SongSelect (.txt, .usr, .bin) o ChordPro (.cho, .pro) — puwedeng marami">
          <Upload className="w-3.5 h-3.5" />
          Import
        </button>
        <button onClick={() => setBulk({ mode: "paste" })} className={`${smallBtn} bg-surface-2 hover:bg-surface-3 text-fg border-line`} title="Bulk Add: mag-paste ng maraming kanta nang sabay (--- sa pagitan ng bawat kanta)">
          <ListPlus className="w-3.5 h-3.5" />
          Bulk Add
        </button>
        <button onClick={() => pptInputRef.current?.click()} disabled={readingFolder} className={`${smallBtn} bg-surface-2 hover:bg-surface-3 text-fg border-line disabled:opacity-40`} title="Import PowerPoint: lyrics na nasa .pptx — bawat slide ay slide ng kanta; may preview muna bago i-save">
          <Presentation className="w-3.5 h-3.5" />
          PPT
        </button>
        <button onClick={() => folderInputRef.current?.click()} disabled={readingFolder} className={`${smallBtn} bg-surface-2 hover:bg-surface-3 text-fg border-line disabled:opacity-40`} title="Import folder: lahat ng .txt / SongSelect / ChordPro sa isang folder (kasama ang subfolders); may preview muna">
          <FolderOpen className="w-3.5 h-3.5" />
          {readingFolder ? "Binabasa..." : "Folder"}
        </button>
        <button onClick={handleExport} disabled={mySongs.length === 0} className={`${smallBtn} bg-surface-2 hover:bg-surface-3 text-fg border-line disabled:opacity-40 disabled:cursor-not-allowed`} title="Export My Songs (.json backup)">
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
        <input ref={pptInputRef} type="file" multiple accept=".pptx,.ppt,.pps" className="hidden" onChange={handlePptFiles} data-testid="ppt-input" />
        <input ref={fileInputRef} type="file" multiple accept={[".json", ".pptx", ...SONG_FILE_EXTENSIONS].join(",")} className="hidden" onChange={handleImportFile} data-testid="import-input" />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          // webkitdirectory = pick a whole folder (Chrome/Edge/Firefox desktop); phones fall back to picking files.
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          className="hidden"
          onChange={handleImportFolder}
          data-testid="folder-input"
        />
      </div>

      <CouchSyncPanel />

      {!storageOk && (
        <p className="text-xs text-warn-text bg-warn-soft border border-warn/30 rounded-md px-2 py-1.5 flex gap-1.5">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Hindi makapag-save sa database ng browser na ito (private mode?). Mawawala ang My Songs pag-reload — i-Export para may backup.
        </p>
      )}
      {notice && (
        <p role="status" className={`text-xs rounded-md px-2 py-1.5 border ${notice.tone === "ok" ? "text-fg bg-ok-soft border-ok/30" : "text-warn-text bg-warn-soft border-warn/30"}`}>
          {notice.text}
        </p>
      )}

      {filter === "user" && mySongs.length === 0 && (
        <p className="text-xs text-fg-subtle bg-surface-2 border border-dashed border-line-strong rounded-lg p-3">
          Wala pang sariling kanta. I-click ang <strong>New Song</strong>, <strong>Bulk Add</strong> (maraming kanta sa isang paste), <strong>Folder</strong>, o <strong>Import</strong> ng backup file o ng mga file na na-download sa CCLI SongSelect (.txt, .usr, ChordPro). Puwede ring pumili sa <strong>Reference</strong> at i-click ang "Add lyrics".
        </p>
      )}
      {rows.length === 0 && !(filter === "user" && mySongs.length === 0) && (
        <p className="text-xs text-fg-subtle p-2">Walang tugma sa "{searchQuery}".</p>
      )}

      {/* Song rows */}
      {rows.map((song) => {
        const isUser = song.source === "user";
        const isRef = song.source === "reference";
        return (
          <div
            key={song.id}
            onDoubleClick={(e) => {
              // ignore double-clicks on the row's own buttons/links
              if (isRef || !onLiveSong || (e.target as HTMLElement).closest("button, a")) return;
              void withBackground(song).then(onLiveSong);
            }}
            title={isRef ? undefined : "Double-click = Add + LIVE"}
            className={`bg-surface-2 hover:bg-surface-3 border border-line rounded-lg p-2.5 lg:py-1.5 transition-all text-xs group shadow-xs ${isRef ? "" : "cursor-pointer select-none touch-manipulation"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-fg truncate flex items-center gap-1.5">
                  <span className="truncate">{song.title}</span>
                  {isUser && <span className="shrink-0 px-1.5 rounded bg-accent-soft text-accent-text border border-accent/30 text-xs font-medium">My Song</span>}
                  {isUser && song.bgId && <ImageIcon className="h-3.5 w-3.5 shrink-0 text-accent-text" aria-label="May sariling background" />}
                </div>
                <div className="text-xs text-fg-subtle flex items-center gap-2 mt-0.5 min-w-0">
                  {isRef ? (
                    // 2026-10-29: "Reference" badge moved here from the title line, so long titles aren't cut short
                    <>
                      <span className="shrink-0 px-1.5 rounded bg-surface-3 text-fg-muted border border-line text-xs font-medium">Reference</span>
                      <span className="shrink-0 whitespace-nowrap">Walang lyrics</span>
                    </>
                  ) : (
                    <>
                      <span className="shrink-0 whitespace-nowrap">Key: {song.key || "—"}</span>
                      <span>•</span>
                      <span className="shrink-0 whitespace-nowrap">{song.slides.length} Slides</span>
                    </>
                  )}
                  {song.author && (
                    <>
                      <span>•</span>
                      <span className="truncate">{song.author}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {isRef ? (
                  <>
                    <a
                      href={`${SONGSELECT_SEARCH_URL}${encodeURIComponent(song.title)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${smallBtn} bg-surface-2 hover:bg-surface-3 text-fg border-line`}
                      title="Hanapin sa CCLI SongSelect (kailangan ng account)"
                      aria-label={`Hanapin ang ${song.title} sa SongSelect`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {/* 2026-10-28: icon only, so the song title has room */}
                    </a>
                    <button
                      onClick={() => setEditor({ mode: "new", initial: { title: song.title, author: song.author } })}
                      className={`${smallBtn} bg-accent-soft hover:bg-accent/20 text-accent-text border-accent/30`}
                      title="Gumawa ng My Song at i-paste ang lyrics"
                      aria-label={`Add lyrics: ${song.title}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Lyrics
                    </button>
                  </>
                ) : (
                  <>
                    {isUser && confirmDeleteId !== song.id && (
                      <>
                        <button
                          onClick={() => {
                            const s = mySongs.find((m) => m.id === song.id);
                            if (s) setEditor({ mode: "edit", id: s.id, initial: s });
                          }}
                          className="icon-btn icon-btn-edit"
                          title="Edit"
                          aria-label={`Edit ${song.title}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(song.id)}
                          className="icon-btn icon-btn-danger"
                          title="Delete"
                          aria-label={`Delete ${song.title}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {isUser && confirmDeleteId === song.id ? (
                      <>
                        <button onClick={() => handleDelete(song.id)} className={`${smallBtn} bg-live hover:brightness-110 text-white border-live`}>
                          Delete
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)} className={`${smallBtn} bg-surface-2 hover:bg-surface-3 text-fg border-line`}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => void withBackground(song).then(onAddToSchedule)}
                        className={`${smallBtn} bg-accent-soft hover:bg-accent/20 text-accent-text border-accent/30`}
                        title="Add to Service Schedule"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {bulk && (
        <BulkAddModal
          mode={bulk.mode}
          initialSongs={bulk.songs}
          note={bulk.note}
          currentSongs={mySongs}
          onSave={handleBulkSave}
          onClose={() => setBulk(null)}
        />
      )}

      {editor && (
        <SongEditorModal mode={editor.mode} initial={editor.initial} onSave={handleSave} onClose={() => setEditor(null)} />
      )}
    </div>
  );
};
