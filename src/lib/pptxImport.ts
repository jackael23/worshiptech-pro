/**
 * 2026-10-28 (Jarvis): PowerPoint import for the simulator's Presentations tab.
 *
 *  A. readPptx(): opens a .pptx (a zip of XML files) in the browser and returns, per slide,
 *     the text (+ speaker notes) and the slide background (solid color, gradient or picture,
 *     followed through slide → layout → master like PowerPoint does). Text position, fonts,
 *     shapes, SmartArt, charts and animations are NOT kept — the text is shown centered.
 *  B. readImageSlides(): slides exported from PowerPoint as pictures (File → Save As → PNG).
 *     One picture = one slide, so it looks exactly like the original.
 *
 * Everything stays in the browser; nothing is sent to the server. Old .ppt files are not supported.
 */
import JSZip from "jszip";
import type { SlideContent } from "../types";

export const PPT_LIMITS = {
  MAX_PPTX_BYTES: 150 * 1024 * 1024,
  MAX_IMAGE_BYTES: 15 * 1024 * 1024,
  MAX_SLIDES: 300,
  MAX_TEXT_CHARS: 4000,
  MAX_NOTES_CHARS: 4000,
};

export const IMAGE_SLIDE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export interface ImportedDeck {
  name: string;
  kind: "pptx" | "images";
  slides: SlideContent[];
  /** Short notes for the user (hidden slides skipped, pictures not kept, ...). */
  warnings: string[];
}

// ---------- small XML helpers (namespace-agnostic: match on localName) ----------

const kids = (el: Element | null | undefined, name?: string): Element[] =>
  el ? Array.from(el.children).filter((c) => !name || c.localName === name) : [];
const kid = (el: Element | null | undefined, name: string): Element | null => kids(el, name)[0] || null;
const path = (el: Element | null | undefined, ...names: string[]): Element | null => {
  let cur: Element | null | undefined = el;
  for (const n of names) cur = kid(cur, n);
  return cur || null;
};
const descendants = (el: Element | null | undefined, name: string): Element[] =>
  el ? Array.from(el.getElementsByTagName("*")).filter((c) => c.localName === name) : [];
/** Reads a relationship attribute (r:id / r:embed) whatever its prefix. Not the plain `id` (sldId has both). */
const relAttr = (el: Element | null | undefined, name: string): string | null => {
  if (!el) return null;
  for (const a of Array.from(el.attributes)) if (a.localName === name && (a.namespaceURI || "").endsWith("/relationships")) return a.value;
  return null;
};

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("bad xml");
  return doc;
}

// ---------- zip helpers ----------

type Rels = Map<string, { type: string; target: string }>;

function dirOf(p: string) {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}

/** Resolves "../media/image1.png" against the folder of the part that points to it. */
function resolvePart(fromPart: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = (dirOf(fromPart) ? dirOf(fromPart).split("/") : []).concat(target.split("/"));
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p && p !== ".") out.push(p);
  }
  return out.join("/");
}

async function readText(zip: JSZip, part: string): Promise<string | null> {
  const f = zip.file(part);
  return f ? f.async("string") : null;
}

async function readXml(zip: JSZip, part: string): Promise<Document | null> {
  const t = await readText(zip, part);
  if (t == null) return null;
  try {
    return parseXml(t);
  } catch {
    return null;
  }
}

async function readRels(zip: JSZip, part: string): Promise<Rels> {
  const relsPart = `${dirOf(part) ? dirOf(part) + "/" : ""}_rels/${part.split("/").pop()}.rels`;
  const doc = await readXml(zip, relsPart);
  const rels: Rels = new Map();
  if (!doc) return rels;
  for (const r of descendants(doc.documentElement, "Relationship")) {
    const id = r.getAttribute("Id");
    const target = r.getAttribute("Target");
    if (!id || !target || r.getAttribute("TargetMode") === "External") continue;
    rels.set(id, { type: r.getAttribute("Type") || "", target: resolvePart(part, target) });
  }
  return rels;
}

const relOfType = (rels: Rels, suffix: string) => [...rels.values()].find((r) => r.type.endsWith("/" + suffix))?.target || null;

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

