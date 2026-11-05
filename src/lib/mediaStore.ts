/**
 * 2026-10-29 (Jarvis): background images uploaded by the user (Media tab).
 * Big phone photos are resized to max 1920 px (JPEG) so the projector stays fast.
 *
 * 2026-11-05 (Mira): pictures AND videos, stored in PouchDB "wtp-media-pdb" and synced to the
 * user's own CouchDB "wtp_media" when logged in (see couchSync.ts) — Option A: the file itself
 * lives inside CouchDB as an attachment.
 *  - Doc = { type: "media", kind: "image" | "video", name, width, height, duration?, bytes, mime, createdAt }
 *    + attachments: "file" (the JPEG picture / the video as uploaded), "thumb" (360 px JPEG for the grid)
 *    and, for videos, "poster" (1280 px JPEG still: thumbnails, phone remote, fallback).
 *  - Binary attachments (not base64 inside the doc), so the doc body stays tiny.
 *  - Videos are NOT converted in the browser (too heavy): MP4 (H.264) or WebM, played muted + looped.
 *  - The old IndexedDB "wtp-media" (pictures only, 10-29) is copied over once and left as a backup.
 */
import { getLocalDb, removeDoc, upsertDoc, watchLocal } from "./couchSync";

export type MediaKind = "image" | "video";

/** One upload, as listed in the Media tab (no big file data in it). */
export interface MediaItem {
  id: string;
  kind: MediaKind;
  name: string;
  width: number;
  height: number;
  /** Seconds (videos only). */
  duration?: number;
  /** Size of the stored file. */
  bytes: number;
  createdAt: string;
  /** Small picture for the grid (object URL; null when it could not be read). */
  thumbUrl: string | null;
}

export const MEDIA_LIMITS = {
  MAX_IMAGES: 60,
  MAX_FILE_BYTES: 25 * 1024 * 1024,
  MAX_SIDE: 1920,
  THUMB_SIDE: 360,
  // 2026-11-05: videos (agreed with Jack: 200 MB each, 20 videos)
  MAX_VIDEOS: 20,
  MAX_VIDEO_BYTES: 200 * 1024 * 1024,
  POSTER_SIDE: 1280,
};
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const VIDEO_TYPES = ["video/mp4", "video/webm"];

const ID_RE = /^(img|vid)-[\w-]{1,70}$/;
const LEGACY_DB = "wtp-media";
const LEGACY_STORE = "images";
const MIGRATED_KEY = "wtp.media.migratedToPouch.v1";

