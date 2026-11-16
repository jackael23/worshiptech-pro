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

// Which tier gets which feature is NOT final (Jack to confirm) — nothing is locked with this yet.
const FEATURES: Record<Plan, readonly Feature[]> = {
  free: [],
  basic: ["remote", "schedule"],
  pro: ["remote", "schedule", "cloudSync"],
};

export const hasFeature = (plan: Plan, feature: Feature): boolean => FEATURES[plan].includes(feature);
