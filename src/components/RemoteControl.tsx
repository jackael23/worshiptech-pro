/**
 * 2026-10-29 (Jarvis): Phone remote (opened at /?remote on a phone on the same WiFi).
 *  - PIN login (PIN is shown on the laptop: Simulator → Output → Phone remote).
 *  - Live: current + next slide, Prev / Next, GO LIVE (laptop preview), Black / Clear / Logo.
 *    2026-11-05 (Mira): + "Prev song / Next song" — first slide of the item before / after the one
 *    on air, without going to the Schedule tab (separate buttons, so Next never jumps songs by accident).
 *  - Schedule: tap = select (laptop preview follows), ▶ or double-tap = LIVE.
 *  - Notes: big text for the preacher / worship leader (notes, current, next).
 *  - Alert: send / hide the message ticker.
 *  - 2026-11-08 (Mira): Live tab also lists every slide of the item on air — one tap = LIVE (jump).
 *  - 2026-11-08 (Mira): Library — add songs (Hymns + My Songs) and Bible verses to the schedule, or LIVE
 *    right away; Schedule → "Ayusin" = move ↑↓ / remove items. The laptop does the change (one schedule).
 *  - 2026-11-08 (Mira): Chords — lyrics with chords for musicians (current + next), view only;
 *    Transpose / text size / chords on-off are saved on this phone.
 * Talks to the local server (remoteServer.ts) — Server-Sent Events in, small POSTs out.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Play, ListOrdered, MonitorPlay, StickyNote, AlertTriangle, LogOut, Image as ImageIcon, Music2, Minus, Plus, Library, ArrowUp, ArrowDown, Trash2, Search, BookOpen, X } from "lucide-react";
import { ChordSheet, nextPreview } from "./ChordSheet";
import { transposeKey } from "../lib/chords";
import { LiveMainScreen } from "./LiveScreen";
import { SlideScreen } from "./SlideScreen";
import type { RemoteCmd, RemoteSnapshot, RemoteLibrary, BibleLookupResult } from "../lib/remoteLink";
import { BIBLE_BOOKS } from "../lib/bibleBooks";

const TOKEN_KEY = "wtp-remote-token";
const readToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
};
const writeToken = (t: string) => {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked — works until reload */
  }
};
const buzz = () => {
  try {
    navigator.vibrate?.(12);
  } catch {
    /* not supported */
  }
};

type Tab = "live" | "schedule" | "library" | "chords" | "notes" | "alert";
type Conn = "connecting" | "online" | "reconnecting";

// ---------------------------------------------------------------- PIN screen
const PinScreen: React.FC<{ onToken: (t: string) => void; message?: string }> = ({ onToken, message }) => {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(message || "");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 6 || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/remote/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.token) return onToken(j.token);
      setError(j.error || (r.status === 404 ? "Walang phone remote sa server na ito." : "Hindi makakonekta."));
      setPin("");
    } catch {
      setError("Hindi maabot ang laptop. Parehong WiFi ba kayo?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6 text-fg">
      <form onSubmit={submit} className="w-full max-w-xs space-y-5 text-center">
        <div>
          <MonitorPlay className="mx-auto mb-3 h-10 w-10 text-accent" />
          <h1 className="text-xl font-semibold">WorshipTech-Pro Remote</h1>
          <p className="mt-1 text-sm text-fg-muted">Ilagay ang PIN na nasa laptop (Simulator → Output → Phone remote).</p>
        </div>
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          aria-label="PIN"
          placeholder="••••••"
          className="input h-16 w-full text-center font-mono text-3xl tracking-[0.4em]"
        />
        {error && (
          <p role="alert" className="notice-warn text-left text-sm">
            {error}
          </p>
        )}
        <button type="submit" disabled={pin.length !== 6 || busy} className="btn btn-primary btn-lg h-14 w-full text-base">
          {busy ? "Kumokonekta…" : "Connect"}
        </button>
      </form>
    </div>
  );
};

