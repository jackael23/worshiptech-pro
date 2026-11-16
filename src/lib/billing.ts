/**
 * 2026-11-16: paying for a plan (PayMongo, prepaid 1 month / 1 year) — browser side of
 * billingServer.ts. The server decides prices and what was paid; this only asks and shows.
 */

export interface BillingPlan {
  id: string;
  name: string;
  /** pesos */
  monthly: number;
  yearly: number;
  /** false = shown as "coming", cannot be bought yet. */
  available: boolean;
}

export interface BillingInfo {
  /** true = this server can take payments. */
  enabled: boolean;
  /** On a laptop install: the hosted site where paying works (null = none). */
  billingUrl: string | null;
  plans: BillingPlan[];
}

export interface BillingStatus {
  plan: string;
  /** End of the paid period (ISO), null = no paid period (Free, or a plan given by hand). */
  expiresAt: string | null;
  graceDays: number;
  newlyPaid?: number;
}

const NONE: BillingInfo = { enabled: false, billingUrl: null, plans: [] };

let info: Promise<BillingInfo> | null = null;
export function getBillingInfo(): Promise<BillingInfo> {
  info ??= fetch("/api/billing/plans")
    .then((r) => (r.ok ? r.json() : null))
    .then((j: Partial<BillingInfo> | null) => {
      if (!j || !Array.isArray(j.plans)) return NONE;
      const plans = j.plans.filter((p): p is BillingPlan => !!p && typeof p.id === "string" && typeof p.name === "string" && Number.isFinite(p.monthly) && Number.isFinite(p.yearly));
      return { enabled: j.enabled === true, billingUrl: typeof j.billingUrl === "string" && /^https?:\/\//.test(j.billingUrl) ? j.billingUrl : null, plans };
    })
    .catch(() => NONE);
  return info;
}

async function readStatus(res: Response): Promise<BillingStatus | null> {
  if (!res.ok) return null;
  const j = (await res.json().catch(() => null)) as Partial<BillingStatus> | null;
  if (!j || typeof j.plan !== "string") return null;
  return { plan: j.plan, expiresAt: typeof j.expiresAt === "string" ? j.expiresAt : null, graceDays: Number(j.graceDays) || 0, newlyPaid: Number(j.newlyPaid) || 0 };
}

/** The logged-in account's plan and end date (null = not available). */
export const getBillingStatus = (): Promise<BillingStatus | null> =>
  fetch("/api/billing/status", { credentials: "same-origin" }).then(readStatus, () => null);

/** Asks the server to re-check unpaid orders with PayMongo (after coming back from the checkout page). */
export const confirmPayments = (): Promise<BillingStatus | null> =>
  fetch("/api/billing/confirm", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" }).then(readStatus, () => null);

/**
 * Opens PayMongo's checkout page in a NEW tab — the operator screen (and whatever is on the
 * projector) stays where it is. Call straight from a click, or the browser blocks the new tab.
 */
export async function startCheckout(plan: string, period: "month" | "year"): Promise<{ ok: boolean; error?: string }> {
  const tab = window.open("", "_blank");
  const fail = (error: string) => {
    tab?.close();
    return { ok: false, error };
  };
  try {
    const res = await fetch("/api/billing/checkout", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, period }) });
    const j = (await res.json().catch(() => null)) as { url?: unknown; error?: unknown } | null;
    if (!res.ok || typeof j?.url !== "string" || !/^https?:\/\//.test(j.url)) return fail(typeof j?.error === "string" ? j.error : "Hindi mabuksan ang bayaran ngayon.");
    if (tab) tab.location.href = j.url;
    else window.location.href = j.url; // new tab blocked: go there in this one
    return { ok: true };
  } catch {
    return fail("Hindi maabot ang server ng app.");
  }
}

export const peso = (n: number) => `₱${n.toLocaleString("en-PH")}`;
