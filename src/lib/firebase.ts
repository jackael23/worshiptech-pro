/**
 * 2026-11-21 (Mira): the ONE Firebase app of Worship Tech Pro, shared by the Account login
 * (lib/auth.ts) and Team sync (lib/teamSync.ts). Moved here from teamSync.ts so both use the
 * same Google login: sign in once, and the account plan and the team songs both follow.
 * 2026-11-22 (Mira): + email + password login (Jack: not everyone has / wants to use Gmail).
 *   Same Firebase user, so plan, Account ID and sync work the same. Team sync and Firestore
 *   rules still need a VERIFIED email (signedIn() in firestore.rules), so a new password account
 *   gets a verification email and sync waits until it is clicked.
 *
 * - The Firebase SDK is still a lazy chunk: nothing here loads it until loadFirebase() is called.
 * - No PouchDB / couchSync import in this file, so the app bar (Account) can use it without
 *   pulling in the Simulator's databases.
 */
import type { FirebaseApp } from "firebase/app";
import type { Auth, User } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { firebaseConfig, isFirebaseConfigured } from "./firebaseConfig";

// Dev / test only: `VITE_FIREBASE_EMULATOR=1 npm run dev` talks to the local Firebase Emulator
// (auth :9099, firestore :8080) instead of the real project.
// (Written exactly as `import.meta.env.VITE_…` so Vite replaces it at build time and the emulator code drops out of the real build.)
declare global {
  interface ImportMeta {
    readonly env: Record<string, string | undefined>;
  }
}
export const EMULATOR = import.meta.env.VITE_FIREBASE_EMULATOR === "1";
const config = EMULATOR ? { apiKey: "demo-key", authDomain: "localhost", projectId: "demo-wtp", appId: "demo-app" } : firebaseConfig;

/** false = no Firebase config yet: Google login and Team sync stay hidden. */
export const isFirebaseAvailable = (): boolean => EMULATOR || isFirebaseConfigured();

export interface Fb {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  authMod: typeof import("firebase/auth");
  fs: typeof import("firebase/firestore");
}

// ---------------------------------------------------------------- who is logged in (shared)

const userListeners = new Set<(u: User | null) => void>();
let lastUser: User | null | undefined; // undefined = Firebase has not answered yet

/**
 * Calls `fn` with the Google user every time it changes (null = logged out). Does NOT load
 * Firebase by itself: it only starts hearing once someone calls loadFirebase().
 */
export function onFirebaseUser(fn: (u: User | null) => void): () => void {
  userListeners.add(fn);
  if (lastUser !== undefined) fn(lastUser);
  return () => {
    userListeners.delete(fn);
  };
}

// ---------------------------------------------------------------- loading

let fbPromise: Promise<Fb> | null = null;
export const isFirebaseLoaded = (): boolean => fbPromise !== null;

export function loadFirebase(): Promise<Fb> {
  fbPromise ??= (async () => {
    const [appMod, authMod, fs] = await Promise.all([import("firebase/app"), import("firebase/auth"), import("firebase/firestore")]);
    const app = appMod.initializeApp(config);
    const auth = authMod.getAuth(app);
    const db = fs.getFirestore(app);
    if (EMULATOR) {
      authMod.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      fs.connectFirestoreEmulator(db, "127.0.0.1", 8080);
      // Emulator only (this branch is removed from the real build): log in as a made-up Google
      // account without the popup, for automated tests.
      (window as unknown as Record<string, unknown>).__wtpTeamTestLogin = (email: string) =>
        authMod.signInWithCredential(auth, authMod.GoogleAuthProvider.credential(JSON.stringify({ sub: `uid-${email}`, email, email_verified: true })));
    }
    authMod.onAuthStateChanged(auth, (u) => {
      lastUser = u;
      userListeners.forEach((fn) => fn(u));
    });
    return { app, auth, db, authMod, fs };
  })();
  fbPromise.catch(() => {
    fbPromise = null; // e.g. offline on the very first use: the next click tries again
  });
  return fbPromise;
}

// ---------------------------------------------------------------- Google login

/** Google sign-in popup. Throws Firebase's error (see describeAuthError). */
export async function googleSignIn(): Promise<User> {
  const { auth, authMod } = await loadFirebase();
  const provider = new authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const cred = await authMod.signInWithPopup(auth, provider);
  return cred.user;
}

// ---------------------------------------------------------------- email + password (2026-11-22, Mira)

/**
 * 2026-11-22 (Mira, Jack: "testing lang muna"): false = no verification email is sent and the app does
 * not ask for one. Turn it back to true before real churches use the app. NOTE: the Firestore rules still
 * need a verified email for sync (signedIn()), so password accounts do not sync while this is false;
 * Google accounts are always verified.
 */