export const isVideoId = (id: string | undefined | null): id is string => !!id && id.startsWith("vid-");
const newId = (kind: MediaKind) => `${kind === "video" ? "vid" : "img"}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

interface MediaDoc {
  _id: string;
  _rev?: string;
  type: "media";
  kind: MediaKind;
  name: string;
  width: number;
  height: number;
  duration?: number;
  bytes: number;
  mime: string;
  createdAt: string;
  _attachments?: Record<string, { content_type?: string; data?: unknown; length?: number }>;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

/** Checks a doc read from the database (it may have come from CouchDB). */
function cleanDoc(d: unknown): MediaDoc | null {
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  const id = str(o._id, 80);
  if (!id || !ID_RE.test(id) || o.type !== "media") return null;
  const kind: MediaKind | null = o.kind === "video" ? "video" : o.kind === "image" ? "image" : null;
  if (!kind || (kind === "video") !== isVideoId(id)) return null;
  const att = (o._attachments || {}) as MediaDoc["_attachments"];
  if (!att?.file) return null;
  return {
    _id: id,
    _rev: str(o._rev, 100),
    type: "media",
    kind,
    name: str(o.name, 120) || (kind === "video" ? "Video" : "Larawan"),
    width: num(o.width),
    height: num(o.height),
    duration: kind === "video" ? num(o.duration) : undefined,
    bytes: num(o.bytes) || num(att.file.length),
    mime: str(o.mime, 60) || "",
    createdAt: str(o.createdAt, 40) || new Date(0).toISOString(),
    _attachments: att,
  };
}

// ---------------------------------------------------------------- object URLs (thumbs + videos)

/** id → { rev, url } so the same file is not read again and old URLs are freed. */
const thumbUrls = new Map<string, { rev: string; url: string }>();
const videoUrls = new Map<string, { rev: string; url: Promise<string | null> }>();

function dropUrls(id: string) {
  const t = thumbUrls.get(id);
  if (t) URL.revokeObjectURL(t.url);
  thumbUrls.delete(id);
  const v = videoUrls.get(id);
  if (v) v.url.then((u) => u && URL.revokeObjectURL(u));
  videoUrls.delete(id);
}

async function getBlob(id: string, name: string): Promise<Blob | null> {
  try {
    const b = (await getLocalDb("media").getAttachment(id, name)) as unknown;
    return b instanceof Blob ? b : null;
  } catch {
    return null; // not here (yet) — e.g. still syncing from CouchDB
  }
}

async function thumbFor(d: MediaDoc): Promise<string | null> {
  const rev = d._rev || "";
  const have = thumbUrls.get(d._id);
  if (have && have.rev === rev) return have.url;
  const blob = (await getBlob(d._id, "thumb")) || (d.kind === "image" ? await getBlob(d._id, "file") : null);
  if (!blob) return null;
  if (have) URL.revokeObjectURL(have.url);
  const url = URL.createObjectURL(blob);
  thumbUrls.set(d._id, { rev, url });
  return url;
}

/**
 * Object URL of a video background (null = not in this browser's database, e.g. not synced yet).
 * Same URL for the Preview, Live and projector screens of this window.
 */
export async function getVideoUrl(id: string): Promise<string | null> {
  if (!isVideoId(id)) return null;
  let rev = "";
  try {
    rev = (await getLocalDb("media").get(id))._rev;
  } catch {
    return null;
  }
  const have = videoUrls.get(id);
  if (have && have.rev === rev) return have.url;
  if (have) have.url.then((u) => u && URL.revokeObjectURL(u));
  const url = getBlob(id, "file").then((b) => (b && /^video\//.test(b.type || "video/") ? URL.createObjectURL(b) : null));
  videoUrls.set(id, { rev, url });
  const got = await url;
  if (!got) videoUrls.delete(id); // try again next time (it may arrive by sync)
  return got;
}

// ---------------------------------------------------------------- migration of the 10-29 pictures

interface LegacyImage {
  id: string;
  name: string;
  dataUrl: string;
  thumb: string;
  width: number;
  height: number;
  createdAt: string;
}

function readLegacy(): Promise<LegacyImage[]> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve([]);
    const req = indexedDB.open(LEGACY_DB);
    req.onupgradeneeded = () => req.transaction?.abort(); // didn't exist: don't create it
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LEGACY_STORE)) {
        db.close();
        return resolve([]);
      }
      const all = db.transaction(LEGACY_STORE, "readonly").objectStore(LEGACY_STORE).getAll();
      all.onsuccess = () => {
        db.close();
        resolve((all.result as LegacyImage[]) || []);
      };
      all.onerror = () => {
        db.close();
        resolve([]);
      };
    };
  });
}

const dataUrlToBlob = async (u: string) => (await fetch(u)).blob();
const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

let migration: Promise<void> | null = null;
function migrateOnce(): Promise<void> {
  migration ??= (async () => {
    try {
      if (window.localStorage.getItem(MIGRATED_KEY)) return;
    } catch {
      return;
    }
    const old = (await readLegacy()).filter((x) => x && typeof x.id === "string" && /^img-[\w-]{1,70}$/.test(x.id) && /^data:image\//.test(x.dataUrl || ""));
    if (old.length > 0) {
      const have = await getLocalDb("media").allDocs({ keys: old.map((x) => x.id) });
      for (let i = 0; i < old.length; i++) {
        const row = have.rows[i] as { error?: string; value?: { deleted?: boolean } };
        if (!(row.error === "not_found" || row.value?.deleted)) continue;
        const x = old[i];
        try {
          const file = await dataUrlToBlob(x.dataUrl);
          const thumb = /^data:image\//.test(x.thumb || "") ? await dataUrlToBlob(x.thumb) : file;
          await putMedia(
            { _id: x.id, type: "media", kind: "image", name: String(x.name || "Larawan").slice(0, 120), width: num(x.width), height: num(x.height), bytes: file.size, mime: file.type || "image/jpeg", createdAt: x.createdAt || new Date().toISOString() },
            { file, thumb },
          );
        } catch {
          /* skip a broken one */
        }
      }
    }
    try {
      window.localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
  })();
  return migration;
}

async function putMedia(meta: Omit<MediaDoc, "_attachments" | "_rev">, files: { file: Blob; thumb: Blob; poster?: Blob }): Promise<void> {
  const att: NonNullable<MediaDoc["_attachments"]> = {
    file: { content_type: files.file.type || meta.mime, data: files.file },
    thumb: { content_type: "image/jpeg", data: files.thumb },
  };
  if (files.poster) att.poster = { content_type: "image/jpeg", data: files.poster };
  await upsertDoc("media", { ...meta, _attachments: att });
}

// ---------------------------------------------------------------- list / save / delete

/** All uploads, newest first. `persistent` is false when the browser database cannot be used. */
export async function listMedia(): Promise<{ items: MediaItem[]; persistent: boolean }> {
  try {
    await migrateOnce();
    const res = await getLocalDb("media").allDocs({ include_docs: true });
    const docs = res.rows.map((r) => cleanDoc(r.doc)).filter((d): d is MediaDoc => !!d);
    const alive = new Set(docs.map((d) => d._id));
    for (const id of [...thumbUrls.keys()]) if (!alive.has(id)) dropUrls(id);
    const items: MediaItem[] = [];
    for (const d of docs) {
      items.push({ id: d._id, kind: d.kind, name: d.name, width: d.width, height: d.height, duration: d.duration, bytes: d.bytes, createdAt: d.createdAt, thumbUrl: await thumbFor(d) });
    }
    items.sort((x, y) => y.createdAt.localeCompare(x.createdAt));
    return { items, persistent: true };
  } catch {
    return { items: [], persistent: false };
  }
}

export async function deleteMedia(id: string): Promise<void> {
  dropUrls(id);
  await removeDoc("media", id);
}

/** Calls `onChange` when uploads change (own saves, or pulled from CouchDB). */
export const watchMedia = (onChange: () => void) => watchLocal("media", onChange);

/** Asks the browser not to clear our storage by itself (videos are big). Best effort. */
function askPersistentStorage() {
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- reading files

function loadImage(file: Blob, name: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Hindi mabasa ang "${name}" bilang larawan.`));
    };
    img.src = url;
  });
}

