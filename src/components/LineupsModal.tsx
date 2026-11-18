/**
 * 2026-11-16: Lineups — save the Schedule under a name + service date, and open it again later
 * (Schedule → Lineups). Paid feature (Basic / Pro); without it the window explains how to unlock.
 * See lib/lineupStore.ts.
 */
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, FolderOpen, Lock, Save, Trash2, X } from "lucide-react";
import type { ScheduleItem } from "../types";
import type { AuthState } from "../lib/auth";
import { openAccount } from "../lib/auth";
import { LINEUP_NAME_MAX, LineupMeta, deleteLineup, getCurrentLineupId, listLineups, loadLineup, nextSunday, saveLineup, setCurrentLineupId, watchLineups } from "../lib/lineupStore";

interface Props {
  /** false = the account's plan has no saved lineups. */
  allowed: boolean;
  auth: AuthState;
  /** The working Schedule (what gets saved). */
  items: ScheduleItem[];
  /** Something is on the projector right now (opening another lineup may put it on Standby). */
  isLive: boolean;
  /** Replaces the working Schedule with a saved lineup. */
  onOpen: (items: ScheduleItem[], meta: LineupMeta) => void;
  onClose: () => void;
}

const inputCls =
  "w-full bg-canvas text-fg placeholder:text-fg-subtle px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

