/**
 * 2026-11-16: the paying part of the Account window — until when the plan is paid, and the
 * buttons to buy 1 month / 1 year (PayMongo checkout in a new tab). See lib/billing.ts.
 */
import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { refreshAuth } from "../lib/auth";
import { Plan } from "../lib/entitlements";
import { BillingInfo, BillingStatus, confirmPayments, getBillingInfo, getBillingStatus, peso, startCheckout } from "../lib/billing";

interface Props {
  plan: Plan;
  /** Set when the page was opened by PayMongo's "back to merchant" link. */
  returned: "success" | "cancel" | null;
  /**
   * 2026-11-18: set = not logged in. Only the price list is shown (no status / checkout calls),
   * with one button that sends the user to sign-up (or login) in the Account window.
   */
  onStart?: () => void;
  startLabel?: string;
}

const WARN_DAYS = 7;
/**
 * 2026-11-21 (Mira): while there is no online payment, a church pays by hand (e.g. GCash) and
 * Jack turns on the plan in Firestore accounts/{uid}. Jack: put here how churches reach you
 * (e.g. "Messenger: m.me/worshiptechpro" or a phone number). Empty = the line is not shown.
 */
const UPGRADE_CONTACT = "";
const INCLUDES: Record<string, string> = { basic: "Phone remote at Lineups", pro: "Lahat ng nasa Basic + cloud sync (songs, Bible, PPT, media at lineups sa lahat ng computer ninyo)" };
const niceDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

/**
 * 2026-11-18: read-only price list, so people can see the plans BEFORE making an account (and
 * while this server cannot take payments yet). Prices still come from the server (/api/billing/plans).
 */