// ---------------------------------------------------------------- main
export const RemoteControl: React.FC = () => {
  const [token, setToken] = useState(readToken);
  const [loginMsg, setLoginMsg] = useState("");
  const [snap, setSnap] = useState<RemoteSnapshot | null>(null);
  // 2026-11-08: song titles + Bibles from the laptop, and the latest Bible lookup answer
  const [library, setLibrary] = useState<RemoteLibrary | null>(null);
  const [lookup, setLookup] = useState<BibleLookupResult | null>(null);
  const [hostOn, setHostOn] = useState(false);
  const [conn, setConn] = useState<Conn>("connecting");
  const [tab, setTab] = useState<Tab>("live");
  const [toast, setToast] = useState("");
  const [clock, setClock] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    document.title = "WorshipTech-Pro — Remote";
    document.documentElement.dataset.theme = "dark";
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    tick();
    const t = setInterval(tick, 10000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const logout = useCallback((msg = "") => {
    writeToken("");
    setToken("");
    setSnap(null);
    setLoginMsg(msg);
  }, []);

  // live connection
  useEffect(() => {
    if (!token) return;
    let stopped = false;
    let again: ReturnType<typeof setTimeout> | null = null;
    const es = new EventSource(`/api/remote/events?token=${encodeURIComponent(token)}`);
    es.onopen = () => setConn("online");
    es.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.type === "state") setSnap(m.state as RemoteSnapshot);
        else if (m.type === "library") setLibrary(m.library as RemoteLibrary);
        else if (m.type === "lookup") setLookup(m.result as BibleLookupResult);
        else if (m.type === "host") setHostOn(!!m.connected);
        else if (m.type === "logout") logout("Pinalitan ang PIN sa laptop. Ilagay ang bagong PIN.");
      } catch {
        /* ignore */
      }
    };
    es.onerror = async () => {
      if (stopped) return;
      setConn("reconnecting");
      if (es.readyState !== EventSource.CLOSED) return; // the browser retries by itself
      // closed for good (e.g. 401 after the server restarted) — find out why
      try {
        const r = await fetch(`/api/remote/check?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (stopped) return;
        if (r.status === 401) return logout("Na-restart o pinalitan ang PIN sa laptop. Ilagay ang bagong PIN.");
      } catch {
        /* laptop not reachable yet */
      }
      again = setTimeout(() => setRetry((n) => n + 1), 2000);
    };
    return () => {
      stopped = true;
      if (again) clearTimeout(again);
      es.close();
    };
  }, [token, retry, logout]);

  const cmd = useCallback(
    async (c: RemoteCmd) => {
      buzz();
      try {
        const r = await fetch("/api/remote/cmd", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Remote-Token": token },
          body: JSON.stringify({ cmd: c }),
        });
        if (r.status === 401) return logout("Mag-login ulit (PIN).");
        if (r.status === 409) return setToast("Buksan ang Simulator sa laptop.");
        if (r.status === 429) return setToast("Dahan-dahan lang 🙂");
        if (!r.ok) setToast("Hindi natuloy. Subukan ulit.");
      } catch {
        setToast("Hindi maabot ang laptop.");
      }
    },
    [token, logout],
  );

  if (!token)
    return (
      <PinScreen
        message={loginMsg}
        onToken={(t) => {
          writeToken(t);
          setToken(t);
          setLoginMsg("");
          setConn("connecting");
        }}
      />
    );

  const live = snap?.live;
  const status =
    conn !== "online"
      ? { dot: "bg-warn", text: conn === "connecting" ? "Kumokonekta…" : "Reconnecting…" }
      : !hostOn
        ? { dot: "bg-warn", text: "Buksan ang Simulator sa laptop" }
        : { dot: "bg-ok", text: "Connected" };
  const disabled = conn !== "online" || !hostOn || !snap;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas font-sans text-fg">
      {/* top bar */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <MonitorPlay className="h-4 w-4 text-accent" />
        <span className="text-sm font-semibold">Remote</span>
        <span className="ml-1 inline-flex min-w-0 items-center gap-1.5 text-xs text-fg-muted" role="status" data-testid="remote-status">
          <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} />
          <span className="truncate">{status.text}</span>
        </span>
        <span className="ml-auto font-mono text-xs tabular-nums text-fg-subtle">{clock}</span>
        <button onClick={() => logout()} className="btn btn-ghost btn-icon touch-44" aria-label="Disconnect" title="Disconnect">
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {!snap ? (
          <p className="p-6 text-center text-sm text-fg-muted">{hostOn ? "Hinihintay ang screen mula sa laptop…" : "Buksan ang Simulator tab sa laptop."}</p>
        ) : tab === "live" ? (
          <LiveTab snap={snap} cmd={cmd} disabled={disabled} />
        ) : tab === "schedule" ? (
          <ScheduleTab snap={snap} cmd={cmd} disabled={disabled} onAdd={() => setTab("library")} />
        ) : tab === "library" ? (
          <LibraryTab library={library} lookup={lookup} cmd={cmd} disabled={disabled} toast={setToast} />
        ) : tab === "chords" ? (
          <ChordsTab snap={snap} />
        ) : tab === "notes" ? (
          <NotesTab snap={snap} clock={clock} />
        ) : (
          <AlertTab snap={snap} cmd={cmd} disabled={disabled} />
        )}
      </main>

      {toast && (
        <div role="status" className="pointer-events-none fixed inset-x-4 bottom-20 z-10 rounded-lg bg-fg px-3 py-2 text-center text-sm text-canvas shadow-lg">
          {toast}
        </div>
      )}

      {/* bottom tabs */}
      <nav className="grid shrink-0 grid-cols-6 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]" aria-label="Remote">
        {(
          [
            ["live", "Live", MonitorPlay],
            ["schedule", "Schedule", ListOrdered],
            ["library", "Library", Library],
            ["chords", "Chords", Music2],
            ["notes", "Notes", StickyNote],
            ["alert", "Alert", AlertTriangle],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-current={tab === id ? "page" : undefined}
            className={`relative flex h-14 flex-col items-center justify-center gap-0.5 text-xs ${tab === id ? "text-accent-text" : "text-fg-muted"}`}
          >
            <Icon className="h-5 w-5" />
            {label}
            {id === "alert" && live?.nurseryAlertActive && <span className="absolute right-[30%] top-2 h-2 w-2 rounded-full bg-live" />}
            {id === "live" && live?.isLive && !live.isBlackout && <span className="absolute right-[30%] top-2 h-2 w-2 rounded-full bg-live" />}
          </button>
        ))}
      </nav>
    </div>
  );
};

// ---------------------------------------------------------------- tabs
interface TabProps {
  snap: RemoteSnapshot;
  cmd: (c: RemoteCmd) => void;
  disabled: boolean;
}

const LiveTab: React.FC<TabProps> = ({ snap, cmd, disabled }) => {
  const { live, next } = snap;
  const selItem = snap.schedule.find((i) => i.id === snap.selected.itemId);
  const selSlide = selItem?.slides[snap.selected.slide];
  const state = live.isBlackout ? "Black" : live.isLogo ? "Logo" : live.isClearText ? "Text off" : live.isLive ? "On air" : "Standby";
  // 2026-11-05: song before / after the item on air (or the laptop's selected item when nothing is on air)
  const baseIdx = snap.schedule.findIndex((i) => i.id === (live.activeScheduleItemId || snap.selected.itemId));
  const prevSong = baseIdx > 0 ? snap.schedule[baseIdx - 1] : undefined;
  const nextSong = baseIdx >= 0 ? snap.schedule[baseIdx + 1] : snap.schedule[0];
  const goSong = (item?: { id: string; slides: unknown[] }) => item && item.slides.length > 0 && cmd({ type: "live", itemId: item.id, slide: 0 });
  // 2026-11-08: item whose slides are shown for jumping (on air, else the laptop's selected item)
  const jumpOnAir = !!(live.isLive && live.activeScheduleItemId && snap.schedule.some((i) => i.id === live.activeScheduleItemId));
  const jumpItem = snap.schedule.find((i) => i.id === (jumpOnAir ? live.activeScheduleItemId : snap.selected.itemId));
  return (
    <div className="mx-auto max-w-xl space-y-3 p-3">
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="truncate font-medium">
            <span className="text-live-text">LIVE</span> · {live.currentSlideLabel || "—"}
          </span>
          <span className={`badge ${live.isLive && !live.isBlackout ? "badge-live" : ""}`} data-testid="remote-state">
            {state}
          </span>
        </div>
        <div className="overflow-hidden rounded-lg ring-1 ring-live/60" data-testid="remote-live">
          <LiveMainScreen liveState={live} operator fade={false} playVideo={false} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-2/5 shrink-0 overflow-hidden rounded-md ring-1 ring-line">
          {next ? <SlideScreen slide={next} background={next.background} textScale={6} textStyle={next.textStyle} bgSettings={next.bgSettings} ariaHidden /> : <div className="grid aspect-video place-items-center bg-surface-2 text-xs text-fg-subtle">Wala na</div>}
        </div>
        <div className="min-w-0 text-xs">
          <div className="eyebrow mb-0.5">Next</div>
          <div className="truncate text-sm text-fg">{next ? next.label : "(dulo ng item)"}</div>
          <div className="line-clamp-2 text-fg-muted">{next?.text.split("\n")[0]}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button disabled={disabled} onClick={() => cmd({ type: "prev" })} className="btn btn-secondary h-20 rounded-xl text-base" aria-label="Previous slide">
          <ChevronLeft className="h-6 w-6" /> Prev
        </button>
        <button disabled={disabled} onClick={() => cmd({ type: "next" })} className="btn btn-primary h-20 rounded-xl text-base" aria-label="Next slide">
          Next <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {/* 2026-11-08 (Mira): all slides of the item on air (or the laptop's selected item) — one tap = LIVE,
          to jump e.g. from the Chorus back to Verse 1 */}
      {jumpItem && jumpItem.slides.length > 0 && (
        <div data-testid="remote-jump">
          <div className="mb-1.5 flex items-center gap-2 text-xs">
            <span className="eyebrow">Slides</span>
            <span className="min-w-0 truncate text-fg-muted">{jumpItem.title}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {jumpItem.slides.map((s, i) => {
              const isLive = jumpOnAir && live.activeSlideIndex === i;
              return (
                <button
                  key={i}
                  disabled={disabled}
                  onClick={() => !isLive && cmd({ type: "live", itemId: jumpItem.id, slide: i })}
                  aria-current={isLive ? "true" : undefined}
                  aria-label={`LIVE: ${s.label}`}
                  className={`min-h-[56px] min-w-0 rounded-lg border px-2.5 py-1.5 text-left touch-manipulation ${isLive ? "border-live bg-live-soft" : "border-line bg-surface active:bg-surface-2"}`}
                  data-testid={`remote-jump-${i}`}
                >
                  <span className="flex items-center gap-1.5 text-xs">
                    <span className="font-mono text-fg-subtle">{i + 1}</span>
                    <span className={`truncate ${isLive ? "font-semibold text-live-text" : "font-medium text-fg"}`}>{s.label}</span>
                    {isLive && <span className="badge badge-live ml-auto px-1 py-0 leading-4">LIVE</span>}
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{s.text.split("\n")[0] || (s.hasImage ? "(larawan)" : "")}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2026-11-05: change song from here (first slide of the item before / after) */}
      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={disabled || !prevSong}
          onClick={() => goSong(prevSong)}
          className="btn btn-secondary h-14 min-w-0 justify-start rounded-xl px-3 text-left"
          aria-label={prevSong ? `Prev song: ${prevSong.title}` : "Prev song (wala na)"}
          data-testid="remote-prev-song"
        >
          <ChevronsLeft className="h-5 w-5 shrink-0" />
          <span className="min-w-0">
            <span className="block text-xs text-fg-muted">Prev song</span>
            <span className="block truncate text-sm">{prevSong ? prevSong.title : "—"}</span>
          </span>
        </button>
        <button
          disabled={disabled || !nextSong}
          onClick={() => goSong(nextSong)}
          className="btn btn-secondary h-14 min-w-0 justify-end rounded-xl px-3 text-right"
          aria-label={nextSong ? `Next song: ${nextSong.title}` : "Next song (wala na)"}
          data-testid="remote-next-song"
        >
          <span className="min-w-0">
            <span className="block text-xs text-fg-muted">Next song</span>
            <span className="block truncate text-sm">{nextSong ? nextSong.title : "—"}</span>
          </span>
          <ChevronsRight className="h-5 w-5 shrink-0" />
        </button>
      </div>

      <button disabled={disabled} onClick={() => cmd({ type: "golive" })} className="btn btn-secondary h-14 w-full rounded-xl text-sm" aria-label="Go live with the laptop preview">
        <Play className="h-4 w-4 fill-current" />
        GO LIVE
        <span className="min-w-0 truncate font-normal text-fg-muted">· {selSlide ? `${selItem?.title} — ${selSlide.label}` : "preview"}</span>
      </button>

      <div className="grid grid-cols-3 gap-2">
        <button
          disabled={disabled}
          onClick={() => cmd({ type: "black" })}
          aria-pressed={live.isBlackout}
          className={`btn h-14 rounded-xl text-sm ${live.isBlackout ? "bg-fg text-canvas" : "btn-secondary"}`}
        >
          Black
        </button>
        <button
          disabled={disabled}
          onClick={() => cmd({ type: "clear" })}
          aria-pressed={live.isClearText}
          className={`btn h-14 rounded-xl text-sm ${live.isClearText ? "bg-warn-soft text-warn-text ring-1 ring-warn/60" : "btn-secondary"}`}
        >
          Clear
        </button>
        <button
          disabled={disabled}
          onClick={() => cmd({ type: "logo" })}
          aria-pressed={live.isLogo}
          className={`btn h-14 rounded-xl text-sm ${live.isLogo ? "bg-accent-soft text-accent-text ring-1 ring-accent/60" : "btn-secondary"}`}
        >
          Logo
        </button>
      </div>
    </div>
  );
};

const ScheduleTab: React.FC<TabProps & { onAdd: () => void }> = ({ snap, cmd, disabled, onAdd }) => {
  const { live, schedule, selected } = snap;
  const [open, setOpen] = useState<string | null>(live.activeScheduleItemId || selected.itemId);
  const liveRowRef = useRef<HTMLDivElement | null>(null);
  // 2026-11-08 (Mira): "Ayusin" = move / remove items (remove asks once: tap ✕, then "Tanggalin")
  const [editing, setEditing] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  useEffect(() => {
    liveRowRef.current?.scrollIntoView({ block: "center" });
  }, []);
  return (
    <div className="mx-auto max-w-xl space-y-1.5 p-3">
      <div className="flex items-center gap-2 pb-1">
        <p className="min-w-0 flex-1 px-1 text-xs text-fg-subtle">{editing ? "↑↓ = ilipat · 🗑 = tanggalin" : "Tap = piliin (preview sa laptop) · ▶ o double-tap = LIVE"}</p>
        <button onClick={onAdd} className="btn btn-secondary h-10 shrink-0 px-3" data-testid="remote-add">
          <Plus className="h-4 w-4" /> Add
        </button>
        <button
          onClick={() => {
            setEditing((e) => !e);
            setConfirmId(null);
          }}
          aria-pressed={editing}
          className={`btn h-10 shrink-0 px-3 ${editing ? "btn-primary" : "btn-ghost"}`}
          data-testid="remote-edit-schedule"
        >
          {editing ? "Tapos" : "Ayusin"}
        </button>
      </div>
      {schedule.map((item, idx) => {
        const isOpen = open === item.id && !editing;
        const itemLive = live.isLive && live.activeScheduleItemId === item.id;
        if (editing)
          return (
            <div key={item.id} className={`flex min-h-[52px] items-center gap-1 rounded-lg border px-2 ${itemLive ? "border-live/60" : "border-line"} bg-surface`} data-testid={`remote-edit-row-${idx}`}>
              <span className="w-6 shrink-0 text-right font-mono text-sm text-fg-subtle">{String(idx + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1 truncate px-1 text-[15px] font-medium">{item.title}</span>
              {itemLive && <span className="badge badge-live px-1 py-0 leading-4">LIVE</span>}
              {confirmId === item.id ? (
                <>
                  <button
                    disabled={disabled || schedule.length <= 1}
                    onClick={() => {
                      cmd({ type: "remove", itemId: item.id });
                      setConfirmId(null);
                    }}
                    className="btn h-10 shrink-0 bg-live px-3 text-white"
                    data-testid={`remote-remove-confirm-${idx}`}
                  >
                    Tanggalin
                  </button>
                  <button onClick={() => setConfirmId(null)} className="btn btn-ghost btn-icon h-10 w-10 shrink-0" aria-label="Huwag">
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <button disabled={disabled || idx === 0} onClick={() => cmd({ type: "move", itemId: item.id, dir: "up" })} className="btn btn-ghost btn-icon h-11 w-11 shrink-0" aria-label={`Itaas: ${item.title}`}>
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button disabled={disabled || idx === schedule.length - 1} onClick={() => cmd({ type: "move", itemId: item.id, dir: "down" })} className="btn btn-ghost btn-icon h-11 w-11 shrink-0" aria-label={`Ibaba: ${item.title}`}>
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    disabled={disabled || schedule.length <= 1}
                    onClick={() => setConfirmId(item.id)}
                    className="btn btn-ghost btn-icon h-11 w-11 shrink-0 text-live-text"
                    aria-label={`Tanggalin: ${item.title}`}
                    title={schedule.length <= 1 ? "Kailangang may isang item man lang" : undefined}
                    data-testid={`remote-remove-${idx}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          );
        return (
          <div key={item.id} className={`overflow-hidden rounded-lg border ${itemLive ? "border-live/60" : "border-line"} bg-surface`}>
            <button
              onClick={() => setOpen(isOpen ? null : item.id)}
              aria-expanded={isOpen}
              className="flex min-h-[52px] w-full items-center gap-3 px-3 text-left"
            >
              <span className="w-6 shrink-0 text-right font-mono text-sm text-fg-subtle">{String(idx + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{item.title}</span>
              {itemLive && <span className="badge badge-live px-1 py-0 leading-4">LIVE</span>}
              <span className="font-mono text-xs text-fg-subtle">{item.slides.length}</span>
            </button>
            {isOpen && (
              <div className="border-t border-line">
                {item.slides.map((s, i) => {
                  const isLive = itemLive && live.activeSlideIndex === i;
                  const isSel = selected.itemId === item.id && selected.slide === i;
                  return (
                    <div
                      key={i}
                      ref={isLive ? liveRowRef : undefined}
                      onClick={() => !disabled && cmd({ type: "select", itemId: item.id, slide: i })}
                      onDoubleClick={() => !disabled && cmd({ type: "live", itemId: item.id, slide: i })}
                      className={`flex min-h-[56px] cursor-pointer select-none items-center gap-2 border-b border-line px-3 py-2 last:border-b-0 touch-manipulation ${
                        isLive ? "bg-live-soft" : isSel ? "bg-accent-soft" : ""
                      }`}
                      data-testid={`remote-slide-${item.id}-${i}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="font-mono text-fg-subtle">{i + 1}</span>
                          <span className={isLive ? "font-semibold text-live-text" : isSel ? "font-semibold text-accent-text" : "text-fg-muted"}>{s.label}</span>
                          {s.hasImage && <ImageIcon className="h-3 w-3 text-fg-subtle" />}
                        </div>
                        <div className="line-clamp-2 text-sm text-fg">{s.text || (s.hasImage ? "(larawan)" : "")}</div>
                      </div>
                      <button
                        disabled={disabled}
                        onClick={(e) => {
                          e.stopPropagation();
                          cmd({ type: "live", itemId: item.id, slide: i });
                        }}
                        className={`btn btn-icon h-11 w-11 shrink-0 rounded-full ${isLive ? "bg-live text-white" : "btn-secondary"}`}
                        aria-label={`LIVE: ${item.title} — ${s.label}`}
                      >
                        <Play className="h-4 w-4 fill-current" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// 2026-11-08 (Mira): Library tab — add songs / Bible verses to the schedule (or LIVE) from the phone.
const LibraryTab: React.FC<{
  library: RemoteLibrary | null;
  lookup: BibleLookupResult | null;
  cmd: (c: RemoteCmd) => void;
  disabled: boolean;
  toast: (t: string) => void;
}> = ({ library, lookup, cmd, disabled, toast }) => {
  const [part, setPart] = useState<"songs" | "bible">("songs");
  return (
    <div className="mx-auto max-w-xl p-3">
      <div className="seg mb-3 grid grid-cols-2" role="group" aria-label="Library">
        <button onClick={() => setPart("songs")} aria-pressed={part === "songs"} className="seg-item min-h-11">
          <Music2 className="h-4 w-4" /> Songs
        </button>
        <button onClick={() => setPart("bible")} aria-pressed={part === "bible"} className="seg-item min-h-11" data-testid="remote-lib-bible">
          <BookOpen className="h-4 w-4" /> Bible
        </button>
      </div>
      {!library ? (
        <p className="p-4 text-center text-sm text-fg-muted">Hinihintay ang listahan mula sa laptop…</p>
      ) : part === "songs" ? (
        <SongsPart library={library} cmd={cmd} disabled={disabled} toast={toast} />
      ) : (
        <BiblePart library={library} lookup={lookup} cmd={cmd} disabled={disabled} toast={toast} />
      )}
    </div>
  );
};

const MAX_SONG_ROWS = 150;

const SongsPart: React.FC<{ library: RemoteLibrary; cmd: (c: RemoteCmd) => void; disabled: boolean; toast: (t: string) => void }> = ({ library, cmd, disabled, toast }) => {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "mine" | "hymns" | "chords">("all");
  const ql = q.trim().toLowerCase();
  const list = library.songs.filter(
    (s) =>
      (filter === "all" || (filter === "mine" && s.mine) || (filter === "hymns" && !s.mine) || (filter === "chords" && s.chords)) &&
      (!ql || s.title.toLowerCase().includes(ql) || (s.author || "").toLowerCase().includes(ql)),
  );
  const chip = (id: typeof filter, label: string) => (
    <button key={id} onClick={() => setFilter(id)} aria-pressed={filter === id} className={`min-h-9 rounded-full border px-3 text-xs ${filter === id ? "border-accent/40 bg-accent-soft font-semibold text-accent-text" : "border-line text-fg-muted"}`}>
      {label}
    </button>
  );
  return (
    <div className="space-y-2">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hanapin ang kanta…" className="input h-11 w-full pl-9 text-base" aria-label="Hanapin ang kanta" data-testid="remote-song-search" />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {chip("all", "Lahat")}
        {chip("mine", "My Songs")}
        {chip("hymns", "Hymns")}
        {chip("chords", "♪ May chords")}
      </div>
      {list.length === 0 && <p className="p-4 text-center text-sm text-fg-muted">Walang kanta na tugma.</p>}
      <div className="space-y-1.5">
        {list.slice(0, MAX_SONG_ROWS).map((s) => (
          <div key={s.id} className="flex min-h-[56px] items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5" data-testid="remote-song-row">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium">
                {s.title} {s.chords && <span className="text-amber-400" title="May chords">♪</span>}
              </div>
              <div className="truncate text-xs text-fg-subtle">
                {[s.mine ? "My Song" : "Hymn", s.key ? `Key ${s.key}` : "", s.author || "", `${s.slides} slides`].filter(Boolean).join(" · ")}
              </div>
            </div>
            <button
              disabled={disabled}
              onClick={() => {
                cmd({ type: "add-song", songId: s.id, live: false });
                toast(`Naidagdag: ${s.title}`);
              }}
              className="btn btn-secondary h-11 shrink-0 px-3"
              aria-label={`Add: ${s.title}`}
            >
              <Plus className="h-4 w-4" /> Add
            </button>
            <button
              disabled={disabled}
              onClick={() => {
                cmd({ type: "add-song", songId: s.id, live: true });
                toast(`LIVE: ${s.title}`);
              }}
              className="btn btn-icon h-11 w-11 shrink-0 rounded-full bg-live text-white"
              aria-label={`Add + LIVE: ${s.title}`}
            >
              <Play className="h-4 w-4 fill-current" />
            </button>
          </div>
        ))}
      </div>
      {list.length > MAX_SONG_ROWS && <p className="p-2 text-center text-xs text-fg-subtle">{list.length - MAX_SONG_ROWS} pa — mag-search para makita.</p>}
    </div>
  );
};

const BiblePart: React.FC<{ library: RemoteLibrary; lookup: BibleLookupResult | null; cmd: (c: RemoteCmd) => void; disabled: boolean; toast: (t: string) => void }> = ({
  library,
  lookup,
  cmd,
  disabled,
  toast,
}) => {
  const [bibleId, setBibleId] = useState(library.bibles[0]?.id || "");
  const [ref, setRef] = useState("");
  const [myReq, setMyReq] = useState("");
  const [result, setResult] = useState<BibleLookupResult | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [browsing, setBrowsing] = useState(false);
  useEffect(() => {
    if (!library.bibles.some((b) => b.id === bibleId)) setBibleId(library.bibles[0]?.id || "");
  }, [library.bibles, bibleId]);
  // only this phone's own answer (other phones may be looking up too)
  useEffect(() => {
    if (lookup && lookup.reqId === myReq) {
      setResult(lookup);
      setPicked(new Set());
    }
  }, [lookup, myReq]);

  if (library.bibles.length === 0)
    return <p className="notice-info text-sm">Walang naka-import na Bible sa laptop. Sa laptop: Simulator → Bibles → Import Bible (hal. Ang Dating Biblia, KJV).</p>;

  const ask = (q: { ref?: string; book?: number; chapter?: number }) => {
    const reqId = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    setMyReq(reqId);
    setBrowsing(false);
    cmd({ type: "bible-lookup", reqId, bibleId, ...q });
  };
  const shown = result?.ok ? result.verses || [] : [];
  const chosen = shown.filter((v) => picked.has(v.v));
  const use = (chosen.length ? chosen : shown).slice(0, 60);
  const send = (live: boolean) => {
    if (!result?.ok || result.book === undefined || !result.chapter || use.length === 0) return;
    cmd({ type: "add-verses", bibleId: result.bibleId || bibleId, book: result.book, chapter: result.chapter, verses: use.map((v) => v.v), live });
    toast(`${live ? "LIVE" : "Naidagdag"}: ${result.bookName} ${result.chapter} (${use.length} verse${use.length > 1 ? "s" : ""})`);
    setPicked(new Set());
  };
  const isTl = library.bibles.find((b) => b.id === bibleId)?.language === "tl";

  return (
    <div className="space-y-2 pb-20">
      {library.bibles.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {library.bibles.map((b) => (
            <button key={b.id} onClick={() => setBibleId(b.id)} aria-pressed={bibleId === b.id} className={`min-h-9 rounded-full border px-3 text-xs ${bibleId === b.id ? "border-accent/40 bg-accent-soft font-semibold text-accent-text" : "border-line text-fg-muted"}`}>
              {b.shortName}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ref.trim()) ask({ ref: ref.trim() });
        }}
        className="flex gap-2"
      >
        <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Juan 3:16, Awit 23…" className="input h-11 min-w-0 flex-1 text-base" aria-label="Bible reference" data-testid="remote-bible-ref" />
        <button type="submit" disabled={disabled || !ref.trim()} className="btn btn-primary h-11 px-4">
          <Search className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setBrowsing((b) => !b)} aria-pressed={browsing} className="btn btn-secondary h-11 px-3">
          Aklat
        </button>
      </form>

      {browsing && (
        <div className="grid grid-cols-3 gap-1">
          {BIBLE_BOOKS.map((bk, i) => (
            <button key={i} disabled={disabled} onClick={() => ask({ book: i, chapter: 1 })} className="min-h-11 truncate rounded-md border border-line bg-surface px-1 text-xs">
              {isTl ? bk[1] : bk[0]}
            </button>
          ))}
        </div>
      )}

      {myReq && !result && <p className="p-3 text-center text-sm text-fg-muted">Hinahanap…</p>}
      {result && !result.ok && <p className="notice-warn text-sm">{result.error}</p>}
      {result?.ok && !browsing && (
        <>
          <div className="flex items-center gap-2 pt-1">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-accent-text">
              {result.bookName} {result.chapter} <span className="font-normal text-fg-subtle">({result.bibleShort})</span>
            </span>
            {result.chapterCount && result.chapterCount > 1 && (
              <select
                value={result.chapter}
                onChange={(e) => ask({ book: result.book, chapter: Number(e.target.value) })}
                className="input h-10 w-24 text-sm"
                aria-label="Kabanata"
              >
                {Array.from({ length: result.chapterCount }, (_, i) => (
                  <option key={i} value={i + 1}>
                    Kab. {i + 1}
                  </option>
                ))}
              </select>
            )}
          </div>
          <p className="px-1 text-xs text-fg-subtle">Tap ang verse para piliin. Walang pinili = lahat ng nakalista (hanggang 60).</p>
          <div className="space-y-1">
            {shown.map((v) => {
              const on = picked.has(v.v);
              return (
                <button
                  key={v.v}
                  onClick={() =>
                    setPicked((s) => {
                      const n = new Set(s);
                      n.has(v.v) ? n.delete(v.v) : n.add(v.v);
                      return n;
                    })
                  }
                  aria-pressed={on}
                  className={`flex w-full gap-2 rounded-lg border px-3 py-2 text-left text-sm ${on ? "border-accent/50 bg-accent-soft" : "border-line bg-surface"}`}
                  data-testid="remote-verse"
                >
                  <span className="w-6 shrink-0 font-mono text-xs text-fg-subtle">{v.v}</span>
                  <span className="min-w-0 flex-1">{v.text}</span>
                </button>
              );
            })}
          </div>
          {/* actions stay above the bottom tabs */}
          <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-[2] flex gap-2 border-t border-line bg-surface/95 p-2 backdrop-blur">
            <button disabled={disabled || use.length === 0} onClick={() => send(false)} className="btn btn-secondary h-12 flex-1" data-testid="remote-verses-add">
              <Plus className="h-4 w-4" /> Add {chosen.length ? `(${chosen.length})` : "lahat"}
            </button>
            <button disabled={disabled || use.length === 0} onClick={() => send(true)} className="btn h-12 flex-1 bg-live text-white" data-testid="remote-verses-live">
              <Play className="h-4 w-4 fill-current" /> LIVE {chosen.length ? `(${chosen.length})` : "lahat"}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// 2026-11-08 (Mira): Chords tab — musicians follow the slide on air with chords (same view as the Stage screen).
const CHORD_PREFS_KEY = "wtp-remote-chords-v1";
interface ChordPrefs {
  transpose: number; // -11..11
  size: number; // 0.7..2
  chords: boolean;
}
function loadChordPrefs(): ChordPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(CHORD_PREFS_KEY) || "{}");
    const n = (x: unknown, min: number, max: number, d: number) => (typeof x === "number" && isFinite(x) ? Math.min(max, Math.max(min, x)) : d);
    return { transpose: Math.round(n(v.transpose, -11, 11, 0)), size: n(v.size, 0.7, 2, 1), chords: v.chords !== false };
  } catch {
    return { transpose: 0, size: 1, chords: true };
  }
}

const ChordsTab: React.FC<{ snap: RemoteSnapshot }> = ({ snap }) => {
  const { live } = snap;
  const [p, setP] = useState<ChordPrefs>(loadChordPrefs);
  const set = (x: Partial<ChordPrefs>) =>
    setP((prev) => {
      const nextP = { ...prev, ...x };
      try {
        localStorage.setItem(CHORD_PREFS_KEY, JSON.stringify(nextP));
      } catch {
        /* storage blocked */
      }
      return nextP;
    });
  const onAir = live.isLive && (live.currentSlideText || live.currentSlideImage);
  const key = live.songKey ? transposeKey(live.songKey, p.transpose) : "";
  const projector = live.isBlackout ? "BLACK" : live.isLogo ? "LOGO" : live.isClearText ? "TEXT OFF" : "";
  const next = nextPreview(live);
  return (
    <div className="flex min-h-full flex-col bg-black text-white" data-testid="remote-chords">
      {/* controls */}
      <div className="sticky top-0 z-[1] flex flex-wrap items-center gap-1 border-b border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300">
        <span className="pl-1 text-zinc-500">Key</span>
        <button onClick={() => set({ transpose: Math.max(-11, p.transpose - 1) })} className="touch-44 grid place-items-center rounded-md hover:bg-white/10" aria-label="Transpose down" data-testid="remote-transpose-down">
          <Minus className="h-4 w-4" />
        </button>
        <button onClick={() => set({ transpose: 0 })} className="min-w-9 rounded-md px-1 py-2 font-mono tabular-nums hover:bg-white/10" title="Balik sa orihinal">
          {p.transpose > 0 ? `+${p.transpose}` : p.transpose}
        </button>
        <button onClick={() => set({ transpose: Math.min(11, p.transpose + 1) })} className="touch-44 grid place-items-center rounded-md hover:bg-white/10" aria-label="Transpose up" data-testid="remote-transpose-up">
          <Plus className="h-4 w-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-white/15" />
        <button onClick={() => set({ size: Math.max(0.7, +(p.size - 0.1).toFixed(2)) })} className="touch-44 rounded-md px-2 hover:bg-white/10" aria-label="Mas maliit na text">
          A−
        </button>
        <button onClick={() => set({ size: Math.min(2, +(p.size + 0.1).toFixed(2)) })} className="touch-44 rounded-md px-2 text-sm hover:bg-white/10" aria-label="Mas malaking text">
          A+
        </button>
        <button
          onClick={() => set({ chords: !p.chords })}
          className={`ml-auto inline-flex min-h-11 items-center gap-1 rounded-md px-2 ${p.chords ? "bg-amber-400/20 text-amber-200" : "hover:bg-white/10"}`}
          aria-pressed={p.chords}
        >
          <Music2 className="h-4 w-4" />
          Chords
        </button>
      </div>

      {/* section · key · projector status */}
      <div className="flex items-center gap-2 px-3 pt-3 font-mono text-sm text-zinc-400">
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold text-white">{onAir ? live.currentSlideLabel || "—" : "Standby"}</span>
          {key && (
            <span className="ml-2 text-amber-300">
              Key {key}
              {p.transpose ? ` (${p.transpose > 0 ? "+" : ""}${p.transpose})` : ""}
            </span>
          )}
        </span>
        {projector && <span className="rounded bg-red-900/70 px-1.5 text-xs font-semibold text-red-100">PROJECTOR: {projector}</span>}
      </div>

      {/* current slide */}
      <div className="px-3 py-3" style={{ fontSize: `${1.6 * p.size}rem` }}>
        {!onAir ? (
          <p className="text-[0.6em] text-zinc-500">Walang naka-live.</p>
        ) : live.currentSlideText ? (
          <ChordSheet text={live.currentSlideText} chords={live.currentSlideChords} transpose={p.transpose} songKey={live.songKey} showChords={p.chords} className="font-semibold" />
        ) : (
          <p className="text-[0.6em] text-zinc-400">(larawan sa projector)</p>
        )}
      </div>

      {/* next slide */}
      <div className="mt-auto border-t border-zinc-800 px-3 py-3" style={{ fontSize: `${1.05 * p.size}rem` }}>
        <div className="mb-1 font-mono text-xs font-semibold text-sky-400">NEXT</div>
        {onAir && next ? (
          <ChordSheet text={next.text} chords={next.chords} transpose={p.transpose} songKey={live.songKey} showChords={p.chords} className="text-yellow-200" />
        ) : (
          <span className="text-sm text-zinc-500">{onAir ? "(dulo ng item)" : "—"}</span>
        )}
      </div>
    </div>
  );
};

const NotesTab: React.FC<{ snap: RemoteSnapshot; clock: string }> = ({ snap, clock }) => {
  const { live, next } = snap;
  const main = live.isBlackout ? "(BLACK)" : live.currentSlideText || (live.currentSlideImage ? "(larawan sa screen)" : "—");
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-4 bg-black p-4 text-white">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2 font-mono text-sm text-zinc-400">
        <span className="truncate">{live.currentSlideLabel || "—"}</span>
        <span className="rounded bg-zinc-900 px-2 text-lg text-white tabular-nums">{clock}</span>
      </div>
      {live.currentSlideNotes ? (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-sky-400">Notes</div>
          <p className="whitespace-pre-line text-2xl font-semibold leading-snug text-emerald-300" data-testid="remote-notes">
            {live.currentSlideNotes}
          </p>
        </div>
      ) : null}
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Ngayon</div>
        <p className={`whitespace-pre-line font-semibold leading-snug ${live.currentSlideNotes ? "text-lg text-zinc-300" : "text-3xl"}`}>{main}</p>
      </div>
      <div className="mt-auto border-t border-zinc-800 pt-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-sky-400">Next</div>
        <p className="whitespace-pre-line text-xl text-yellow-300">{next ? next.text || next.label : "(dulo ng item)"}</p>
      </div>
    </div>
  );
};

const AlertTab: React.FC<TabProps> = ({ snap, cmd, disabled }) => {
  const { live } = snap;
  const [text, setText] = useState(live.nurseryAlertText || "");
  return (
    <div className="mx-auto max-w-xl space-y-3 p-3">
      <div className={live.nurseryAlertActive ? "notice-warn" : "notice-info"} role="status">
        {live.nurseryAlertActive ? (
          <>
            <b>Nasa screen:</b> {live.nurseryAlertText}
          </>
        ) : (
          "Walang alert sa screen."
        )}
      </div>
      <label htmlFor="remote-alert" className="eyebrow block">
        Alert / message ticker
      </label>
      <textarea
        id="remote-alert"
        value={text}
        maxLength={200}
        rows={3}
        onChange={(e) => setText(e.target.value)}
        placeholder="hal. Nursery: Parent #104, paki-punta po sa Nursery"
        className="input min-h-24 w-full py-2 text-base"
      />
      <div className="grid grid-cols-2 gap-2">
        <button disabled={disabled || !text.trim()} onClick={() => cmd({ type: "alert", text: text.trim(), show: true })} className="btn btn-primary h-14 rounded-xl text-sm">
          {live.nurseryAlertActive ? "Update alert" : "Send alert"}
        </button>
        <button disabled={disabled || !live.nurseryAlertActive} onClick={() => cmd({ type: "alert", text: "", show: false })} className="btn btn-danger h-14 rounded-xl text-sm">
          Hide alert
        </button>
      </div>
    </div>
  );
};
