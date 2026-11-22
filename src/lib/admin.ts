/**
 * 2026-11-22 (Mira): Admin — Jack sets the plan of any account from inside the app.
 *
 * Who is admin: ADMIN_UIDS below. The SAME uid list is in firestore.rules (isAdmin), and THAT is
 * the real lock: Firestore refuses every read of other people's data and every plan write from
 * anyone else, even if they open this window with DevTools. Change both places together.
 *
 * - profiles/{uid} = { email, name, lastSeen }: written by each user about themself after a Google
 *   login (at most once a day per browser), so the admin can list the accounts. Firebase Auth's own
 *   user list needs the Admin SDK (a paid server), so this small copy is the free way.
 * - accounts/{uid} = { plan: "free" | "basic" | "pro", expiresAt?: Timestamp } (see entitlements.ts).
 */
import type { User } from "firebase/auth";
import { loadFirebase } from "./firebase";
import { Plan, planFromAccountDoc } from "./entitlements";

/** Firebase uids of the admins (Jack). Keep in sync with isAdmin() in firestore.rules. */
export const ADMIN_UIDS: readonly string[] = ["FW7iJWYqcjNIpTgFu84BQ0EaUUu1"];
export const isAdmin = (uid: string | null | undefined): boolean => !!uid && ADMIN_UIDS.includes(uid);

// ---------------------------------------------------------------- profile (every user, about themself)

const PROFILE_KEY = "wtp-profile-saved:";
const today = () => new Date().toISOString().slice(0, 10);

/** Saves this user's email + name for the admin list. Once a day per browser (cheap on the free quota). */
export async function saveProfile(u: User): Promise<void> {
  const email = (u.email || "").trim().toLowerCase();
  if (!email) return;
  try {
    if (window.localStorage.getItem(PROFILE_KEY + u.uid) === today()) return;
  } catch {
    /* no storage: just write */
  }
  const { db, fs } = await loadFirebase();
  const name = (u.displayName || "").trim().slice(0, 100);
  await fs.setDoc(fs.doc(db, "profiles", u.uid), { email, name, lastSeen: fs.serverTimestamp() });
  try {
    window.localStorage.setItem(PROFILE_KEY + u.uid, today());
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- admin only

export interface AdminUser {
  uid: string;
  email: string;
  name: string;
  /** ISO, null = unknown (no profile yet). */
  lastSeen: string | null;
  /** The plan the app gives this account right now (an ended plan counts as Free). */
  plan: Plan;
  /** What is written in accounts/{uid} (null = no document = Free). */
  savedPlan: Plan | null;
  expiresAt: string | null;
}

const isoOf = (v: unknown): string | null => {
  const fn = (v as { toDate?: unknown } | null)?.toDate;
  return typeof fn === "function" ? (fn as () => Date).call(v).toISOString() : null;
};
const savedPlanOf = (d: unknown): Plan | null => {
  const p = (d as { plan?: unknown } | null)?.plan;
  return p === "free" || p === "basic" || p === "pro" ? p : null;
};

/** All profiles + all plans, newest login first. Admin only (the rules refuse everyone else). */
export async function listUsers(): Promise<AdminUser[]> {
  const { db, fs } = await loadFirebase();
  const [profiles, accounts] = await Promise.all([
    fs.getDocs(fs.query(fs.collection(db, "profiles"), fs.limit(1000))),
    fs.getDocs(fs.query(fs.collection(db, "accounts"), fs.limit(1000))),
  ]);
  const rows = new Map<string, AdminUser>();
  const blank = (uid: string): AdminUser => ({ uid, email: "", name: "", lastSeen: null, plan: "free", savedPlan: null, expiresAt: null });
  profiles.forEach((d) => {
    const o = d.data() as { email?: unknown; name?: unknown; lastSeen?: unknown };
    rows.set(d.id, { ...blank(d.id), email: typeof o.email === "string" ? o.email : "", name: typeof o.name === "string" ? o.name : "", lastSeen: isoOf(o.lastSeen) });
  });
  accounts.forEach((d) => {
    const { plan, expiresAt } = planFromAccountDoc(d.data());
    rows.set(d.id, { ...(rows.get(d.id) ?? blank(d.id)), plan, savedPlan: savedPlanOf(d.data()), expiresAt });
  });
  return [...rows.values()].sort((a, b) => (b.lastSeen || "").localeCompare(a.lastSeen || "") || a.email.localeCompare(b.email));
}

/** One account by its Account ID (for an account that has no profile yet). null = no such data at all. */
export async function getUser(uid: string): Promise<AdminUser | null> {
  const { db, fs } = await loadFirebase();
  const [p, a] = await Promise.all([fs.getDoc(fs.doc(db, "profiles", uid)), fs.getDoc(fs.doc(db, "accounts", uid))]);
  if (!p.exists() && !a.exists()) return null;
  const o = (p.exists() ? p.data() : {}) as { email?: unknown; name?: unknown; lastSeen?: unknown };
  const { plan, expiresAt } = planFromAccountDoc(a.exists() ? a.data() : null);
  return {
    uid,
    email: typeof o.email === "string" ? o.email : "",
    name: typeof o.name === "string" ? o.name : "",
    lastSeen: isoOf(o.lastSeen),
    plan,
    savedPlan: a.exists() ? savedPlanOf(a.data()) : null,
    expiresAt,
  };
}

/** Writes the plan of an account (replaces the whole doc, so "no end date" really removes it). */
export async function setPlan(uid: string, plan: Plan, expiresAt: Date | null): Promise<void> {
  const { db, fs } = await loadFirebase();
  const data: Record<string, unknown> = { plan };
  if (plan !== "free" && expiresAt) data.expiresAt = fs.Timestamp.fromDate(expiresAt);
  await fs.setDoc(fs.doc(db, "accounts", uid), data);
}

/** Account IDs are Firebase uids: letters and digits. */
export const ACCOUNT_ID_RE = /^[A-Za-z0-9]{20,128}$/;

export const describeAdminError = (e: unknown): string => {
  const code = (e as { code?: string })?.code || "";
  if (code === "permission-denied") return "Walang access. Ang admin lang ang makakagawa nito.";
  if (code === "unavailable") return "Walang internet. Subukan ulit.";
  if (code === "resource-exhausted") return "Naabot ang libreng quota ng Firebase ngayong araw. Subukan ulit bukas.";
  return code ? `Error: ${code}` : "May error. Subukan ulit.";
};