function niceDate(iso: string): string {
  if (!iso) return "Walang petsa";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

export const LineupsModal: React.FC<Props> = ({ allowed, auth, items, isLive, onOpen, onClose }) => {
  const [list, setList] = useState<LineupMeta[] | null>(null);
  const [currentId, setCurrentId] = useState(getCurrentLineupId);
  const [name, setName] = useState("Sunday Service");
  const [serviceDate, setServiceDate] = useState(() => nextSunday());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);

  const refresh = () => listLineups().then(setList);
  useEffect(() => {
    if (!allowed) return;
    void refresh();
    return watchLineups(() => void refresh()); // a lineup saved on another computer arrives by sync
  }, [allowed]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (into?: LineupMeta) => {
    if (busy) return;
    const n = (into ? into.name : name).trim();
    if (!n) return setNotice({ text: "Lagyan ng pangalan ang lineup.", tone: "warn" });
    if (into && !window.confirm(`Papalitan ang laman ng "${into.name}" ng kasalukuyang Schedule. Ituloy?`)) return;
    setBusy(true);
    const meta = await saveLineup({ id: into?.id, name: n, serviceDate: into ? into.serviceDate : serviceDate, items });
    setBusy(false);
    if (!meta) return setNotice({ text: "Hindi na-save ang lineup (puno na o hindi magamit ang storage ng browser).", tone: "warn" });
    setCurrentLineupId(meta.id);
    setCurrentId(meta.id);
    setNotice({ text: `Na-save ang "${meta.name}" (${meta.count} item${meta.count === 1 ? "" : "s"}).`, tone: "ok" });
    void refresh();
  };

  const open = async (m: LineupMeta) => {
    if (busy) return;
    const warn = isLive ? " Kung wala sa lineup na iyon ang naka-LIVE ngayon, magiging Standby ang projector." : "";
    if (!window.confirm(`Bubuksan ang "${m.name}" at papalitan ang kasalukuyang Schedule. Ang hindi pa na-save na pagbabago ay mawawala.${warn} Ituloy?`)) return;
    setBusy(true);
    const loaded = await loadLineup(m.id);
    setBusy(false);
    if (!loaded) return setNotice({ text: "Hindi mabasa ang lineup na iyon.", tone: "warn" });
    setCurrentLineupId(m.id);
    onOpen(loaded, m);
    onClose();
  };

  const remove = async (m: LineupMeta) => {
    if (busy || !window.confirm(`Buburahin ang lineup na "${m.name}". Hindi nito ginagalaw ang kasalukuyang Schedule. Ituloy?`)) return;
    setBusy(true);
    const ok = await deleteLineup(m.id);
    setBusy(false);
    if (ok && m.id === currentId) {
      setCurrentLineupId("");
      setCurrentId("");
    }
    setNotice(ok ? { text: `Nabura ang "${m.name}".`, tone: "ok" } : { text: "Hindi nabura ang lineup.", tone: "warn" });
    void refresh();
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Lineups">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-surface w-full sm:max-w-lg max-h-[90dvh] flex flex-col rounded-t-xl sm:rounded-xl shadow-lg border border-line" data-testid="lineups-modal">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h3 className="text-base font-bold text-fg">Lineups</h3>
          <button type="button" onClick={onClose} className="p-2 -mr-2 rounded-lg text-fg-subtle hover:bg-surface-3" aria-label="Isara">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!allowed ? (
          <div className="p-4 space-y-3 text-sm text-fg-muted" data-testid="lineups-locked">
            <p className="inline-flex items-center gap-1.5 font-semibold text-fg">
              <Lock className="h-4 w-4" />
              Para sa Basic at Pro plan ang Lineups
            </p>
            <p>I-save ang Schedule bawat service (hal. bawat Linggo), ihanda nang maaga ang susunod, at buksan ulit ang mga dati. Libre pa rin ang kasalukuyang Schedule.</p>
            {auth.status === "user" ? (
              <>
                <p className="notice-warn text-xs">Free ang plan ng account na <span className="break-all text-fg">{auth.name}</span>.</p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    openAccount();
                  }}
                  className="btn btn-primary btn-sm"
                  data-testid="lineups-locked-plans"
                >
                  Tingnan ang plans
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openAccount();
                }}
                className="btn btn-primary btn-sm"
                data-testid="lineups-locked-login"
              >
                Mag-login o gumawa ng account
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            <div className="space-y-2 rounded-lg border border-line bg-surface-2 p-3">
              <div className="text-xs font-semibold text-fg">
                I-save ang kasalukuyang Schedule bilang bagong lineup ({items.length} item{items.length === 1 ? "" : "s"})
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={LINEUP_NAME_MAX} placeholder="hal. Sunday Service" aria-label="Pangalan ng lineup" data-testid="lineup-name" />
                <input className={inputCls} type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} aria-label="Petsa ng service" data-testid="lineup-date" />
              </div>
              <button type="button" onClick={() => save()} disabled={busy} className="btn btn-primary btn-sm" data-testid="lineup-save-new">
                <Save className="h-3.5 w-3.5" /> I-save bilang bago
              </button>
            </div>

            {notice && (
              <p role="status" className={`text-xs ${notice.tone === "ok" ? "notice-ok" : "notice-warn"}`} data-testid="lineup-notice">
                {notice.text}
              </p>
            )}

            <div>
              <div className="eyebrow mb-1.5">Mga naka-save</div>
              {list === null ? (
                <p className="text-xs text-fg-subtle">Naglo-load…</p>
              ) : list.length === 0 ? (
                <p className="text-xs text-fg-subtle">Wala pang naka-save na lineup.</p>
              ) : (
                <ul className="space-y-1.5" data-testid="lineup-list">
                  {list.map((m) => (
                    <li key={m.id} className={`rounded-lg border p-2.5 ${m.id === currentId ? "border-accent bg-surface-2" : "border-line"}`} data-testid="lineup-row">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-fg">{m.name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-subtle">
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays className="h-3 w-3" />
                              {niceDate(m.serviceDate)}
                            </span>
                            <span>
                              {m.count} item{m.count === 1 ? "" : "s"}
                            </span>
                            {m.id === currentId && <span className="text-accent-text">kasalukuyang bukas</span>}
                          </div>
                        </div>
                        <button type="button" onClick={() => remove(m)} disabled={busy} className="btn btn-ghost btn-icon shrink-0" title="Burahin ang lineup" aria-label={`Burahin ang ${m.name}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => open(m)} disabled={busy} className="btn btn-secondary btn-sm" data-testid="lineup-open">
                          <FolderOpen className="h-3.5 w-3.5" /> Buksan
                        </button>
                        <button type="button" onClick={() => save(m)} disabled={busy} className="btn btn-ghost btn-sm" title="Palitan ang laman nito ng kasalukuyang Schedule" data-testid="lineup-overwrite">
                          <Save className="h-3.5 w-3.5" /> I-save dito
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-xs text-fg-subtle">Naka-save sa browser ng laptop na ito. Sa Pro plan, kasama ito sa cloud sync (makikita rin sa ibang computer ng simbahan).</p>
          </div>
        )}
      </div>
    </div>,
    // 2026-11-18: portal to <body> — the frosted-glass backdrop-filter on .panel/header
    // (app background on) traps position:fixed inside the panel, so dialogs got squeezed.
    document.body,
  );
};
