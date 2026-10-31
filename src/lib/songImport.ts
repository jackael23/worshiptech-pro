/**
 * 2026-10-20 (Jarvis): reads song files the church downloaded from CCLI SongSelect (with their
 * own licence) — or any ChordPro file — and turns them into My Songs drafts.
 *  - SongSelect "Lyrics" text download (.txt)
 *  - SongSelect USR / .bin
 *  - ChordPro (.cho, .chordpro, .chopro, .pro) — chords are removed, only lyrics are kept
 * Pure functions (no DOM) so they can be tested on their own. Lyrics never leave the browser.
 */
import { SongDraft } from "./mySongsStore";
import { asSectionLabel } from "./lyricsParser";

export const SONG_FILE_EXTENSIONS = [".txt", ".usr", ".bin", ".cho", ".chordpro", ".chopro", ".pro", ".crd"];
export const MAX_SONG_FILE_BYTES = 512 * 1024;

/** Decodes a text file: UTF-8 (with/without BOM), UTF-16 LE/BE (BOM), else Windows-1252. */
export function decodeTextFile(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(b);
  }
}

const lines = (text: string) => text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");

/** "LeBlanc, Lenny | Baloche, Paul" → "Lenny LeBlanc, Paul Baloche" */
function cleanAuthors(raw: string): string {
  return raw
    .split(/\s*\|\s*|\s*\/\s*/)
    .map((a) => {
      const parts = a.split(",").map((p) => p.trim()).filter(Boolean);
      return parts.length === 2 ? `${parts[1]} ${parts[0]}` : a.trim();
    })
    .filter(Boolean)
    .join(", ");
}

/** Builds lyrics text that lyricsParser understands: "Label\nline\nline\n\nLabel\n..." */
function buildLyrics(sections: { label: string; text: string }[]): string {
  return sections
    .map((s) => {
      const body = s.text.replace(/\n{2,}/g, "\n").trim();
      if (!body) return "";
      const label = asSectionLabel(s.label) ? s.label.trim() : "";
      return label ? `${label}\n${body}` : body;
    })
    .filter(Boolean)
    .join("\n\n");
}

// ---------------------------------------------------------------- SongSelect TXT
const FOOTER_NOISE = /^(for use solely|all rights reserved|www\.ccli\.com|ccli licen[cs]e|note:|ccli-liedlizenznummer)/i;

export function parseSongSelectTxt(text: string): SongDraft | null {
  const L = lines(text);
  const titleIdx = L.findIndex((l) => l.trim());
  if (titleIdx < 0) return null;
  const title = L[titleIdx].trim();

  // Footer starts at the first "CCLI Song # …" line (not "CCLI License").
  let ccliIdx = -1;
  for (let i = titleIdx + 1; i < L.length; i++) {
    const t = L[i].trim();
    if (/^CCLI\b/i.test(t) && !/licen[cs]e/i.test(t)) {
      ccliIdx = i;
      break;
    }
  }
  let bodyEnd = ccliIdx < 0 ? L.length : ccliIdx;
  let author = "";
  let copyright = "";
  // 2023+ format: the authors line sits directly above the CCLI line (no blank line between).
  if (ccliIdx > 0 && L[ccliIdx - 1].trim() && !asSectionLabel(L[ccliIdx - 1])) {
    author = L[ccliIdx - 1].trim();
    bodyEnd = ccliIdx - 1;
  }
  const ccli = ccliIdx >= 0 ? (L[ccliIdx].match(/\d{3,}/) || [""])[0] : "";
  if (ccliIdx >= 0) {
    for (const raw of L.slice(ccliIdx + 1)) {
      const t = raw.trim();
      if (!t || FOOTER_NOISE.test(t)) continue;
      if (/^(©|\(c\)|copyright)/i.test(t)) copyright = copyright || t;
      else if (!author) author = t; // older format: authors after the copyright line
    }
  }

  // Body: section label lines + lyrics, sections separated by blank lines.
  const sections: { label: string; text: string }[] = [];
  let cur: { label: string; text: string } | null = null;
  for (const raw of L.slice(titleIdx + 1, bodyEnd)) {
    const t = raw.trim();
    if (!t) continue;
    if (asSectionLabel(t)) {
      cur = { label: t, text: "" };
      sections.push(cur);
    } else {
      if (!cur) {
        cur = { label: "", text: "" };
        sections.push(cur);
      }
      cur.text += (cur.text ? "\n" : "") + t;
    }
  }
  const lyrics = buildLyrics(sections);
  if (!lyrics) return null;
  return { title, author: cleanAuthors(author), key: "", ccli, copyright, lyrics };
}

