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
 *  - 2026-11-17 (Jarvis): top-right menu — "Gawing screen" (this phone / tablet / TV browser shows the
 *    Projector or the Stage screen full screen, following the laptop) and "Background ng lyrics"
 *    (one schedule item or the whole schedule; the laptop does the change). Disconnect moved in there.
 * Talks to the local server (remoteServer.ts) — Server-Sent Events in, small POSTs out.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Play, MonitorPlay, LogOut, Image as ImageIcon, Music2, Minus, Plus, ArrowUp, ArrowDown, Trash2, Search, BookOpen, X, Megaphone, MoreVertical, MonitorUp, Maximize2, Check } from "lucide-react";
import { ChordSheet, nextPreview } from "./ChordSheet";
import { transposeKey } from "../lib/chords";
import { LiveMainScreen } from "./LiveScreen";
import { SlideScreen } from "./SlideScreen";
import { StageView, StagePrefs, loadStagePrefs, STAGE_PREFS_KEY } from "./StageScreen";
import type { RemoteCmd, RemoteSnapshot, RemoteLibrary, RemoteBackground, BibleLookupResult } from "../lib/remoteLink";
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
  // 2026-11-17: top-right menu, Background picker, and "Gawing screen" (remembered for this tab, so a TV that reloads stays a screen)
  const [sheet, setSheet] = useState<null | "menu" | "bg">(null);
  const [screen, setScreenState] = useState<ScreenKind | null>(readScreen);
  const setScreen = (k: ScreenKind | null) => {
    writeScreen(k);
    setScreenState(k);
    if (k) enterFullscreen();
    else leaveFullscreen();
  };

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
  const liveOnAir = !!live && live.isLive && !live.isBlackout;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas font-sans text-fg">
      {/* top bar — 2026-11-16 (Sanctuary): small status line, serif title of the tab, ON AIR pill (mockup) */}
      <header className="flex shrink-0 items-center gap-3 px-5 pb-2 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-fg-muted" role="status" data-testid="remote-status">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />
            <span className="truncate">Remote · {status.text}</span>
            <span className="shrink-0 font-mono tabular-nums text-fg-subtle">· {clock}</span>
          </div>
          <h1 className="font-display text-[26px] font-medium leading-tight tracking-tight">{TABS.find(([id]) => id === tab)?.[1]}</h1>
        </div>
        {live && (
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-[0.06em] ${
              liveOnAir ? "bg-live-soft text-live-text" : "bg-surface-3 text-fg-muted"
            }`}
            data-testid="remote-state"
          >
            <span className={`h-[7px] w-[7px] rounded-full ${liveOnAir ? "bg-live" : "bg-fg-subtle"}`} />
            {liveStateText(live)}
          </span>
        )}
        {/* 2026-11-17: menu = Gawing screen / Background / Disconnect (Disconnect used to be this button) */}
        <button onClick={() => setSheet("menu")} className="btn btn-ghost btn-icon touch-44 -mr-2 shrink-0 text-fg-muted" aria-label="Menu" title="Menu" aria-haspopup="dialog" data-testid="remote-menu">
          <MoreVertical className="h-5 w-5" />
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {!snap ? (
          <p className="p-6 text-center text-sm text-fg-muted">{hostOn ? "Hinihintay ang screen mula sa laptop…" : "Buksan ang Simulator tab sa laptop. (Kailangan ng Basic o Pro plan ang phone remote.)"}</p>
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
        <div role="status" className="pointer-events-none fixed inset-x-4 bottom-24 z-[60] rounded-lg bg-fg px-3 py-2 text-center text-sm text-canvas shadow-lg">
          {toast}
        </div>
      )}

      {sheet === "menu" && (
        <MenuSheet
          onClose={() => setSheet(null)}
          onScreen={(k) => {
            setSheet(null);
            setScreen(k);
          }}
          onBackground={() => setSheet("bg")}
          onDisconnect={() => {
            setSheet(null);
            logout();
          }}
        />
      )}
      {sheet === "bg" && <BackgroundSheet snap={snap} library={library} cmd={cmd} disabled={disabled} onClose={() => setSheet(null)} />}
      {screen && <RemoteScreen kind={screen} live={live} waiting={status.text} connected={!disabled} onExit={() => setScreen(null)} />}

      {/* bottom tabs — 2026-11-16 (Sanctuary): a floating pill with text tabs (mockup); all 6 tabs stay */}
      <nav className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2" aria-label="Remote">
        <div className="grid grid-cols-6 gap-0.5 rounded-lg border border-line bg-surface-2 p-1 min-[375px]:gap-1 min-[375px]:p-1.5">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={`relative min-w-0 rounded-md px-0 py-3 text-[10px] tracking-tight transition-colors min-[375px]:text-[11px] ${tab === id ? "bg-fg font-semibold text-canvas" : "font-medium text-fg-muted active:bg-surface-3"}`}
            >
              {label}
              {id === "alert" && (live?.nurseryAlertActive || live?.stageMessageActive) && (
                <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ${live.nurseryAlertActive ? "bg-live" : "bg-amber-400"}`} />
              )}
              {id === "live" && liveOnAir && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-live" />}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};

// 2026-11-16: tab list (bottom pill + title in the top bar)
const TABS = [
  ["live", "Live"],
  ["schedule", "Schedule"],
  ["library", "Library"],
  ["chords", "Chords"],
  ["notes", "Notes"],
  ["alert", "Alert"],
] as const;
const liveStateText = (live: RemoteSnapshot["live"]) =>
  live.isBlackout ? "Black" : live.isLogo ? "Logo" : live.isClearText ? "Text off" : live.isLive ? "On air" : "Standby";

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
  const onAir = live.isLive && !live.isBlackout;
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
      {/* 2026-11-16 (Sanctuary): coral gradient frame while on air; the state sits in the top bar's pill */}
      <div className={`rounded-lg p-[3px] ${onAir ? "remote-live-frame" : "bg-line"}`}>
        <div className="overflow-hidden rounded-md" data-testid="remote-live" aria-label={`LIVE: ${live.currentSlideLabel || "—"}`}>
          <LiveMainScreen liveState={live} operator fade={false} playVideo={false} />
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 p-3">
        <div className="w-24 shrink-0 overflow-hidden rounded-md ring-1 ring-line">
          {next ? <SlideScreen slide={next} background={next.background} textScale={6} textStyle={next.textStyle} bgSettings={next.bgSettings} ariaHidden /> : <div className="grid aspect-video place-items-center bg-surface-2 text-xs text-fg-subtle">Wala na</div>}
        </div>
        <div className="min-w-0 text-xs">
          <div className="eyebrow mb-0.5 tracking-[0.14em] text-accent-text">Next</div>
          <div className="truncate text-sm text-fg">{next ? next.label : "(dulo ng item)"}</div>
          <div className="line-clamp-2 text-fg-muted">{next?.text.split("\n")[0]}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button disabled={disabled} onClick={() => cmd({ type: "prev" })} className="btn btn-secondary h-16 rounded-lg text-[15px] font-semibold" aria-label="Previous slide">
          <ChevronLeft className="h-5 w-5" /> Prev
        </button>
        <button disabled={disabled} onClick={() => cmd({ type: "next" })} className="btn btn-secondary h-16 rounded-lg text-[15px] font-semibold" aria-label="Next slide">
          Next <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <button disabled={disabled} onClick={() => cmd({ type: "golive" })} className="btn btn-live h-16 w-full rounded-lg text-base tracking-[0.04em]" aria-label="Go live with the laptop preview">
        {/* 2026-11-15: coral like the laptop's GO LIVE (Sanctuary look) */}
        <Play className="h-4 w-4 fill-current" />
        GO LIVE
        <span className="min-w-0 truncate text-sm font-normal tracking-normal text-white/85">· {selSlide ? `${selItem?.title} — ${selSlide.label}` : "preview"}</span>
      </button>

      <div className="grid grid-cols-3 gap-2">
        <button
          disabled={disabled}
          onClick={() => cmd({ type: "black" })}
          aria-pressed={live.isBlackout}
          className={`btn h-12 rounded-md text-sm ${live.isBlackout ? "bg-fg text-canvas" : "btn-secondary"}`}
        >
          Black
        </button>
        <button
          disabled={disabled}
          onClick={() => cmd({ type: "clear" })}
          aria-pressed={live.isClearText}
          className={`btn h-12 rounded-md text-sm ${live.isClearText ? "bg-warn-soft text-warn-text ring-1 ring-warn/60" : "btn-secondary"}`}
        >
          Clear
        </button>
        <button
          disabled={disabled}
          onClick={() => cmd({ type: "logo" })}
          aria-pressed={live.isLogo}
          className={`btn h-12 rounded-md text-sm ${live.isLogo ? "bg-accent-soft text-accent-text ring-1 ring-accent/60" : "btn-secondary"}`}
        >
          Logo
        </button>
      </div>

      {/* 2026-11-16: below the main controls now, so GO LIVE is reachable without scrolling */}
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

// 2026-11-15 (Mira): Alert tab = Projector (nursery ticker, congregation) or Stage (announcement for the musicians)
const AlertTab: React.FC<TabProps> = (props) => {
  const [target, setTarget] = useState<"projector" | "stage">("projector");
  return (
    <div className="mx-auto max-w-xl space-y-3 p-3">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-3 p-1" role="tablist" aria-label="Saan ipapakita">
        {(
          [
            ["projector", "Projector", "congregation"],
            ["stage", "Stage", "musicians"],
          ] as const
        ).map(([id, label, sub]) => (
          <button
            key={id}
            role="tab"
            aria-selected={target === id}
            onClick={() => setTarget(id)}
            className={`flex h-12 flex-col items-center justify-center rounded-lg text-sm font-semibold leading-tight ${target === id ? "bg-surface text-accent-text shadow-sm" : "text-fg-muted"}`}
            data-testid={`remote-alert-${id}`}
          >
            {label}
            <span className="text-xs font-normal opacity-80">{sub}</span>
          </button>
        ))}
      </div>
      {target === "projector" ? <ProjectorAlert {...props} /> : <StageAlert {...props} />}
    </div>
  );
};

const ProjectorAlert: React.FC<TabProps> = ({ snap, cmd, disabled }) => {
  const { live } = snap;
  const [text, setText] = useState(live.nurseryAlertText || "");
  return (
    <div className="space-y-3">
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

const STAGE_PRESETS = ["Ulitin ang chorus", "Last chorus", "Bridge", "Slow down", "Key up", "Tapusin na"];
const STAGE_PREVIEW_PREFS = { transpose: 0, size: 1, chords: true };

/** 2026-11-15 (Mira): announcement shown only on the Stage screen (TV of the musicians). */
const StageAlert: React.FC<TabProps> = ({ snap, cmd, disabled }) => {
  const { live } = snap;
  const [text, setText] = useState("");
  const [blink, setBlink] = useState(true);
  const clock = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const t = text.trim();
  return (
    <div className="space-y-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl ring-1 ring-line" data-testid="remote-stage-preview">
        <StageView state={live} prefs={STAGE_PREVIEW_PREFS} clock={clock} draft={text} />
      </div>
      <div className={live.stageMessageActive ? "notice-warn" : "notice-info"} role="status">
        {live.stageMessageActive ? (
          <>
            <b>Nasa Stage:</b> {live.stageMessageText}
          </>
        ) : (
          "Walang announcement sa Stage screen."
        )}
      </div>
      <label htmlFor="remote-stage-msg" className="eyebrow block">
        Mensahe sa musicians
      </label>
      <input
        id="remote-stage-msg"
        type="text"
        value={text}
        maxLength={200}
        onChange={(e) => setText(e.target.value)}
        placeholder="hal. Ulitin ang chorus"
        className="input h-12 w-full text-base"
      />
      <div className="grid grid-cols-2 gap-2">
        {STAGE_PRESETS.map((p) => (
          <button key={p} onClick={() => setText(p)} aria-pressed={text === p} className={`btn h-12 rounded-xl text-sm ${text === p ? "bg-accent-soft text-accent-text ring-1 ring-accent/60" : "btn-secondary"}`}>
            {p}
          </button>
        ))}
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
        <input type="checkbox" checked={blink} onChange={() => setBlink((b) => !b)} className="h-4 w-4 accent-[var(--c-accent)]" />
        Kumislap pag bagong labas
      </label>
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <button disabled={disabled || !t} onClick={() => cmd({ type: "stage-msg", text: t, show: true, blink })} className="btn btn-primary h-14 rounded-xl text-sm" data-testid="remote-stage-send">
          <Megaphone className="h-4 w-4" />
          {live.stageMessageActive ? "Update sa Stage" : "Send sa Stage"}
        </button>
        <button disabled={disabled || !live.stageMessageActive} onClick={() => cmd({ type: "stage-msg", text: "", show: false, blink: false })} className="btn btn-danger h-14 rounded-xl text-sm">
          Hide
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- 2026-11-17 (Jarvis): menu · Gawing screen · Background

type ScreenKind = "main" | "stage";
const SCREEN_KEY = "wtp-remote-screen";
const readScreen = (): ScreenKind | null => {
  try {
    const v = sessionStorage.getItem(SCREEN_KEY);
    return v === "main" || v === "stage" ? v : null;
  } catch {
    return null;
  }
};
const writeScreen = (k: ScreenKind | null) => {
  try {
    if (k) sessionStorage.setItem(SCREEN_KEY, k);
    else sessionStorage.removeItem(SCREEN_KEY);
  } catch {
    /* storage blocked — works until reload */
  }
};
// Fullscreen needs a tap (browser rule) and is missing on iPhone Safari: both fail quietly, the screen still fills the page.
const enterFullscreen = () => {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
};
const leaveFullscreen = () => {
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
};

const MenuSheet: React.FC<{ onClose: () => void; onScreen: (k: ScreenKind) => void; onBackground: () => void; onDisconnect: () => void }> = ({ onClose, onScreen, onBackground, onDisconnect }) => (
  <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/60" onClick={onClose} role="dialog" aria-modal="true" aria-label="Menu" data-testid="remote-menu-sheet">
    <div className="space-y-4 rounded-t-2xl border-t border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4" onClick={(e) => e.stopPropagation()}>
      <div>
        <div className="eyebrow mb-1.5">Gawing screen ang device na ito</div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => onScreen("main")} className="btn btn-secondary h-14 rounded-xl text-sm" data-testid="remote-screen-main">
            <MonitorUp className="h-4 w-4" />
            Projector (lyrics)
          </button>
          <button onClick={() => onScreen("stage")} className="btn btn-secondary h-14 rounded-xl text-sm" data-testid="remote-screen-stage">
            <Music2 className="h-4 w-4" />
            Stage (chords)
          </button>
        </div>
        <p className="mt-1.5 text-xs text-fg-subtle">Full screen na susunod sa laptop. Para sa tablet o TV na nasa parehong WiFi. Tap sa screen para lumabas.</p>
      </div>
      <button onClick={onBackground} className="btn btn-secondary h-14 w-full rounded-xl text-sm" data-testid="remote-open-bg">
        <ImageIcon className="h-4 w-4" />
        Background ng lyrics
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onDisconnect} className="btn btn-ghost h-12 rounded-xl text-sm text-fg-muted" data-testid="remote-disconnect">
          <LogOut className="h-4 w-4" />
          Disconnect
        </button>
        <button onClick={onClose} className="btn btn-ghost h-12 rounded-xl text-sm">
          Isara
        </button>
      </div>
    </div>
  </div>
);

/**
 * This device as a screen: "main" = what the projector shows, "stage" = lyrics with chords for musicians.
 * It only follows the laptop (never sends anything). Pictures are the small copies phones get, and a
 * video background shows as its still picture. The screen is kept awake where the browser allows it.
 */
const RemoteScreen: React.FC<{ kind: ScreenKind; live: RemoteSnapshot["live"] | undefined; waiting: string; connected: boolean; onExit: () => void }> = ({ kind, live, waiting, connected, onExit }) => {
  const [bar, setBar] = useState(true);
  const [prefs, setPrefs] = useState<StagePrefs>(loadStagePrefs);
  const [clock, setClock] = useState("");
  const [isFull, setIsFull] = useState(() => !!document.fullscreenElement);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showBar = useCallback(() => {
    setBar(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setBar(false), 4000);
  }, []);
  useEffect(() => {
    showBar();
    return () => clearTimeout(hideTimer.current);
  }, [showBar]);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    tick();
    const t = setInterval(tick, 10000);
    const onFs = () => setIsFull(!!document.fullscreenElement);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.fullscreenElement && onExit();
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(t);
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("keydown", onKey);
    };
  }, [onExit]);

  // keep the screen on (Screen Wake Lock; it is dropped when the page is hidden, so ask again when it is back)
  useEffect(() => {
    type Lock = { release: () => Promise<void> };
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Lock> } }).wakeLock;
    if (!wl) return;
    let lock: Lock | null = null;
    let stopped = false;
    const get = () => {
      if (document.hidden) return;
      wl.request("screen")
        .then((l) => {
          if (stopped) void l.release().catch(() => {});
          else lock = l;
        })
        .catch(() => {});
    };
    get();
    document.addEventListener("visibilitychange", get);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", get);
      void lock?.release().catch(() => {});
    };
  }, []);

  const setPref = (x: Partial<StagePrefs>) =>
    setPrefs((prev) => {
      const next = { ...prev, ...x };
      try {
        localStorage.setItem(STAGE_PREFS_KEY, JSON.stringify(next));
      } catch {
        /* storage blocked */
      }
      return next;
    });

  const wait = (
    <div className="grid h-full w-full place-items-center bg-black p-6 text-center text-sm text-zinc-500" data-testid="remote-screen-waiting">
      Naghihintay sa laptop… ({waiting})
    </div>
  );
  const barBtn = "touch-44 inline-flex items-center justify-center gap-1 rounded-md px-2 text-sm hover:bg-white/10";

  return (
    <div className={`fixed inset-0 z-50 grid place-items-center overflow-hidden bg-black text-white ${bar ? "" : "cursor-none"}`} onClick={showBar} onMouseMove={showBar} data-testid="remote-screen" data-kind={kind}>
      {kind === "main" ? (
        // 16:9 box that fits the device (black bars where it does not)
        <div style={{ width: "min(100vw, calc(100dvh * 16 / 9))" }}>{live ? <LiveMainScreen liveState={live} playVideo={false} /> : <div className="aspect-video w-full">{wait}</div>}</div>
      ) : live ? (
        <StageView state={live} prefs={prefs} clock={clock} />
      ) : (
        wait
      )}

      {/* controls: shown for a few seconds after a tap */}
      <div
        className={`fixed inset-x-0 top-0 flex flex-wrap items-center gap-1 bg-zinc-950/90 px-2 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] text-zinc-200 ring-1 ring-white/10 transition-opacity duration-300 ${
          bar ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          showBar();
        }}
        data-testid="remote-screen-bar"
      >
        <span className="inline-flex items-center gap-1.5 px-1 text-xs">
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-ok" : "bg-warn"}`} />
          {kind === "main" ? "Projector" : "Stage"}
        </span>
        {kind === "stage" && (
          <>
            <span className="mx-1 h-5 w-px bg-white/15" />
            <span className="text-xs text-zinc-500">Key</span>
            <button onClick={() => setPref({ transpose: Math.max(-11, prefs.transpose - 1) })} className={barBtn} aria-label="Transpose down">
              <Minus className="h-4 w-4" />
            </button>
            <button onClick={() => setPref({ transpose: 0 })} className="min-w-9 rounded-md px-1 py-2 font-mono text-sm tabular-nums hover:bg-white/10" title="Balik sa orihinal">
              {prefs.transpose > 0 ? `+${prefs.transpose}` : prefs.transpose}
            </button>
            <button onClick={() => setPref({ transpose: Math.min(11, prefs.transpose + 1) })} className={barBtn} aria-label="Transpose up">
              <Plus className="h-4 w-4" />
            </button>
            <button onClick={() => setPref({ size: Math.max(0.6, +(prefs.size - 0.1).toFixed(2)) })} className={barBtn} aria-label="Mas maliit na text">
              A−
            </button>
            <button onClick={() => setPref({ size: Math.min(1.8, +(prefs.size + 0.1).toFixed(2)) })} className={barBtn} aria-label="Mas malaking text">
              A+
            </button>
            <button onClick={() => setPref({ chords: !prefs.chords })} className={`${barBtn} ${prefs.chords ? "bg-amber-400/20 text-amber-200" : ""}`} aria-pressed={prefs.chords}>
              <Music2 className="h-4 w-4" />
              Chords
            </button>
          </>
        )}
        <span className="ml-auto" />
        {!isFull && !!document.documentElement.requestFullscreen && (
          <button onClick={enterFullscreen} className={barBtn}>
            <Maximize2 className="h-4 w-4" />
            Fullscreen
          </button>
        )}
        <button onClick={onExit} className={`${barBtn} bg-white/10 font-semibold`} data-testid="remote-screen-exit">
          <X className="h-4 w-4" />
          Lumabas
        </button>
      </div>
    </div>
  );
};

