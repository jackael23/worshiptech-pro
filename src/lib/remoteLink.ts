/**
 * 2026-10-29 (Jarvis): Phone remote — shared types + the laptop ("host") side.
 * The server (remoteServer.ts) relays: phone → command → laptop Simulator, and
 * laptop → snapshot (live screen + schedule) → phones. Same WiFi, no internet needed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveState, ScheduleItem, ResolvedTextStyle, BackgroundSettings } from "../types";

export type RemoteCmd =
  | { type: "next" | "prev" | "golive" | "black" | "clear" | "logo" }
  | { type: "live" | "select"; itemId: string; slide: number }
  | { type: "alert"; text: string; show: boolean };

export interface RemoteSlide {
  label: string;
  text: string;
  hasImage?: boolean;
}

export interface RemoteSnapshot {
  live: LiveState;
  /** Next slide of the item on air (for the phone's "Next" preview). */
  next?: { label: string; text: string; image?: string; background?: string; textColor?: string; textStyle?: ResolvedTextStyle; bgSettings?: BackgroundSettings } | null;
  selected: { itemId: string | null; slide: number };
  schedule: { id: string; title: string; type: ScheduleItem["type"]; slides: RemoteSlide[] }[];
}

// ---------- pictures: phones get small copies (PowerPoint slides can be several MB) ----------

const DATA_URL_RE = /data:image\/[a-zA-Z+.-]+;base64,[A-Za-z0-9+/=]+/g;
const SMALL_ENOUGH = 60_000; // characters
const shrinkCache = new Map<string, Promise<string>>();

function shrinkOne(src: string, maxW = 480): Promise<string> {
  if (src.length <= SMALL_ENOUGH || typeof document === "undefined") return Promise.resolve(src);
  const hit = shrinkCache.get(src);
  if (hit) return hit;
  const p = new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxW / (img.naturalWidth || maxW));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round((img.naturalWidth || maxW) * scale));
        c.height = Math.max(1, Math.round((img.naturalHeight || maxW * 0.5625) * scale));
        const ctx = c.getContext("2d");
        if (!ctx) return resolve("");
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.72));
      } catch {
        resolve("");
      }
    };
    img.onerror = () => resolve("");
    img.src = src;
  });
  if (shrinkCache.size > 40) shrinkCache.delete(shrinkCache.keys().next().value as string);
  shrinkCache.set(src, p);
  return p;
}

/** Shrinks every data: picture inside a string (a plain data URL or a CSS background). */
export async function shrinkPictures(s: string | undefined): Promise<string | undefined> {
  if (!s || s.length <= SMALL_ENOUGH) return s;
  const found = s.match(DATA_URL_RE) || [];
  let out = s;
  for (const d of found) out = out.replace(d, (await shrinkOne(d)) || "");
  return out;
}

/** Text for the phone's schedule list: no pictures, short text. */
export function scheduleForRemote(items: ScheduleItem[]): RemoteSnapshot["schedule"] {
  return items.map((it) => ({
    id: it.id,
    title: it.title.replace(/^\d+\.\s*/, ""),
    type: it.type,
    slides: it.slides.map((s) => ({ label: s.label, text: (s.text || "").slice(0, 160), hasImage: !!s.image || undefined })),
  }));
}

// ---------- laptop side ----------

export type RemoteAvailability = "checking" | "ready" | "not-local" | "no-server";

export interface RemoteHost {
  availability: RemoteAvailability;
  pin: string;
  urls: string[];
  phones: number;
  /** false = another Simulator tab on this laptop is the one the phones follow. */
  active: boolean;
  publish: (snap: RemoteSnapshot) => void;
  newPin: () => Promise<void>;
  /** Makes this tab the one the phones follow. */
  takeOver: () => Promise<void>;
}

/**
 * Connects the Simulator to the local server's remote bridge.
 * onCmd is called for every command from a phone (always the latest function is used).
 */
