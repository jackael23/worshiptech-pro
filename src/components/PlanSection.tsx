/**
 * 2026-11-16: the paying part of the Account window — until when the plan is paid, and the
 * buttons to buy 1 month / 1 year (PayMongo checkout in a new tab). See lib/billing.ts.
 */
import React, { useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { refreshAuth } from "../lib/auth";
import { Plan } from "../lib/entitlements";
import { BillingInfo, BillingStatus, confirmPayments, getBillingInfo, getBillingStatus, peso, startCheckout } from "../lib/billing";

interface Props {
  plan: Plan;
  /** Set when the page was opened by PayMongo's "back to merchant" link. */
  returned: "success" | "cancel" | null;
}

const WARN_DAYS = 7;
const niceDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

export const PlanSection: React.FC<Props> = ({ plan, returned }) => {
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
      if (!i.enabled) return;
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

      {info.enabled ? (
        <>
          {info.plans.map((p) =>
            p.available ? (
              <div key={p.id} className="space-y-1.5 rounded-lg border border-line p-3">
                <div className="text-xs font-semibold text-fg">{plan === "free" ? `Mag-subscribe sa ${p.name}` : `Dagdagan ang ${p.name}`}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button type="button" onClick={() => buy(p.id, "month")} disabled={busy} className="btn btn-secondary btn-sm" data-testid={`buy-${p.id}-month`}>
                    1 buwan · {peso(p.monthly)}
                  </button>
                  <button type="button" onClick={() => buy(p.id, "year")} disabled={busy} className="btn btn-primary btn-sm" data-testid={`buy-${p.id}-year`}>
                    1 taon · {peso(p.yearly)}
                  </button>
                </div>
                <p className="text-xs text-fg-subtle">Ang 1 taon ay 2 buwan na libre. Isang beses na bayad (GCash, card) — walang kusang sinisingil ulit.</p>
              </div>
            ) : (
              <p key={p.id} className="text-xs text-fg-subtle">
                {p.name} ({peso(p.monthly)} / buwan, may cloud sync): malapit na.
              </p>
            ),
          )}
          {waiting && (
            <div className="space-y-1.5 text-xs text-fg-muted">
              <p>Binuksan ang bayaran sa bagong tab. Pagkatapos magbayad, bumalik dito.</p>
              <button type="button" onClick={() => check()} disabled={busy} className="btn btn-ghost btn-sm" data-testid="plan-check">
                <RefreshCw className="h-3.5 w-3.5" /> Nakabayad na ako — i-check
              </button>
            </div>
          )}
        </>
      ) : info.billingUrl ? (
        <a href={`${info.billingUrl}/?account`} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm w-full" data-testid="plan-billing-link">
          <ExternalLink className="h-3.5 w-3.5" /> Mag-subscribe o mag-renew online
        </a>
      ) : plan === "free" ? (
        <p className="text-xs text-fg-subtle">Wala pang online na bayad sa server na ito.</p>
      ) : null}
    </div>
  );
};
