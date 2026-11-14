/**
 * 2026-11-14: smaller pictures for imported slides (browser only: canvas).
 *  - shrinkImage(): a picture bigger than the projector (1920×1080) is scaled down; a big file
 *    (> 1.5 MB) at projector size is re-saved as JPEG. Pictures with transparent parts stay PNG.
 *    The original is kept when it is already small, can't be decoded (e.g. .emf), is a GIF
 *    (could be animated), or when re-saving would not make it smaller.
 *  - makeThumb(): tiny JPEG (192×108) of a slide picture for the Presentations list.
 */

export const MAX_W = 1920;
export const MAX_H = 1080;
const BIG_BYTES = 1.5 * 1024 * 1024;
const SHRINKABLE = ["image/png", "image/jpeg", "image/webp", "image/bmp"];

function canvasOf(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

const toBlob = (c: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => c.toBlob(resolve, type, quality));

function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const d = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < d.length; i += 4 * 7) if (d[i] < 250) return true; // every 7th pixel is enough
  return false;
}

/** Returns a smaller version of the picture, or the original. Never throws. */
export async function shrinkImage(blob: Blob, type: string): Promise<{ blob: Blob; type: string }> {
  const t = type.toLowerCase();
  if (!SHRINKABLE.includes(t) || typeof createImageBitmap !== "function" || typeof document === "undefined") return { blob, type: t };
  try {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_W / bmp.width, MAX_H / bmp.height);
    if (scale >= 1 && blob.size <= BIG_BYTES && t !== "image/bmp") {
      bmp.close();
      return { blob, type: t };
    }
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const c = canvasOf(w, h);
    const ctx = c.getContext("2d");
    if (!ctx) return { blob, type: t };
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const outType = t !== "image/jpeg" && hasTransparency(ctx, w, h) ? "image/png" : "image/jpeg";
    const out = await toBlob(c, outType, outType === "image/jpeg" ? 0.88 : undefined);
    if (!out || (out.size >= blob.size && scale >= 1)) return { blob, type: t };
    return { blob: out, type: outType };
  } catch {
    return { blob, type: t };
  }
}

const loadImg = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });

/** Small JPEG data URL of a picture (cover-cropped to 16:9), or undefined. */
export async function makeThumb(dataUrl: string, contain = false): Promise<string | undefined> {
  if (typeof document === "undefined") return undefined;
  try {
    const img = await loadImg(dataUrl);
    const W = 192;
    const H = 108;
    const c = canvasOf(W, H);
    const ctx = c.getContext("2d");
    if (!ctx || !img.naturalWidth) return undefined;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const s = (contain ? Math.min : Math.max)(W / img.naturalWidth, H / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    return c.toDataURL("image/jpeg", 0.7);
  } catch {
    return undefined;
  }
}
