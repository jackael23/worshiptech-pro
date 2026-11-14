/**
 * 2026-11-14: store each picture (data: URL) ONCE per saved document.
 *
 * A PowerPoint background picture sits on every slide (`background: url("data:image/jpeg;base64,…")`),
 * so saving the slides as JSON wrote the same picture again for every slide: a 1.8 MB .pptx with
 * 31 slides became 72 MB in the browser database (and in CouchDB). Now:
 *   pack()   — walks the value, swaps every data: URL for a short token "wtp-asset:a0", and returns the
 *              pictures once each, ready to be saved as PouchDB attachments (binary, no base64 overhead);
 *   unpack() — puts the pictures back (as data: URLs again) after reading.
 * Values with no tokens (documents saved before this change) come back unchanged.
 * Pure apart from Blob / FileReader (browser).
 */

export const ASSET_PREFIX = "asset-";
const TOKEN = "wtp-asset:";
const DATA_URL_RE = /data:([a-z]+\/[a-z0-9.+-]+);base64,[A-Za-z0-9+/=]+/gi;
const TOKEN_RE = /wtp-asset:(a\d{1,5})/g;

export interface PackedAsset {
  /** Attachment name, e.g. "asset-a0". */
  name: string;
  contentType: string;
  data: Blob;
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

function blobToDataUrl(blob: Blob, type: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      // FileReader writes the blob's own type; make sure it is the one that was saved.
      resolve(s.replace(/^data:[^;,]*/, `data:${type}`));
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Deep copy of `value` with every data: URL replaced by a token, plus each picture once. */
export function packAssets<T>(value: T): { packed: T; assets: PackedAsset[] } {
  const ids = new Map<string, string>(); // data URL → token id
  const assets: PackedAsset[] = [];
  const done = new Map<string, string>(); // whole string → packed string (the same background repeats)

  const packString = (s: string): string => {
    if (s.length < 64 || !s.includes("data:")) return s;
    const hit = done.get(s);
    if (hit !== undefined) return hit;
    const out = s.replace(DATA_URL_RE, (url, type: string) => {
      let id = ids.get(url);
      if (!id) {
        id = `a${ids.size}`;
        ids.set(url, id);
        const b64 = url.slice(url.indexOf(",") + 1);
        assets.push({ name: ASSET_PREFIX + id, contentType: type.toLowerCase(), data: base64ToBlob(b64, type.toLowerCase()) });
      }
      return TOKEN + id;
    });
    done.set(s, out);
    return out;
  };

  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return packString(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) o[k] = walk(x);
      return o;
    }
    return v;
  };
  return { packed: walk(value) as T, assets };
}

/** PouchDB `_attachments` entries for the packed pictures. */
export function assetAttachments(assets: PackedAsset[]): Record<string, { content_type: string; data: Blob }> {
  const out: Record<string, { content_type: string; data: Blob }> = {};
  for (const a of assets) out[a.name] = { content_type: a.contentType, data: a.data };
  return out;
}

/**
 * Puts the pictures back. `attachments` = the document's `_attachments` read with
 * { attachments: true, binary: true } (data is a Blob). Unknown tokens are left as they are.
 */
export async function unpackAssets<T>(value: T, attachments: Record<string, { content_type?: string; data?: unknown }> | undefined): Promise<T> {
  const urls = new Map<string, string>();
  for (const [name, att] of Object.entries(attachments || {})) {
    if (!name.startsWith(ASSET_PREFIX) || !(att.data instanceof Blob)) continue;
    const type = att.content_type || att.data.type || "application/octet-stream";
    urls.set(name.slice(ASSET_PREFIX.length), await blobToDataUrl(att.data, type));
  }
  if (urls.size === 0) return value;
  const done = new Map<string, string>();
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      if (!v.includes(TOKEN)) return v;
      let out = done.get(v);
      if (out === undefined) {
        out = v.replace(TOKEN_RE, (tok, id: string) => urls.get(id) ?? tok);
        done.set(v, out);
      }
      return out;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) o[k] = walk(x);
      return o;
    }
    return v;
  };
  return walk(value) as T;
}
