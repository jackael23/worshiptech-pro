/**
 * 2026-11-16: plan + paid features of an account, worked out from its CouchDB roles.
 *  - The plan is a ROLE on the user ("plan:basic" / "plan:pro"), not a field in the user doc:
 *    a user can edit their own _users doc, but only a CouchDB admin can change `roles`.
 *    Later the payment webhook (PayMongo) adds / removes the role with admin rights.
 *  - Every "is this unlocked?" check in the app should go through hasFeature(), so the tiers
 *    are decided in this one file.
 * Pure functions (no DOM / storage / network).
 */

export type Plan = "free" | "basic" | "pro";
export type Feature = "remote" | "schedule" | "cloudSync";

export const PLAN_ROLE: Record<Exclude<Plan, "free">, string> = { basic: "plan:basic", pro: "plan:pro" };
export const PLAN_LABEL: Record<Plan, string> = { free: "Free", basic: "Basic", pro: "Pro" };

/** Highest plan among the roles. A CouchDB server admin (the owner / developer) counts as Pro. */
export function planFromRoles(roles: readonly string[]): Plan {
  if (roles.includes(PLAN_ROLE.pro) || roles.includes("_admin")) return "pro";
  if (roles.includes(PLAN_ROLE.basic)) return "basic";
  return "free";
}

// Proposed split (Jack has not decided yet): Basic = what runs on the church's own laptop,
// Pro = adds cloud sync, the only part that costs us server money every month.
// Locked so far: "remote" (2026-11-16). "schedule" will mean SAVED lineups / planning ahead —
// the one working Schedule stays free, it is the only way to go live.
const FEATURES: Record<Plan, readonly Feature[]> = {
  free: [],
  basic: ["remote", "schedule"],
  pro: ["remote", "schedule", "cloudSync"],
};

export const hasFeature = (plan: Plan, feature: Feature): boolean => FEATURES[plan].includes(feature);

// 2026-11-21 (Mira): with Google sign-in (Firebase) the plan lives in Firestore accounts/{uid}:
// { plan: "basic" | "pro", expiresAt?: Timestamp | ISO string }. Only Jack (Firebase Console) or,
// later, the payment server can write it; firestore.rules allow the owner to read it only.
/** Days a plan keeps working after expiresAt (same grace as billingServer.ts). */
export const PLAN_GRACE_DAYS = 3;

/** Millis of a Firestore Timestamp, an ISO string or a number; null = none / unreadable. */
function toMillis(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  const fn = (v as { toMillis?: unknown } | null)?.toMillis;
  if (typeof fn === "function") {
    const t = (fn as () => number).call(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/** Plan of an accounts/{uid} document (missing / unknown / ended = "free"). */
export function planFromAccountDoc(data: unknown, now = Date.now()): { plan: Plan; expiresAt: string | null } {
  const d = (data && typeof data === "object" ? data : {}) as { plan?: unknown; expiresAt?: unknown };
  const plan: Plan = d.plan === "pro" || d.plan === "basic" ? d.plan : "free";
  const end = toMillis(d.expiresAt);
  const expiresAt = end === null ? null : new Date(end).toISOString();
  if (plan !== "free" && end !== null && now > end + PLAN_GRACE_DAYS * 86400_000) return { plan: "free", expiresAt };
  return { plan, expiresAt };
}

/** Roles that stand for a plan, so planFromRoles() and every hasFeature() check keep working. */
export const rolesOfPlan = (plan: Plan): string[] => (plan === "free" ? [] : [PLAN_ROLE[plan]]);
