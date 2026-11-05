/**
 * 2026-10-29 (Jarvis): Phone remote (opened at /?remote on a phone on the same WiFi).
 *  - PIN login (PIN is shown on the laptop: Simulator → Output → Phone remote).
 *  - Live: current + next slide, Prev / Next, GO LIVE (laptop preview), Black / Clear / Logo.
 *    2026-11-05 (Mira): + "Prev song / Next song" — first slide of the item before / after the one
 *    on air, without going to the Schedule tab (separate buttons, so Next never jumps songs by accident).
 *  - Schedule: tap = select (laptop preview follows), ▶ or double-tap = LIVE.
 *  - Notes: big text for the preacher / worship leader (notes, current, next).
 *  - Alert: send / hide the message ticker.
 * Talks to the local server (remoteServer.ts) — Server-Sent Events in, small POSTs out.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Play, ListOrdered, MonitorPlay, StickyNote, AlertTriangle, LogOut, Image as ImageIcon } from "lucide-react";
import { LiveMainScreen } from "./LiveScreen";
import { SlideScreen } from "./SlideScreen";
import type { RemoteCmd, RemoteSnapshot } from "../lib/remoteLink";

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

type Tab = "live" | "schedule" | "notes" | "alert";
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
          <ScheduleTab snap={snap} cmd={cmd} disabled={disabled} />
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
      <nav className="grid shrink-0 grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]" aria-label="Remote">
        {(
          [
            ["live", "Live", MonitorPlay],
            ["schedule", "Schedule", ListOrdered],
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

const ScheduleTab: React.FC<TabProps> = ({ snap, cmd, disabled }) => {
  const { live, schedule, selected } = snap;
  const [open, setOpen] = useState<string | null>(live.activeScheduleItemId || selected.itemId);
  const liveRowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    liveRowRef.current?.scrollIntoView({ block: "center" });
  }, []);
  return (
    <div className="mx-auto max-w-xl space-y-1.5 p-3">
      <p className="px-1 pb-1 text-xs text-fg-subtle">Tap = piliin (preview sa laptop) · ▶ o double-tap = LIVE</p>
      {schedule.map((item, idx) => {
        const isOpen = open === item.id;
        const itemLive = live.isLive && live.activeScheduleItemId === item.id;
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
