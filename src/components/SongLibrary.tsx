/**
 * 2026-10-20 (Jarvis): Songs tab of the simulator's Media Library.
 *  - Samples: built-in public-domain hymns.
 *  - My Songs: added by the user (browser only), with edit / delete / export / import.
 *  - Reference: popular modern songs, title + artist only (no lyrics). "Add lyrics" turns
 *    one into a My Song that the user fills in themselves.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Download, Upload, ExternalLink, FilePlus2, AlertTriangle } from "lucide-react";
import { SongItem } from "../types";
import { SAMPLE_SONGS, REFERENCE_SONGS, SONGSELECT_SEARCH_URL } from "../data/easyworshipData";
import {
  StoredSong,
  SongDraft,
  MY_SONGS_LIMITS,
  loadMySongs,
  saveMySongs,
  toSongItem,
  newSongId,
  exportMySongsJson,
  importMySongsJson,
  upsertSongs,
} from "../lib/mySongsStore";
import { decodeTextFile, parseSongFile, SONG_FILE_EXTENSIONS, MAX_SONG_FILE_BYTES } from "../lib/songImport";
import { SongEditorModal } from "./SongEditorModal";

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

  useEffect(() => {
    const { songs, available } = loadMySongs();
    setMySongs(songs);
    setStorageOk(available);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const persist = (next: StoredSong[]) => {
    setMySongs(next);
    const ok = saveMySongs(next);
    setStorageOk(ok);
    if (!ok) setNotice({ text: "Hindi na-save sa browser (blocked o puno). Mawawala ito pag-reload; i-Export para may backup.", tone: "warn" });
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

  // 2026-10-20: also accepts SongSelect (.txt / .usr / .bin) and ChordPro files, several at once.
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow choosing the same file again
    if (files.length === 0) return;
    const songFiles = files.filter((f) => !f.name.toLowerCase().endsWith(".json"));
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
      const r = upsertSongs(mySongs, drafts);
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
    const file = files.find((f) => f.name.toLowerCase().endsWith(".json"));
    if (!file) return;
    if (file.size > MY_SONGS_LIMITS.MAX_IMPORT_BYTES) {
      setNotice({ text: "Masyadong malaki ang file (max 2 MB).", tone: "warn" });
      return;
    }
    const result = importMySongsJson(await file.text(), mySongs);
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
        <button onClick={handleExport} disabled={mySongs.length === 0} className={`${smallBtn} bg-surface-2 hover:bg-surface-3 text-fg border-line disabled:opacity-40 disabled:cursor-not-allowed`} title="Export My Songs (.json backup)">
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
        <input ref={fileInputRef} type="file" multiple accept={[".json", ...SONG_FILE_EXTENSIONS].join(",")} className="hidden" onChange={handleImportFile} data-testid="import-input" />
      </div>

      {!storageOk && (
        <p className="text-xs text-warn-text bg-warn-soft border border-warn/30 rounded-md px-2 py-1.5 flex gap-1.5">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Hindi makapag-save sa browser na ito (private mode?). Mawawala ang My Songs pag-reload — i-Export para may backup.
        </p>
      )}
      {notice && (
        <p role="status" className={`text-xs rounded-md px-2 py-1.5 border ${notice.tone === "ok" ? "text-fg bg-ok-soft border-ok/30" : "text-warn-text bg-warn-soft border-warn/30"}`}>
          {notice.text}
        </p>
      )}

      {filter === "user" && mySongs.length === 0 && (
        <p className="text-xs text-fg-subtle bg-surface-2 border border-dashed border-line-strong rounded-lg p-3">
          Wala pang sariling kanta. I-click ang <strong>New Song</strong>, o <strong>Import</strong> ng backup file o ng mga file na na-download sa CCLI SongSelect (.txt, .usr, ChordPro). Puwede ring pumili sa <strong>Reference</strong> at i-click ang "Add lyrics".
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
              onLiveSong(song);
            }}
            title={isRef ? undefined : "Double-click = Add + LIVE"}
            className={`bg-surface-2 hover:bg-surface-3 border border-line rounded-lg p-2.5 lg:py-1.5 transition-all text-xs group shadow-xs ${isRef ? "" : "cursor-pointer select-none touch-manipulation"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-fg truncate flex items-center gap-1.5">
                  <span className="truncate">{song.title}</span>
                  {isUser && <span className="shrink-0 px-1.5 rounded bg-accent-soft text-accent-text border border-accent/30 text-xs font-medium">My Song</span>}
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
                          className="p-2.5 lg:p-1 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-3"
                          title="Edit"
                          aria-label={`Edit ${song.title}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(song.id)}
                          className="p-2.5 lg:p-1 rounded-md text-fg-subtle hover:text-live-text hover:bg-live-soft"
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
                        onClick={() => onAddToSchedule(song)}
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

      {editor && (
        <SongEditorModal mode={editor.mode} initial={editor.initial} onSave={handleSave} onClose={() => setEditor(null)} />
      )}
    </div>
  );
};