async function mediaDataUrl(zip: JSZip, part: string, cache: Map<string, string | null>): Promise<string | null> {
  if (cache.has(part)) return cache.get(part)!;
  const mime = MIME[(part.split(".").pop() || "").toLowerCase()];
  const f = zip.file(part);
  let url: string | null = null;
  if (mime && f) url = `data:${mime};base64,${await f.async("base64")}`; // .emf/.wmf/.tiff can't be shown in a browser
  cache.set(part, url);
  return url;
}

// ---------- colors ----------

type Theme = Map<string, string>; // dk1, lt1, accent1, ... → "RRGGBB"
type ClrMap = Map<string, string>; // bg1 → lt1, tx1 → dk1, ...

const DEFAULT_CLRMAP: [string, string][] = [
  ["bg1", "lt1"],
  ["tx1", "dk1"],
  ["bg2", "lt2"],
  ["tx2", "dk2"],
];

function readTheme(doc: Document | null): Theme {
  const theme: Theme = new Map();
  const scheme = doc ? descendants(doc.documentElement, "clrScheme")[0] : null;
  for (const c of kids(scheme)) {
    const srgb = kid(c, "srgbClr");
    const sys = kid(c, "sysClr");
    const val = srgb?.getAttribute("val") || sys?.getAttribute("lastClr");
    if (val) theme.set(c.localName, val.toUpperCase());
  }
  return theme;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

interface Rgba {
  rgb: [number, number, number];
  a: number;
}

/** Reads one color element (srgbClr, schemeClr, sysClr, prstClr) with the common modifiers. */
function readColor(el: Element | null, theme: Theme, clrMap: ClrMap): Rgba | null {
  if (!el) return null;
  let hex: string | null = null;
  switch (el.localName) {
    case "srgbClr":
      hex = el.getAttribute("val");
      break;
    case "sysClr":
      hex = el.getAttribute("lastClr") || (el.getAttribute("val") === "window" ? "FFFFFF" : "000000");
      break;
    case "schemeClr": {
      const v = el.getAttribute("val") || "";
      hex = theme.get(clrMap.get(v) || v) || null;
      break;
    }
    case "prstClr":
      hex = ({ black: "000000", white: "FFFFFF", red: "FF0000", blue: "0000FF", green: "008000", yellow: "FFFF00" } as Record<string, string>)[
        el.getAttribute("val") || ""
      ] || null;
      break;
    default:
      return null;
  }
  if (!hex || !/^[0-9A-Fa-f]{6}/.test(hex)) return null;
  let rgb = hexToRgb(hex);
  let a = 1;
  let hsl = rgbToHsl(rgb);
  let hslTouched = false;
  for (const m of kids(el)) {
    const val = Number(m.getAttribute("val")) / 100000;
    if (!Number.isFinite(val)) continue;
    if (m.localName === "lumMod") (hsl[2] *= val), (hslTouched = true);
    else if (m.localName === "lumOff") (hsl[2] += val), (hslTouched = true);
    else if (m.localName === "alpha") a = val;
    else if (m.localName === "shade") (hsl[2] *= val), (hslTouched = true);
    else if (m.localName === "tint") (hsl[2] = hsl[2] * val + (1 - val)), (hslTouched = true);
    hsl[2] = Math.min(1, Math.max(0, hsl[2]));
  }
  if (hslTouched) rgb = hslToRgb(hsl);
  return { rgb: rgb.map((x) => Math.round(x)) as [number, number, number], a };
}

const css = (c: Rgba) => (c.a >= 1 ? `rgb(${c.rgb.join(", ")})` : `rgba(${c.rgb.join(", ")}, ${c.a.toFixed(2)})`);
const luminance = (c: Rgba) => (0.2126 * c.rgb[0] + 0.7152 * c.rgb[1] + 0.0722 * c.rgb[2]) / 255;
const firstColor = (el: Element | null, theme: Theme, clrMap: ClrMap) => {
  for (const c of kids(el)) {
    const col = readColor(c, theme, clrMap);
    if (col) return col;
  }
  return null;
};

interface Background {
  css: string;
  /** Average brightness 0..1 when known (colors); undefined for pictures. */
  light?: number;
}

/** Reads <p:bg> of a slide / layout / master. */
async function readBackground(
  cSld: Element | null,
  part: string,
  rels: Rels,
  zip: JSZip,
  theme: Theme,
  clrMap: ClrMap,
  media: Map<string, string | null>,
): Promise<Background | null> {
  const bg = kid(cSld, "bg");
  if (!bg) return null;
  const bgPr = kid(bg, "bgPr");
  if (!bgPr) {
    // <p:bgRef idx=".."><a:schemeClr/></p:bgRef> — theme fill; use its color as an approximation.
    const c = firstColor(kid(bg, "bgRef"), theme, clrMap);
    return c ? { css: css(c), light: luminance(c) } : null;
  }
  const solid = kid(bgPr, "solidFill");
  if (solid) {
    const c = firstColor(solid, theme, clrMap);
    return c ? { css: css(c), light: luminance(c) } : null;
  }
  const grad = kid(bgPr, "gradFill");
  if (grad) {
    const stops = kids(kid(grad, "gsLst"), "gs")
      .map((gs) => ({ pos: Number(gs.getAttribute("pos") || 0) / 1000, c: firstColor(gs, theme, clrMap) }))
      .filter((s): s is { pos: number; c: Rgba } => !!s.c)
      .sort((a, b) => a.pos - b.pos);
    if (stops.length === 0) return null;
    if (stops.length === 1) return { css: css(stops[0].c), light: luminance(stops[0].c) };
    const lin = kid(grad, "lin");
    const isRadial = !!kid(grad, "path");
    // DrawingML angle: 0 = left→right, clockwise, in 60000ths of a degree. CSS: 90deg = left→right.
    const ang = lin ? Number(lin.getAttribute("ang") || 0) / 60000 : 0;
    const list = stops.map((s) => `${css(s.c)} ${Math.round(s.pos)}%`).join(", ");
    return {
      css: isRadial ? `radial-gradient(circle, ${list})` : `linear-gradient(${Math.round(ang + 90)}deg, ${list})`,
      light: stops.reduce((sum, s) => sum + luminance(s.c), 0) / stops.length,
    };
  }
  const blip = path(bgPr, "blipFill", "blip");
  const embed = relAttr(blip, "embed");
  if (embed && rels.get(embed)) {
    const url = await mediaDataUrl(zip, rels.get(embed)!.target, media);
    if (url) return { css: `url("${url}") center / cover no-repeat` };
  }
  return null;
}

// ---------- text ----------

function paragraphText(p: Element): string {
  let out = "";
  for (const c of kids(p)) {
    if (c.localName === "r" || c.localName === "fld") out += kid(c, "t")?.textContent || "";
    else if (c.localName === "br") out += "\n";
  }
  return out.replace(/[ \t ]+/g, " ").trim();
}

function shapeText(sp: Element): string {
  const body = kid(sp, "txBody");
  return kids(body, "p")
    .map(paragraphText)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface TextBlock {
  text: string;
  y: number;
  x: number;
  order: number;
  isTitle: boolean;
}

/** Text shapes of a slide, top-to-bottom (titles without a position go first). Walks groups too. */
function slideTextBlocks(spTree: Element | null): { blocks: TextBlock[]; pictures: number } {
  const blocks: TextBlock[] = [];
  let pictures = 0;
  let order = 0;
  const walk = (el: Element | null) => {
    for (const c of kids(el)) {
      if (c.localName === "grpSp") {
        walk(c); // child positions are in the group's own space (usually the same as the slide's) — good enough for ordering
      } else if (c.localName === "sp") {
        const text = shapeText(c);
        if (!text) continue;
        const ph = path(c, "nvSpPr", "nvPr", "ph");
        const phType = ph?.getAttribute("type") || "";
        if (["sldNum", "dt", "ftr"].includes(phType)) continue; // slide number / date / footer
        const off = path(c, "spPr", "xfrm", "off");
        const isTitle = phType === "title" || phType === "ctrTitle";
        blocks.push({
          text,
          y: off ? Number(off.getAttribute("y") || 0) : isTitle ? -1 : Number.MAX_SAFE_INTEGER,
          x: off ? Number(off.getAttribute("x") || 0) : 0,
          order: order++,
          isTitle,
        });
      } else if (c.localName === "graphicFrame") {
        // tables: read cell text row by row
        const rows = descendants(c, "tr").map((tr) =>
          descendants(tr, "tc")
            .map((tc) => kids(kid(tc, "txBody"), "p").map(paragraphText).join(" ").trim())
            .filter(Boolean)
            .join(" | "),
        );
        const text = rows.filter(Boolean).join("\n");
        if (text) {
          const off = path(c, "xfrm", "off");
          blocks.push({ text, y: Number(off?.getAttribute("y") || Number.MAX_SAFE_INTEGER), x: Number(off?.getAttribute("x") || 0), order: order++, isTitle: false });
        } else pictures++;
      } else if (c.localName === "pic") {
        pictures++;
      }
    }
  };
  walk(spTree);
  // Same row (within ~0.5 cm) → left to right; otherwise top to bottom.
  blocks.sort((a, b) => (Math.abs(a.y - b.y) < 180000 ? a.x - b.x || a.order - b.order : a.y - b.y));
  return { blocks, pictures };
}

function notesText(doc: Document | null): string {
  if (!doc) return "";
  const spTree = path(doc.documentElement, "cSld", "spTree");
  return kids(spTree, "sp")
    .filter((sp) => {
      const t = path(sp, "nvSpPr", "nvPr", "ph")?.getAttribute("type");
      return t === "body" || (!t && !!kid(sp, "txBody")); // the notes text box, not the slide picture / slide number
    })
    .map(shapeText)
    .filter(Boolean)
    .join("\n")
    .trim();
}

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + "…" : s);

// ---------- A. .pptx ----------

export async function readPptx(file: File | Blob, fileName: string): Promise<ImportedDeck> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".ppt") || lower.endsWith(".pps")) {
    throw new Error("Lumang .ppt ito. Buksan muna sa PowerPoint at i-Save As bilang .pptx, o i-export bilang PNG (Images).");
  }
  if (file.size > PPT_LIMITS.MAX_PPTX_BYTES) throw new Error("Masyadong malaki ang file (max 150 MB).");
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error("Hindi mabuksan ang file. Siguraduhing .pptx ito na galing sa PowerPoint.");
  }
  const presPart = "ppt/presentation.xml";
  const pres = await readXml(zip, presPart);
  if (!pres) throw new Error("Hindi ito PowerPoint (.pptx) file.");
  const presRels = await readRels(zip, presPart);
  const slideParts = descendants(path(pres.documentElement, "sldIdLst"), "sldId")
    .map((s) => presRels.get(relAttr(s, "id") || "")?.target)
    .filter((t): t is string => !!t);
  if (slideParts.length === 0) throw new Error("Walang slide sa file na ito.");

  const media = new Map<string, string | null>();
  const themeCache = new Map<string, { theme: Theme; clrMap: ClrMap; bg: Background | null }>();
  const layoutBgCache = new Map<string, Background | null>();
  const slides: SlideContent[] = [];
  const warnings: string[] = [];
  let hidden = 0;
  let pictureOnly = 0;
  let withPictures = 0;

  for (const part of slideParts) {
    if (slides.length >= PPT_LIMITS.MAX_SLIDES) {
      warnings.push(`Hanggang ${PPT_LIMITS.MAX_SLIDES} slides lang ang kinuha.`);
      break;
    }
    const doc = await readXml(zip, part);
    if (!doc) continue;
    const root = doc.documentElement;
    if (root.getAttribute("show") === "0") {
      hidden++;
      continue;
    }
    const rels = await readRels(zip, part);

    // layout → master → theme (cached per master)
    const layoutPart = relOfType(rels, "slideLayout");
    const layoutDoc = layoutPart ? await readXml(zip, layoutPart) : null;
    const layoutRels = layoutPart ? await readRels(zip, layoutPart) : new Map();
    const masterPart = relOfType(layoutRels, "slideMaster");
    let master = masterPart ? themeCache.get(masterPart) : undefined;
    if (!master) {
      const masterDoc = masterPart ? await readXml(zip, masterPart) : null;
      const masterRels = masterPart ? await readRels(zip, masterPart) : new Map();
      const themePart = relOfType(masterRels, "theme");
      const theme = readTheme(themePart ? await readXml(zip, themePart) : null);
      const clrMap: ClrMap = new Map(DEFAULT_CLRMAP);
      const cm = masterDoc ? kid(masterDoc.documentElement, "clrMap") : null;
      if (cm) for (const a of Array.from(cm.attributes)) clrMap.set(a.localName, a.value);
      const bg = await readBackground(path(masterDoc?.documentElement, "cSld"), masterPart || "", masterRels, zip, theme, clrMap, media);
      master = { theme, clrMap, bg };
      if (masterPart) themeCache.set(masterPart, master);
    }
    // a slide (or layout) may override the master's color map
    const clrMap: ClrMap = new Map(master.clrMap);
    for (const ov of [kid(layoutDoc?.documentElement, "clrMapOvr"), kid(root, "clrMapOvr")]) {
      const o = kid(ov, "overrideClrMapping");
      if (o) for (const a of Array.from(o.attributes)) clrMap.set(a.localName, a.value);
    }

    let bg = await readBackground(path(root, "cSld"), part, rels, zip, master.theme, clrMap, media);
    if (!bg && layoutPart) {
      if (!layoutBgCache.has(layoutPart)) {
        layoutBgCache.set(layoutPart, await readBackground(path(layoutDoc?.documentElement, "cSld"), layoutPart, layoutRels, zip, master.theme, clrMap, media));
      }
      bg = layoutBgCache.get(layoutPart) || null;
    }
    if (!bg) bg = master.bg;
    if (!bg) bg = { css: "#FFFFFF", light: 1 }; // PowerPoint's default white slide

    const { blocks, pictures } = slideTextBlocks(path(root, "cSld", "spTree"));
    const text = clip(blocks.map((b) => b.text).join("\n\n"), PPT_LIMITS.MAX_TEXT_CHARS);
    const title = blocks.find((b) => b.isTitle)?.text.split("\n")[0];
    if (pictures) withPictures++;
    if (!text && pictures) pictureOnly++;

    const notesPart = relOfType(rels, "notesSlide");
    const notes = notesPart ? clip(notesText(await readXml(zip, notesPart)), PPT_LIMITS.MAX_NOTES_CHARS) : "";

    const n = slides.length + 1;
    slides.push({
      label: title ? clip(`${n}. ${title}`, 60) : `Slide ${n}`,
      text,
      background: bg.css,
      textColor: bg.light !== undefined && bg.light > 0.6 ? "#0f172a" : undefined,
      notes: notes || undefined,
    });
  }

  if (slides.length === 0) throw new Error(hidden ? "Naka-hide lahat ng slide sa file na ito." : "Walang mabasang slide sa file na ito.");
  if (hidden) warnings.push(`${hidden} naka-hide na slide ang hindi isinama.`);
  if (withPictures) {
    warnings.push(
      `${withPictures} slide ang may larawan/shape na hindi kasama (text at background lang ang nakukuha)${
        pictureOnly ? `; ${pictureOnly} dito ay larawan lang talaga` : ""
      }. Para eksakto ang itsura, i-export ang PPT bilang PNG at gamitin ang Images.`,
    );
  }
  return { name: fileName.replace(/\.pptx$/i, "").slice(0, 80) || "Presentation", kind: "pptx", slides, warnings };
}