export const REQUIRE_EMAIL_VERIFICATION = false;

/** Creates an email + password account (and sends the verification email when it is required). Throws Firebase's error. */
export async function emailSignUp(email: string, password: string): Promise<User> {
  const { auth, authMod } = await loadFirebase();
  const cred = await authMod.createUserWithEmailAndPassword(auth, email.trim(), password);
  // A failed verification email must not undo the new account: "Ipadala ulit" is in the Account window.
  if (REQUIRE_EMAIL_VERIFICATION) await authMod.sendEmailVerification(cred.user).catch(() => undefined);
  return cred.user;
}

/** Logs in with email + password. Throws Firebase's error. */
export async function emailSignIn(email: string, password: string): Promise<User> {
  const { auth, authMod } = await loadFirebase();
  const cred = await authMod.signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

/** Sends the "reset your password" email. Firebase does not say whether the email has an account. */
export async function sendPasswordReset(email: string): Promise<void> {
  const { auth, authMod } = await loadFirebase();
  await authMod.sendPasswordResetEmail(auth, email.trim());
}

/** Sends the verification email again to the logged-in user. */
export async function resendVerification(): Promise<void> {
  const { auth, authMod } = await loadFirebase();
  if (!auth.currentUser) throw Object.assign(new Error("not signed in"), { code: "auth/no-current-user" });
  await authMod.sendEmailVerification(auth.currentUser);
}

/**
 * Asks Firebase again whether the email is verified (after the user clicked the link in another tab).
 * Firebase does not tell the app by itself: reload() updates emailVerified, and a fresh token carries
 * email_verified to the Firestore rules. Then every onFirebaseUser listener hears the user again.
 */
export async function reloadFirebaseUser(): Promise<User | null> {
  const { auth } = await loadFirebase();
  const u = auth.currentUser;
  if (!u) return null;
  await u.reload();
  await u.getIdToken(true);
  const now = auth.currentUser;
  lastUser = now;
  userListeners.forEach((fn) => fn(now));
  return now;
}

export async function googleSignOut(): Promise<void> {
  try {
    const { auth, authMod } = await loadFirebase();
    await authMod.signOut(auth);
  } catch {
    /* ignore */
  }
}

/** Our own minimum for new passwords (Firebase itself only asks for 6). */
export const MIN_PASSWORD = 8;

/** Tagalog message for a Firebase Auth error code (null = not an auth error we know). */
export function describeAuthError(code: string): string | null {
  if (code === "auth/network-request-failed") return "Walang internet. Subukan ulit.";
  if (code === "auth/popup-blocked") return "Na-block ng browser ang login window. Payagan ang popup at subukan ulit.";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "Isinara ang login window.";
  if (code === "auth/internal-error") return "Hindi mabuksan ang Google login. Tingnan ang internet, o kung may extension na nagba-block nito.";
  if (code === "auth/unauthorized-domain") return "Hindi pa pinapayagan ang address na ito sa Firebase (Authentication → Settings → Authorized domains).";
  if (code === "auth/operation-not-allowed") return "Hindi pa naka-on ang paraan ng pag-sign in na ito sa Firebase (Authentication → Sign-in method).";
  // 2026-11-22 (Mira): email + password
  if (code === "auth/invalid-email" || code === "auth/missing-email") return "Mali ang email. Ilagay ang buong email address.";
  if (code === "auth/missing-password") return "Ilagay ang password.";
  if (code === "auth/weak-password" || code === "auth/password-does-not-meet-requirements") return `Masyadong mahina ang password. Gumamit ng hindi bababa sa ${MIN_PASSWORD} character.`;
  if (code === "auth/email-already-in-use") return "May account na ang email na ito. Mag-login na lang, o kung Google ang ginamit mo dati, pindutin ang \"Mag-sign in gamit ang Google\".";
  if (code === "auth/invalid-credential" || code === "auth/invalid-login-credentials" || code === "auth/wrong-password" || code === "auth/user-not-found")
    return "Mali ang email o password. Kung Google ang ginamit mo sa pag-sign up, pindutin ang \"Mag-sign in gamit ang Google\".";
  if (code === "auth/account-exists-with-different-credential") return "May account na ang email na ito na gumagamit ng password. Mag-login gamit ang email at password.";
  if (code === "auth/too-many-requests") return "Masyadong maraming subok. Maghintay ng ilang minuto bago subukan ulit.";
  if (code === "auth/user-disabled") return "Naka-disable ang account na ito.";
  return null;
}