export function useRemoteHost(onCmd: (cmd: RemoteCmd) => void): RemoteHost {
  const [availability, setAvailability] = useState<RemoteAvailability>("checking");
  const [pin, setPin] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  const [phones, setPhones] = useState(0);
  const [active, setActive] = useState(true);
  const activeRef = useRef(false); // false until the server says this tab is in charge
  const hostIdRef = useRef("");
  const onCmdRef = useRef(onCmd);
  onCmdRef.current = onCmd;
  const resendRef = useRef<() => void>(() => {});

  useEffect(() => {
    let es: EventSource | null = null;
    let stopped = false;
    (async () => {
      try {
        const r = await fetch("/api/remote/info", { cache: "no-store" });
        if (stopped) return;
        if (r.status === 403) return setAvailability("not-local");
        const j = r.ok && (r.headers.get("content-type") || "").includes("json") ? await r.json() : null;
        if (stopped) return;
        if (!j || typeof j.pin !== "string") return setAvailability("no-server");
        setPin(j.pin);
        setUrls(Array.isArray(j.urls) ? j.urls : []);
        setPhones(Number(j.remotes) || 0);
        setAvailability("ready");
        es = new EventSource("/api/remote/host-events");
        // (re)connected — e.g. after the server restarted: new PIN, and phones need the screen again
        es.onopen = () => {
          activeRef.current = false; // wait for the server's "role" message (new host id)
          fetch("/api/remote/info", { cache: "no-store" })
            .then((x) => (x.ok ? x.json() : null))
            .then((k) => {
              if (stopped || !k || typeof k.pin !== "string") return;
              setPin(k.pin);
              setUrls(Array.isArray(k.urls) ? k.urls : []);
            })
            .catch(() => {});
          resendRef.current();
        };
        es.onmessage = (e) => {
          try {
            const m = JSON.parse(e.data);
            if (m?.type === "cmd" && m.cmd) onCmdRef.current(m.cmd as RemoteCmd);
            else if (m?.type === "remotes") setPhones(Number(m.count) || 0);
            else if (m?.type === "role") {
              hostIdRef.current = String(m.hostId || "");
              const was = activeRef.current;
              activeRef.current = m.active === true;
              setActive(activeRef.current);
              if (activeRef.current && !was) resendRef.current(); // phones need this tab's schedule
            }
          } catch {
            /* ignore bad message */
          }
        };
      } catch {
        if (!stopped) setAvailability("no-server");
      }
    })();
    return () => {
      stopped = true;
      es?.close();
    };
  }, []);

  // Snapshots: debounced, pictures shrunk, only the latest one is sent.
  const pending = useRef<RemoteSnapshot | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const publish = useCallback(
    (snap: RemoteSnapshot) => {
      if (availability !== "ready") return;
      pending.current = snap;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const s = pending.current;
        if (!s || !activeRef.current) return; // another tab is in charge
        const my = ++seq.current;
        const live = {
          ...s.live,
          currentSlideImage: await shrinkPictures(s.live.currentSlideImage),
          backgroundMediaUrl: await shrinkPictures(s.live.backgroundMediaUrl),
          // 2026-11-05: the phone shows the video's poster (backgroundMediaUrl) — the video stays on the laptop
          backgroundVideoId: undefined,
        };
        const next = s.next
          ? { ...s.next, image: await shrinkPictures(s.next.image), background: await shrinkPictures(s.next.background) }
          : s.next;
        if (my !== seq.current) return; // a newer snapshot is on its way
        fetch("/api/remote/host-state", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Host-Id": hostIdRef.current },
          body: JSON.stringify({ ...s, live, next }),
        }).catch(() => {});
      }, 120);
    },
    [availability],
  );

  resendRef.current = () => {
    if (pending.current) publish(pending.current);
  };

  const newPin = useCallback(async () => {
    try {
      const r = await fetch("/api/remote/new-pin", { method: "POST" });
      const j = await r.json();
      if (typeof j.pin === "string") setPin(j.pin);
    } catch {
      /* server gone */
    }
  }, []);

  const takeOver = useCallback(async () => {
    try {
      await fetch("/api/remote/take-over", { method: "POST", headers: { "X-Host-Id": hostIdRef.current } });
    } catch {
      /* server gone */
    }
  }, []);

  return { availability, pin, urls, phones, active, publish, newPin, takeOver };
}
