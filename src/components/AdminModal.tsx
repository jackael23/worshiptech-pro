/**
 * 2026-11-22 (Mira): Admin window — Jack sees every account and sets its plan (Free / Basic / Pro)
 * and end date. Opened from the Account window; the button shows only for ADMIN_UIDS (lib/admin.ts).
 * The real lock is firestore.rules: for anyone else every read and write here is refused.
 */
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, Search, Shield, X } from "lucide-react";
import { ACCOUNT_ID_RE, AdminUser, describeAdminError, getUser, listUsers, setPlan } from "../lib/admin";
import { PLAN_LABEL, Plan } from "../lib/entitlements";

interface Props {
  onClose: () => void;
  /** Called after a save (the admin may have changed their own plan). */
  onChanged?: () => void;
}

type ExpiryChoice = "none" | "1m" | "1y" | "date";

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");

/** +months from the current end date when it is still in the future (a renewal), else from today. */
function addMonths(fromIso: string | null, months: number): Date {
  const base = fromIso && Date.parse(fromIso) > Date.now() ? new Date(fromIso) : new Date();
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

export const AdminModal: React.FC<Props> = ({ onClose, onChanged }) => {
  const [rows, setRows] = useState<AdminUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [manualId, setManualId] = useState("");
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [plan, setPlanChoice] = useState<Plan>("pro");
  const [expiry, setExpiry] = useState<ExpiryChoice>("1m");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listUsers());
    } catch (e) {
      setError(describeAdminError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Capture phase + stop: Escape closes only this window, not the Account window under it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (editing) setEditing(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!rows) return [];
    return q ? rows.filter((r) => r.email.includes(q) || r.name.toLowerCase().includes(q) || r.uid.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  const startEdit = (u: AdminUser) => {
    setEditing(u);
    setPlanChoice(u.savedPlan && u.savedPlan !== "free" ? u.savedPlan : "pro");
    setExpiry(u.savedPlan && u.savedPlan !== "free" && !u.expiresAt ? "none" : "1m");
    setDate(u.expiresAt ? u.expiresAt.slice(0, 10) : "");
    setMsg(null);
  };

  const openManual = async () => {
    const id = manualId.trim();
    if (!ACCOUNT_ID_RE.test(id)) return setMsg("Mali ang Account ID. Kopyahin ito mula sa Account window ng user.");
    const known = rows?.find((r) => r.uid === id);
    if (known) return startEdit(known);
    setBusy(true);
    try {
      const u = await getUser(id);
      startEdit(u ?? { uid: id, email: "", name: "", lastSeen: null, plan: "free", savedPlan: null, expiresAt: null });
      if (!u) setMsg("Wala pang record ang Account ID na ito. Puwede pa ring i-set ang plan; siguraduhing tama ang ID.");
    } catch (e) {
      setMsg(describeAdminError(e));
    } finally {
      setBusy(false);
    }
  };

  const endDate = (): Date | null | "bad" => {
    if (plan === "free" || expiry === "none") return null;
    if (expiry === "1m") return addMonths(editing?.expiresAt ?? null, 1);
    if (expiry === "1y") return addMonths(editing?.expiresAt ?? null, 12);
    const t = Date.parse(date + "T23:59:59");
    return Number.isFinite(t) ? new Date(t) : "bad";
  };

  const save = async () => {
    if (!editing || busy) return;
    const end = endDate();
    if (end === "bad") return setMsg("Pumili ng petsa.");
    const who = editing.email || editing.uid;
    const text = `${who}: ${PLAN_LABEL[plan]}${plan === "free" ? "" : end ? ` hanggang ${fmtDate(end.toISOString())}` : ", walang katapusan"}. I-save?`;
    if (!window.confirm(text)) return;
    setBusy(true);
    setMsg(null);
    try {
      await setPlan(editing.uid, plan, end);
      setEditing(null);
      setMsg(`Na-save: ${who} → ${PLAN_LABEL[plan]}. Makikita ito ng user pagka-reload o pagbukas ng Account window.`);
      onChanged?.();
      await load();
    } catch (e) {
      setMsg(describeAdminError(e));
    } finally {
      setBusy(false);
    }
  };

  const nextEnd = editing ? endDate() : null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Admin">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-surface w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto flex flex-col rounded-t-xl sm:rounded-xl shadow-lg border border-line" data-testid="admin-modal">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h3 className="text-base font-bold text-fg inline-flex items-center gap-2">
            <Shield className="w-4 h-4" /> Admin: mga plan
          </h3>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => void load()} disabled={loading} className="p-2 rounded-lg text-fg-subtle hover:bg-surface-3" aria-label="I-refresh" title="I-refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button type="button" onClick={onClose} className="p-2 -mr-2 rounded-lg text-fg-subtle hover:bg-surface-3" aria-label="Isara">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3 text-sm">
          {error && (
            <p role="alert" className="notice-warn text-xs" data-testid="admin-error">
              {error}
            </p>
          )}

          {editing ? (
            <div className="rounded-lg border border-line bg-surface-2 p-3 space-y-3" data-testid="admin-edit">
              <div>
                <div className="font-semibold text-fg break-all">{editing.email || "(walang email pa)"}</div>
                <div className="text-xs text-fg-subtle break-all">
                  {editing.name ? `${editing.name} · ` : ""}
                  {editing.uid}
                </div>
                <div className="text-xs text-fg-muted mt-1">
                  Ngayon: <strong className="text-fg">{PLAN_LABEL[editing.plan]}</strong>
                  {editing.expiresAt ? ` · hanggang ${fmtDate(editing.expiresAt)}` : editing.plan !== "free" ? " · walang katapusan" : ""}
                </div>
              </div>

              <div className="flex gap-1.5" role="radiogroup" aria-label="Plan">
                {(["free", "basic", "pro"] as Plan[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={plan === p}
                    onClick={() => setPlanChoice(p)}
                    className={`btn btn-sm flex-1 ${plan === p ? "btn-primary" : "btn-secondary"}`}
                    data-testid={`admin-plan-${p}`}
                  >
                    {PLAN_LABEL[p]}
                  </button>
                ))}
              </div>

              {plan !== "free" && (
                <div className="space-y-1.5">
                  <div className="text-xs text-fg-muted">Hanggang kailan</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ["1m", "+1 buwan"],
                        ["1y", "+1 taon"],
                        ["none", "Walang katapusan"],
                        ["date", "Petsa"],
                      ] as [ExpiryChoice, string][]
                    ).map(([k, label]) => (
                      <button key={k} type="button" onClick={() => setExpiry(k)} className={`btn btn-sm ${expiry === k ? "btn-primary" : "btn-secondary"}`} data-testid={`admin-exp-${k}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {expiry === "date" && <input type="date" className="input text-xs" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Petsa ng katapusan" />}
                  <p className="text-xs text-fg-subtle">
                    {nextEnd === "bad" ? "Pumili ng petsa." : nextEnd ? `Matatapos: ${fmtDate(nextEnd.toISOString())} (may 3 araw pang palugit).` : "Walang katapusan."}
                    {(expiry === "1m" || expiry === "1y") && editing.expiresAt && Date.parse(editing.expiresAt) > Date.now() ? " Idinagdag sa kasalukuyang petsa." : ""}
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <button type="button" onClick={() => void save()} disabled={busy} className="btn btn-primary btn-sm" data-testid="admin-save">
                  {busy ? "Sandali…" : "I-save"}
                </button>
                <button type="button" onClick={() => setEditing(null)} disabled={busy} className="btn btn-secondary btn-sm">
                  Kanselahin
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
                <input className="input w-full pl-8 text-xs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hanapin: email, pangalan o Account ID" aria-label="Hanapin ang user" data-testid="admin-search" />
              </div>

              {rows === null && !error ? (
                <p className="text-xs text-fg-subtle">Kinukuha ang listahan…</p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line" data-testid="admin-list">
                  {shown.length === 0 && <li className="p-3 text-xs text-fg-subtle">Walang nakita.</li>}
                  {shown.map((u) => (
                    <li key={u.uid} className="p-2.5 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-fg font-medium truncate">{u.email || u.uid}</div>
                        <div className="text-xs text-fg-subtle truncate">
                          {u.name ? `${u.name} · ` : ""}huling login {fmtDate(u.lastSeen)}
                        </div>
                      </div>
                      <div className="text-right text-xs shrink-0">
                        <div className="font-semibold text-fg">{PLAN_LABEL[u.plan]}</div>
                        <div className="text-fg-subtle">{u.expiresAt ? fmtDate(u.expiresAt) : u.plan !== "free" ? "walang katapusan" : ""}</div>
                      </div>
                      <button type="button" onClick={() => startEdit(u)} className="btn btn-secondary btn-sm shrink-0" data-testid="admin-edit-btn">
                        Baguhin
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-1">
                <div className="text-xs text-fg-muted">Wala sa listahan? (lalabas ang user pagka-login niya ulit) Ilagay ang Account ID niya:</div>
                <div className="flex gap-1.5">
                  <input
                    className="input w-full text-xs"
                    value={manualId}
                    onChange={(e) => setManualId(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !busy && void openManual()}
                    placeholder="Account ID"
                    aria-label="Account ID ng user"
                    data-testid="admin-manual-id"
                  />
                  <button type="button" onClick={() => void openManual()} disabled={busy} className="btn btn-secondary btn-sm shrink-0">
                    Buksan
                  </button>
                </div>
              </div>
            </>
          )}

          {msg && (
            <p role="status" className="text-xs text-fg" data-testid="admin-msg">
              {msg}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