function toJpeg(src: CanvasImageSource, sw: number, sh: number, maxSide: number, quality: number): Promise<{ blob: Blob; w: number; h: number }> {
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Hindi ma-proseso ang larawan (canvas).");
  ctx.fillStyle = "#000"; // transparent PNG → black, like a projector
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve({ blob: b, w, h }) : reject(new Error("Hindi ma-proseso ang larawan."))), "image/jpeg", quality));
}

const baseName = (file: File, fallback: string) => file.name.replace(/\.[^.]+$/, "").slice(0, 80) || fallback;

/** Reads + resizes one picture and saves it. Throws a friendly (Tagalog) error. */
export async function addImageFile(file: File): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error(`"${file.name}": JPG, PNG o WebP lang ang puwede.`);
  if (file.size > MEDIA_LIMITS.MAX_FILE_BYTES) throw new Error(`"${file.name}": sobrang laki (max 25 MB).`);
  const img = await loadImage(file, file.name);
  try {
    const full = await toJpeg(img, img.naturalWidth, img.naturalHeight, MEDIA_LIMITS.MAX_SIDE, 0.86);
    const thumb = await toJpeg(img, img.naturalWidth, img.naturalHeight, MEDIA_LIMITS.THUMB_SIDE, 0.75);
    const id = newId("image");
    await putMedia(
      { _id: id, type: "media", kind: "image", name: baseName(file, "Larawan"), width: full.w, height: full.h, bytes: full.blob.size, mime: "image/jpeg", createdAt: new Date().toISOString() },
      { file: full.blob, thumb: thumb.blob },
    );
    askPersistentStorage();
    return id;
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

function once(el: HTMLMediaElement, ok: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (fn: () => void) => {
      clearTimeout(t);
      el.removeEventListener(ok, onOk);
      el.removeEventListener("error", onErr);
      fn();
    };
    const onOk = () => done(resolve);
    const onErr = () => done(() => reject(new Error("error")));
    const t = setTimeout(() => done(() => reject(new Error("timeout"))), ms);
    el.addEventListener(ok, onOk);
    el.addEventListener("error", onErr);
  });
}

/** Saves one video as uploaded (no converting) + a poster still. Throws a friendly (Tagalog) error. */
export async function addVideoFile(file: File): Promise<string> {
  const type = file.type || (/\.mp4$/i.test(file.name) ? "video/mp4" : /\.webm$/i.test(file.name) ? "video/webm" : "");
  if (!VIDEO_TYPES.includes(type)) throw new Error(`"${file.name}": MP4 o WebM lang ang puwedeng video.`);
  if (file.size > MEDIA_LIMITS.MAX_VIDEO_BYTES) throw new Error(`"${file.name}": sobrang laki (max 200 MB bawat video).`);
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  try {
    v.src = url;
    try {
      await once(v, "loadeddata", 20_000);
    } catch {
      throw new Error(`"${file.name}": hindi ma-play ng browser ang video na ito. Gamitin ang MP4 (H.264) o WebM.`);
    }
    if (!v.videoWidth || !v.videoHeight) throw new Error(`"${file.name}": walang larawan ang video (audio lang?).`);
    const duration = Number.isFinite(v.duration) ? v.duration : 0;
    const at = Math.min(1, duration / 3);
    if (at > 0.05) {
      v.currentTime = at;
      await once(v, "seeked", 10_000).catch(() => undefined); // keep the first frame if seeking is slow
    }
    const poster = await toJpeg(v, v.videoWidth, v.videoHeight, MEDIA_LIMITS.POSTER_SIDE, 0.82);
    const thumb = await toJpeg(v, v.videoWidth, v.videoHeight, MEDIA_LIMITS.THUMB_SIDE, 0.75);
    const id = newId("video");
    const blob = file.type === type ? file : new Blob([file], { type });
    await putMedia(
      { _id: id, type: "media", kind: "video", name: baseName(file, "Video"), width: v.videoWidth, height: v.videoHeight, duration, bytes: file.size, mime: type, createdAt: new Date().toISOString() },
      { file: blob, thumb: thumb.blob, poster: poster.blob },
    );
    askPersistentStorage();
    return id;
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}

/**
 * CSS background to put on a schedule item: the picture itself, or a video's poster
 * (the video plays on top of it — see SlideScreen). Null = not in this browser yet.
 */
export async function backgroundCss(id: string): Promise<string | null> {
  const blob = await getBlob(id, isVideoId(id) ? "poster" : "file");
  if (!blob) return null;
  return `url("${await blobToDataUrl(blob)}") center/cover no-repeat`;
}