const PriceList: React.FC<{ info: BillingInfo }> = ({ info }) => (
  <div className="space-y-1.5" data-testid="plan-prices">
    <div className="text-xs font-semibold text-fg">Mga plan</div>
    <div className="rounded-lg border border-line p-2.5 space-y-0.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-fg">Free</span>
        <span className="text-xs text-fg">₱0</span>
      </div>
      <div className="text-xs text-fg-muted">Songs, Bible, projection at Schedule. Walang account na kailangan.</div>
    </div>
    {info.plans.map((p) => (
      <div key={p.id} className="rounded-lg border border-line p-2.5 space-y-0.5" data-testid={`price-${p.id}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold text-fg">{p.name}</span>
          <span className="text-xs text-fg text-right">
            {peso(p.monthly)} / buwan · {peso(p.yearly)} / taon
          </span>
        </div>
        <div className="text-xs text-fg-muted">{INCLUDES[p.id] ?? ""}</div>
        {(!info.enabled || !p.available) && <div className="text-xs text-fg-subtle">Malapit na ang online na bayad.</div>}
      </div>
    ))}
    <p className="text-xs text-fg-subtle">Ang 1 taon ay 2 buwan na libre. Isang beses na bayad (GCash, card) — walang kusang sinisingil ulit.</p>
  </div>
);

export const PlanSection: React.FC<Props> = ({ plan, returned, onStart, startLabel }) => {
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);

  /** Re-checks unpaid orders with PayMongo, then the roles (the plan shown comes from those). */
  const check = async () => {
    setBusy(true);
    const before = status?.expiresAt ?? null;
    const s = await confirmPayments();
    await refreshAuth();
    setBusy(false);
    if (s) setStatus(s);
    // Paid = this check found a payment, or the webhook already did (the end date moved).
    if (s && (s.newlyPaid || (s.expiresAt && s.expiresAt !== before))) {
      setWaiting(false);
      setNotice({ text: "Natanggap ang bayad. Salamat! Bukas na ang mga feature ng plan.", tone: "ok" });
    } else setNotice({ text: s ? "Wala pang natatanggap na bagong bayad. Kung kababayad lang, subukan ulit pagkalipas ng ilang segundo." : "Hindi ma-check ang bayad ngayon.", tone: "warn" });
  };

  useEffect(() => {
    let alive = true;
    void getBillingInfo().then((i) => {
      if (!alive) return;
      setInfo(i);
      if (!i.enabled || onStart) return; // not logged in: price list only
      if (returned === "success") void check();
      else {
        void getBillingStatus().then((s) => alive && s && setStatus(s));
        if (returned === "cancel") setNotice({ text: "Hindi itinuloy ang bayad. Walang siningil.", tone: "warn" });
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buy = async (planId: string, period: "month" | "year") => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const r = await startCheckout(planId, period);
    setBusy(false);
    if (!r.ok) return setNotice({ text: r.error || "Hindi mabuksan ang bayaran.", tone: "warn" });
    setWaiting(true);
  };

  if (!info) return null;
  // 2026-11-18: not logged in — show the plans and one way in (sign-up / login).
  if (onStart) {
    if (!info.plans.length) return null;
    return (
      <div className="space-y-2.5 border-t border-line pt-3" data-testid="plan-preview">
        <PriceList info={info} />
        <button type="button" onClick={onStart} className="btn btn-secondary w-full" data-testid="plan-start">
          {startLabel ?? "Gumawa ng account para mag-subscribe"}
        </button>
      </div>
    );
  }
  const daysLeft = status?.expiresAt ? Math.ceil((Date.parse(status.expiresAt) - Date.now()) / 86400_000) : null;

  return (
    <div className="space-y-2.5" data-testid="plan-section">
      {status?.expiresAt && daysLeft !== null && (
        <p className={`text-xs ${daysLeft <= WARN_DAYS ? "notice-warn" : "text-fg-muted"}`} data-testid="plan-expiry">
          {daysLeft > 0 ? (
            <>
              Bayad hanggang <strong className="text-fg">{niceDate(status.expiresAt)}</strong>
              {daysLeft <= WARN_DAYS ? ` — ${daysLeft} araw na lang. Magbayad ulit para hindi maputol.` : "."}
            </>
          ) : (
            <>Natapos na ang bayad noong {niceDate(status.expiresAt)}. Mapuputol ang plan sa loob ng {status.graceDays} araw kung hindi mare-renew.</>
          )}
        </p>
      )}

      {notice && (
        <p role="status" className={`text-xs ${notice.tone === "ok" ? "notice-ok" : "notice-warn"}`} data-testid="plan-notice">
          {notice.text}
        </p>
      )}

      {info.enabled || plan === "free" ? (
        <>
          {/* 2026-11-18: no PayMongo key on this server yet — same buttons, disabled, so users see where to buy. */}
          {!info.enabled && (
            <p className="text-xs notice-warn" data-testid="plan-soon">
              Malapit na ang online na bayad. Sa ngayon, para mag-upgrade: magbayad sa GCash at ipadala ang Account ID mo (nasa itaas). Bubuksan namin ang plan pagkatanggap.
              {UPGRADE_CONTACT && <> Contact: <strong className="text-fg">{UPGRADE_CONTACT}</strong></>}
            </p>
          )}
          {info.plans.map((p) =>
            p.available ? (
              <div key={p.id} className="space-y-1.5 rounded-lg border border-line p-3">
                <div className="text-xs font-semibold text-fg">{plan === p.id ? `Dagdagan ang ${p.name}` : plan === "basic" && p.id === "pro" ? `Mag-upgrade sa ${p.name}` : `Mag-subscribe sa ${p.name}`}</div>
                <div className="text-xs text-fg-muted">{INCLUDES[p.id] ?? ""}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button type="button" onClick={() => buy(p.id, "month")} disabled={busy || !info.enabled} title={info.enabled ? undefined : "Malapit na"} className="btn btn-secondary btn-sm" data-testid={`buy-${p.id}-month`}>
                    1 buwan · {peso(p.monthly)}
                  </button>
                  <button type="button" onClick={() => buy(p.id, "year")} disabled={busy || !info.enabled} title={info.enabled ? undefined : "Malapit na"} className="btn btn-primary btn-sm" data-testid={`buy-${p.id}-year`}>
                    1 taon · {peso(p.yearly)}
                  </button>
                </div>
              </div>
            ) : (
              <p key={p.id} className="text-xs text-fg-subtle">
                {p.name} ({peso(p.monthly)} / buwan, may cloud sync): malapit na.
              </p>
            ),
          )}
          <p className="text-xs text-fg-subtle">Ang 1 taon ay 2 buwan na libre. Isang beses na bayad (GCash, card) — walang kusang sinisingil ulit. Kapag nag-upgrade, hindi nasasayang ang natitirang bayad.</p>
          {waiting && (
            <div className="space-y-1.5 text-xs text-fg-muted">
              <p>Binuksan ang bayaran sa bagong tab. Pagkatapos magbayad, bumalik dito.</p>
              <button type="button" onClick={() => check()} disabled={busy} className="btn btn-ghost btn-sm" data-testid="plan-check">
                <RefreshCw className="h-3.5 w-3.5" /> Nakabayad na ako — i-check
              </button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};