// ---------------------------------------------------------------- SongSelect USR / BIN
export function parseSongSelectUsr(text: string): SongDraft | null {
  const f: Record<string, string> = {};
  let ccli = "";
  for (const raw of lines(text)) {
    const t = raw.trim();
    const sec = t.match(/^\[S\s+A?(\d+)\]/i);
    if (sec) ccli = sec[1];
    const kv = t.match(/^([A-Za-z]+)=(.*)$/);
    if (kv) f[kv[1].toLowerCase()] = kv[2];
  }
  if (!f.title || !f.words) return null;
  const fields = (f.fields || "").split("/t");
  const words = f.words.split("/t");
  const sections = words.map((w, i) => {
    let body = w.replace(/\/n/g, "\n").replace(/ \| /g, "\n");
    let label = (fields[i] || "").trim();
    // Some files put the real part name on the first lyric line, e.g. "(PRE-CHORUS)".
    const first = body.split("\n")[0].trim();
    const paren = first.match(/^\(([^)]+)\)$/);
    if (paren && asSectionLabel(paren[1])) {
      label = paren[1];
      body = body.split("\n").slice(1).join("\n");
    }
    return { label: asSectionLabel(label) ? label : `Misc ${i + 1}`, text: body };
  });
  const lyrics = buildLyrics(sections);
  if (!lyrics) return null;
  return {
    title: f.title.trim(),
    author: cleanAuthors(f.author || ""),
    key: (f.keys || "").split(/[\s/,|]+/)[0] || "",
    ccli,
    copyright: (f.copyright || "").split(/\s*\|\s*/).filter(Boolean).join(", "),
    lyrics,
  };
}

// ---------------------------------------------------------------- ChordPro
export function parseChordPro(text: string): SongDraft | null {
  const meta: Record<string, string> = {};
  const sections: { label: string; text: string }[] = [];
  let cur: { label: string; text: string } | null = null;
  let inTab = false;
  const start = (label: string) => {
    cur = { label, text: "" };
    sections.push(cur);
  };
  for (const raw of lines(text)) {
    const t = raw.trim();
    if (t.startsWith("#")) continue;
    const d = t.match(/^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i);
    if (d) {
      const name = d[1].toLowerCase();
      const val = (d[2] || "").trim();
      if (["t", "title"].includes(name)) meta.title = val;
      else if (["st", "subtitle", "artist", "author", "composer", "lyricist"].includes(name)) meta.author = meta.author || val;
      else if (name === "key") meta.key = val;
      else if (["ccli", "ccli_number", "ccli_song_number"].includes(name)) meta.ccli = (val.match(/\d+/) || [""])[0];
      else if (name === "copyright") meta.copyright = val;
      else if (["c", "comment", "ci", "comment_italic", "cb", "comment_box"].includes(name)) {
        if (asSectionLabel(val)) start(val);
      } else if (["soc", "start_of_chorus"].includes(name)) start(val || "Chorus");
      else if (["sov", "start_of_verse"].includes(name)) start(val || "Verse");
      else if (["sob", "start_of_bridge"].includes(name)) start(val || "Bridge");
      else if (["sot", "start_of_tab", "start_of_grid", "sog"].includes(name)) inTab = true;
      else if (["eot", "end_of_tab", "end_of_grid", "eog"].includes(name)) inTab = false;
      else if (/^(eoc|eov|eob|end_of_)/.test(name)) cur = null;
      continue;
    }
    if (inTab) continue;
    if (!t) {
      if (cur && (cur as { text: string }).text) cur = null; // blank line ends an unlabeled block
      continue;
    }
    if (asSectionLabel(t)) {
      start(t);
      continue;
    }
    const lyric = t.replace(/\[[^\]]*\]/g, "").replace(/\s{2,}/g, " ").trim();
    if (!lyric) continue; // chord-only line
    if (!cur) start("");
    cur!.text += (cur!.text ? "\n" : "") + lyric;
  }
  const lyrics = buildLyrics(sections);
  if (!meta.title || !lyrics) return null;
  return { title: meta.title, author: meta.author || "", key: meta.key || "", ccli: meta.ccli || "", copyright: meta.copyright || "", lyrics };
}

/** Picks the parser by file extension. */
export function parseSongFile(fileName: string, text: string): { song?: SongDraft; error?: string } {
  const ext = (fileName.match(/\.[^.]+$/) || [""])[0].toLowerCase();
  let song: SongDraft | null = null;
  if (ext === ".txt") song = parseSongSelectTxt(text);
  else if (ext === ".usr" || ext === ".bin") song = parseSongSelectUsr(text);
  else if ([".cho", ".chordpro", ".chopro", ".pro", ".crd"].includes(ext)) song = parseChordPro(text);
  else return { error: `${fileName}: hindi suportadong file type.` };
  return song ? { song } : { error: `${fileName}: walang mabasang title o lyrics.` };
}
