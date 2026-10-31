/**
 * 2026-10-29 (Jarvis): background images uploaded by the user (Media tab).
 * Saved in IndexedDB (like presentations) — never sent to the server.
 * Big phone photos are resized to max 1920 px (JPEG) so the projector stays fast.
 */

export interface StoredImage {
  id: string;
  name: string;
  /** Resized picture (data: URL, JPEG, max 1920 px wide). */
  dataUrl: string;
  /** Small copy for the grid (max 360 px). */
  thumb: string;
  width: number;
  height: number;
  createdAt: string;
}

export const MEDIA_LIMITS = {
  MAX_IMAGES: 60,
  MAX_FILE_BYTES: 25 * 1024 * 1024,
  MAX_SIDE: 1920,
  THUMB_SIDE: 360,
};
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const DB_NAME = "wtp-media";
const DB_VERSION = 1;
const STORE = "images";
const memory = new Map<string, StoredImage>(); // fallback when IndexedDB is unavailable (private mode)

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        t.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        t.onerror = t.onabort = () => {
          db.close();
          reject(t.error);
        };
      }),
  );
}

const newImageId = () => `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** All images, newest first. `persistent` is false when only the in-memory fallback works. */
export async function listImages(): Promise<{ images: StoredImage[]; persistent: boolean }> {
  const sort = (a: StoredImage[]) => a.sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  try {
    const rows = (await tx<StoredImage[]>("readonly", (s) => s.getAll())) || [];
    for (const r of memory.values()) if (!rows.some((x) => x.id === r.id)) rows.push(r);
    return { images: sort(rows), persistent: true };
  } catch {
    return { images: sort([...memory.values()]), persistent: false };
  }
}

/** Returns false when it could only be kept in memory (lost on reload, e.g. storage full). */
export async function saveImage(img: StoredImage): Promise<boolean> {
  try {
    await tx("readwrite", (s) => s.put(img));
    memory.delete(img.id);
    return true;
  } catch {
    memory.set(img.id, img);
    return false;
  }
}

export async function deleteImage(id: string): Promise<void> {
  memory.delete(id);
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    /* in-memory only */
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Hindi mabasa ang "${file.name}" bilang larawan.`));
    };
    img.src = url;
  });
}

function draw(img: HTMLImageElement, maxSide: number, quality: number): { url: string; w: number; h: number } {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Hindi ma-proseso ang larawan (canvas).");
  ctx.fillStyle = "#000"; // transparent PNG → black, like a projector
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return { url: c.toDataURL("image/jpeg", quality), w, h };
}

/** Reads + resizes one picture. Throws a friendly (Tagalog) error. */
export async function readImageFile(file: File): Promise<StoredImage> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error(`"${file.name}": JPG, PNG o WebP lang ang puwede.`);
  if (file.size > MEDIA_LIMITS.MAX_FILE_BYTES) throw new Error(`"${file.name}": sobrang laki (max 25 MB).`);
  const img = await loadImage(file);
  try {
    const full = draw(img, MEDIA_LIMITS.MAX_SIDE, 0.86);
    const thumb = draw(img, MEDIA_LIMITS.THUMB_SIDE, 0.75);
    return {
      id: newImageId(),
      name: file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Larawan",
      dataUrl: full.url,
      thumb: thumb.url,
      width: full.w,
      height: full.h,
      createdAt: new Date().toISOString(),
    };
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

/** CSS background for a stored image (fit/dim/blur are applied separately, see SlideScreen). */
export const imageBackground = (img: Pick<StoredImage, "dataUrl">) => `url("${img.dataUrl}") center/cover no-repeat`;