// ---------- B. picture slides ----------

/** "Slide2.PNG" before "Slide10.PNG". */
export function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export async function readImageSlides(files: File[], name: string): Promise<ImportedDeck> {
  const warnings: string[] = [];
  const ok = files
    .filter((f) => {
      if (!IMAGE_SLIDE_TYPES.includes(f.type)) {
        warnings.push(`${f.name}: hindi PNG/JPG/WebP/GIF`);
        return false;
      }
      if (f.size > PPT_LIMITS.MAX_IMAGE_BYTES) {
        warnings.push(`${f.name}: masyadong malaki (max 15 MB)`);
        return false;
      }
      return true;
    })
    .sort((a, b) => naturalCompare(a.name, b.name));
  if (ok.length > PPT_LIMITS.MAX_SLIDES) warnings.push(`Hanggang ${PPT_LIMITS.MAX_SLIDES} larawan lang ang kinuha.`);
  const chosen = ok.slice(0, PPT_LIMITS.MAX_SLIDES);
  if (chosen.length === 0) throw new Error(warnings[0] || "Walang larawang napili.");
  const slides: SlideContent[] = [];
  for (const [i, f] of chosen.entries()) {
    slides.push({ label: `Slide ${i + 1}`, text: "", image: await readAsDataUrl(f), background: "#000000" });
  }
  return { name: name.slice(0, 80) || "Mga larawan", kind: "images", slides, warnings };
}