/** Lyrics background from the phone: one schedule item, or the whole schedule (every item now + the ones added later). */
const BackgroundSheet: React.FC<{ snap: RemoteSnapshot | null; library: RemoteLibrary | null; cmd: (c: RemoteCmd) => void; disabled: boolean; onClose: () => void }> = ({ snap, library, cmd, disabled, onClose }) => {
  const [scope, setScope] = useState<"item" | "all">("item");
  const items = snap?.schedule ?? [];
  // default target: the item on air, else the one selected on the laptop
  const onAirId = snap?.live.isLive ? snap.live.activeScheduleItemId : null;
  const fallbackId = (onAirId && items.some((i) => i.id === onAirId) ? onAirId : snap?.selected.itemId) || items[0]?.id || "";
  const [picked, setPicked] = useState("");
  const target = items.find((i) => i.id === picked) ?? items.find((i) => i.id === fallbackId);
  const all = scope === "all";
  const current = all ? snap?.allBg ?? null : target?.bg ?? null;
  const backgrounds = library?.backgrounds;
  const canPick = !disabled && (all || !!target);
  const pick = (bgId: string | null) => {
    if (!canPick) return;
    cmd(all ? { type: "set-bg", scope: "all", bgId } : { type: "set-bg", scope: "item", itemId: target!.id, bgId });
  };
  const tile = (b: RemoteBackground) => {
    const selected = current === b.id;
    return (
      <button
        key={b.id}
        onClick={() => pick(b.id)}
        disabled={!canPick}
        aria-pressed={selected}
        aria-label={`Background: ${b.name}${b.kind === "video" ? " (video)" : ""}`}
        className={`relative overflow-hidden rounded-lg border text-left disabled:opacity-50 ${selected ? "border-accent ring-2 ring-accent" : "border-line"}`}
        data-bg-id={b.id}
      >
        <div className="aspect-video bg-black" style={b.css ? { background: b.css } : undefined}>
          {b.thumb && <img src={b.thumb} alt="" className="h-full w-full object-cover" draggable={false} />}
        </div>
        {b.kind === "video" && <span className="absolute left-1 top-1 rounded bg-black/70 px-1 font-mono text-[10px] text-white">VIDEO</span>}
        {selected && (
          <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-accent text-on-accent">
            <Check className="h-3 w-3" />
          </span>
        )}
        <div className="truncate bg-surface-2 px-1.5 py-1 text-[11px] text-fg">{b.name}</div>
      </button>
    );
  };
  const uploads = backgrounds?.filter((b) => b.kind !== "built-in") ?? [];
  const builtIn = backgrounds?.filter((b) => b.kind === "built-in") ?? [];

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-canvas text-fg" role="dialog" aria-modal="true" aria-label="Background ng lyrics" data-testid="remote-bg-sheet">
      <header className="flex shrink-0 items-center gap-2 px-5 pb-2 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <h1 className="min-w-0 flex-1 truncate font-display text-[22px] font-medium leading-tight tracking-tight">Background ng lyrics</h1>
        <button onClick={onClose} className="btn btn-ghost btn-icon touch-44 -mr-2 shrink-0" aria-label="Isara" data-testid="remote-bg-close">
          <X className="h-5 w-5" />
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="seg grid grid-cols-2" role="group" aria-label="Para saan ang background">
          <button onClick={() => setScope("item")} aria-pressed={!all} className="seg-item min-h-11" data-testid="remote-bg-scope-item">
            Isang kanta / item
          </button>
          <button onClick={() => setScope("all")} aria-pressed={all} className="seg-item min-h-11" data-testid="remote-bg-scope-all">
            Buong schedule
          </button>
        </div>

        {all ? (
          <p className="text-xs text-fg-muted">Lahat ng {items.length} item sa schedule, pati ang mga idadagdag pa. Ang PowerPoint slides na may sariling larawan ay hindi nagbabago.</p>
        ) : items.length === 0 ? (
          <p className="notice-info text-sm">Walang laman ang schedule.</p>
        ) : (
          <label className="block text-xs text-fg-muted">
            Para sa
            <select value={target?.id ?? ""} onChange={(e) => setPicked(e.target.value)} className="input mt-1 h-12 w-full text-base" data-testid="remote-bg-item">
              {items.map((i, n) => (
                <option key={i.id} value={i.id}>
                  {n + 1}. {i.title}
                  {i.id === onAirId ? " (LIVE)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        {disabled && <p className="notice-warn text-sm">Hindi konektado sa laptop.</p>}

        {!backgrounds ? (
          <p className="notice-info text-sm">Hinihintay ang listahan ng background mula sa laptop. Kung matagal, i-reload ang app sa laptop.</p>
        ) : (
          <>
            {uploads.length > 0 && (
              <div>
                <div className="eyebrow mb-1.5">Mga upload sa laptop</div>
                <div className="grid grid-cols-3 gap-2" data-testid="remote-bg-uploads">
                  {uploads.map(tile)}
                </div>
              </div>
            )}
            <div>
              <div className="eyebrow mb-1.5">Kasama sa app</div>
              <div className="grid grid-cols-3 gap-2" data-testid="remote-bg-builtin">
                {builtIn.map(tile)}
              </div>
            </div>
            {uploads.length === 0 && <p className="text-xs text-fg-subtle">Para sa sariling larawan o video: i-upload muna sa Media tab ng laptop, tapos lalabas dito.</p>}
          </>
        )}

        <button onClick={() => pick(null)} disabled={!canPick} className="btn btn-secondary h-12 w-full rounded-xl text-sm" data-testid="remote-bg-remove">
          <X className="h-4 w-4" />
          Alisin ang background{all ? " ng lahat" : ""}
        </button>
      </div>
    </div>
  );
};
