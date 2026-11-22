/**
 * 2026-11-16: Account — login / gumawa ng account / logout (opened from the app bar).
 * 2026-11-21 (Mira): Google sign-in (Firebase) instead of email + password on CouchDB, so the
 *   account works on the Firebase Hosting site (no app server there). One button: a Google
 *   account IS the account, there is no separate sign-up. The Account ID (Firebase uid) is shown
 *   so a church can send it when it pays; Jack sets the plan in Firestore accounts/{uid}.
 * 2026-11-22 (Mira): + email + password (Jack: not only Gmail). Google stays the first button; below
 *   it a form with three modes: login, gumawa ng account, nakalimutan ang password. A new password
 *   account must confirm its email before sync works (banner with "Ipadala ulit" / "Na-verify ko na").
 * Login is optional: songs, Bible and projection work without it. See lib/auth.ts.
 */
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Eye, EyeOff, LogIn, LogOut, Mail, Shield, WifiOff, X } from "lucide-react";
import { AuthState, checkVerified, login, loginEmail, logout, refreshAuth, resendVerifyEmail, resetPassword, signUpEmail } from "../lib/auth";
import { MIN_PASSWORD, REQUIRE_EMAIL_VERIFICATION } from "../lib/firebase";
import { PLAN_LABEL, planFromRoles } from "../lib/entitlements";
import { isFirebaseAvailable, loadFirebase } from "../lib/firebase";
import { PlanSection } from "./PlanSection";
import { isAdmin } from "../lib/admin";
import { AdminModal } from "./AdminModal";

interface Props {
  auth: AuthState;
  /** 2026-11-16: opened by PayMongo's link back to the app (?billing=success / cancel). */
  returned?: "success" | "cancel" | null;
  onClose: () => void;
}

/** Google "G" mark (plain SVG, no image download). */
type EmailMode = "login" | "signup" | "reset";
const inputCls = "w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent";

const GoogleMark: React.FC = () => (
  <svg viewBox="0 0 48 48" className="w-4 h-4" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

export const AccountModal: React.FC<Props> = ({ auth, returned = null, onClose }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false); // 2026-11-22 (Mira): admin window (Jack only)
  // 2026-11-22 (Mira): email + password form
  const [mode, setMode] = useState<EmailMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    // Opening the window reads the plan again (Jack may have just set it in the Firebase Console).
    if (auth.status === "user") void refreshAuth();
    // Logged out: load the Firebase SDK now, so the click on "Mag-sign in" opens the Google popup
    // at once. A popup opened after a slow download loses the click and the browser blocks it.
    else if (isFirebaseAvailable()) void loadFirebase().catch(() => undefined);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await login();
    setBusy(false);
    if (!r.ok) setError(r.error || "Hindi naka-login.");
  };

  const switchMode = (m: EmailMode) => {
    setMode(m);
    setError(null);
    setInfo(null);
    setPassword("");
    setConfirm("");
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const r = mode === "signup" ? await signUpEmail(email, password, confirm) : mode === "reset" ? await resetPassword(email) : await loginEmail(email, password);
    setBusy(false);
    if (!r.ok) return setError(r.error || "May error. Subukan ulit.");
    setPassword("");
    setConfirm("");
    if (mode === "reset") {
      // Firebase does not say whether the email has an account (so nobody can check other people's emails).
      setInfo("Kung may account ang email na ito, may ipinadala kaming link para magpalit ng password. Tingnan ang inbox (at Spam).");
    }
    setMode("login"); // after a logout the form opens as login again
  };

  const resend = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const r = await resendVerifyEmail();
    setBusy(false);
    if (r.ok) setInfo("Naipadala ulit. Tingnan ang inbox (at Spam).");
    else setError(r.error || "Hindi naipadala.");
  };

  const verifiedNow = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const r = await checkVerified();
    setBusy(false);
    if (r.ok) setInfo("Verified na ang email mo. Salamat!");
    else setError(r.error || "Hindi pa verified.");
  };

  const doLogout = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    await logout();
    setBusy(false);
  };

  const copyId = async () => {
    if (!auth.uid) return;
    try {
      await navigator.clipboard.writeText(auth.uid);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the id is still selectable */
    }
  };

  const plan = planFromRoles(auth.roles);
  const available = isFirebaseAvailable();

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Account">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-surface w-full sm:max-w-sm max-h-[92dvh] overflow-y-auto flex flex-col rounded-t-xl sm:rounded-xl shadow-lg border border-line" data-testid="account-modal">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h3 className="text-base font-bold text-fg">Account</h3>
          <button type="button" onClick={onClose} className="p-2 -mr-2 rounded-lg text-fg-subtle hover:bg-surface-3" aria-label="Isara">
            <X className="w-5 h-5" />
          </button>
        </div>

        {auth.status === "user" ? (
          <div className="p-4 space-y-3">
            <div>
              <div className="text-xs text-fg-subtle">Naka-login bilang</div>
              <div className="text-sm font-semibold text-fg break-all" data-testid="account-name">{auth.name}</div>
            </div>
            {REQUIRE_EMAIL_VERIFICATION && !auth.verified && (
              <div className="notice-warn text-xs space-y-2" data-testid="account-unverified">
                <p className="flex gap-1.5">
                  <Mail className="w-4 h-4 shrink-0" />
                  <span>
                    I-verify muna ang email mo: may ipinadala kaming link sa <strong>{auth.name}</strong> (tingnan din ang Spam). Hangga't hindi pa verified, hindi pa magsi-sync ang mga kanta.
                  </span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={verifiedNow} disabled={busy} className="btn btn-primary btn-sm" data-testid="account-verified-check">
                    Na-verify ko na
                  </button>
                  <button type="button" onClick={resend} disabled={busy} className="btn btn-secondary btn-sm" data-testid="account-verify-resend">
                    Ipadala ulit
                  </button>
                </div>
              </div>
            )}
            {info && (
              <p className="text-xs text-fg-muted" role="status" data-testid="account-info">
                {info}
              </p>
            )}
            {error && (
              <p role="alert" className="text-xs text-warn-text" data-testid="account-error">
                {error}
              </p>
            )}
            <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2">
              <span className="text-xs text-fg-muted">Plan</span>
              <span className="text-sm font-semibold text-fg" data-testid="account-plan">{PLAN_LABEL[plan]}</span>
            </div>
            {plan !== "free" && auth.expiresAt && (
              <p className="text-xs text-fg-muted" data-testid="account-expiry">
                Bayad hanggang <strong className="text-fg">{new Date(auth.expiresAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</strong>.
              </p>
            )}
            {auth.uid && (
              <div className="space-y-1">
                <div className="text-xs text-fg-subtle">Account ID (ipadala ito kapag magbabayad o magpapa-upgrade)</div>
                <div className="flex items-center gap-1.5">
                  <code className="flex-1 min-w-0 truncate rounded-md border border-line bg-canvas px-2 py-1 text-xs text-fg select-all" data-testid="account-uid">
                    {auth.uid}
                  </code>
                  <button type="button" onClick={copyId} className="btn btn-ghost btn-sm" aria-label="Kopyahin ang Account ID" data-testid="account-uid-copy">
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}
            {!auth.offline && <PlanSection plan={plan} returned={returned} />}
            {auth.offline && (
              <p className="notice-warn text-xs flex gap-1.5">
                <WifiOff className="w-4 h-4 shrink-0" />
                Hindi ma-check ang plan ngayon (walang internet?). Ang huling alam na plan ang ginagamit hanggang bumalik ang koneksyon.
              </p>
            )}
            {isAdmin(auth.uid) && !auth.offline && (
              <button type="button" onClick={() => setAdminOpen(true)} className="btn btn-secondary w-full" data-testid="account-admin">
                <Shield className="w-4 h-4" /> Admin: mga plan
              </button>
            )}
            <button type="button" onClick={doLogout} disabled={busy} className="btn btn-secondary w-full" data-testid="account-logout">
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <p className="text-xs text-fg-subtle">
              Hindi kailangan ng account para sa songs, Bible at projection. Ang account ay para sa mga paid feature (phone remote, lineup schedule) at sa Team sync ng mga kanta.
            </p>
            {available ? (
              <button type="button" onClick={signIn} disabled={busy || auth.status === "loading"} className="btn btn-primary w-full" data-testid="account-google">
                {busy ? <LogIn className="w-4 h-4" /> : <GoogleMark />}
                {busy ? "Sandali…" : "Mag-sign in gamit ang Google"}
              </button>
            ) : (
              <p className="notice-warn text-xs">Hindi pa naka-setup ang Google sign-in sa app na ito.</p>
            )}
            {available && (
              <form onSubmit={submitEmail} className="space-y-2" data-testid="account-email-form" noValidate>
                <div className="flex items-center gap-2 text-[11px] text-fg-subtle">
                  <span className="h-px flex-1 bg-line" />o gamit ang email<span className="h-px flex-1 bg-line" />
                </div>
                {mode === "reset" && <p className="text-xs text-fg-muted">Ilagay ang email ng account mo. Padadalhan ka namin ng link para magpalit ng password.</p>}
                <input
                  className={inputCls}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  aria-label="Email"
                  data-testid="account-email"
                />
                {mode !== "reset" && (
                  <div className="relative">
                    <input
                      className={`${inputCls} pr-10`}
                      type={showPw ? "text" : "password"}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === "signup" ? `Password (hindi bababa sa ${MIN_PASSWORD} character)` : "Password"}
                      aria-label="Password"
                      data-testid="account-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-fg-subtle hover:text-fg"
                      aria-label={showPw ? "Itago ang password" : "Ipakita ang password"}
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                )}
                {mode === "signup" && (
                  <input
                    className={inputCls}
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Ulitin ang password"
                    aria-label="Ulitin ang password"
                    data-testid="account-password2"
                  />
                )}
                <button type="submit" disabled={busy || auth.status === "loading"} className="btn btn-secondary w-full" data-testid="account-email-submit">
                  {busy ? "Sandali…" : mode === "signup" ? "Gumawa ng account" : mode === "reset" ? "Ipadala ang link" : "Mag-login"}
                </button>
                <div className="flex flex-wrap justify-between gap-2 text-xs">
                  {mode === "login" ? (
                    <>
                      <button type="button" onClick={() => switchMode("signup")} className="text-accent hover:underline" data-testid="account-mode-signup">
                        Wala pang account? Gumawa
                      </button>
                      <button type="button" onClick={() => switchMode("reset")} className="text-fg-muted hover:underline" data-testid="account-mode-reset">
                        Nakalimutan ang password?
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => switchMode("login")} className="text-accent hover:underline" data-testid="account-mode-login">
                      {mode === "signup" ? "May account na? Mag-login" : "Bumalik sa login"}
                    </button>
                  )}
                </div>
              </form>
            )}
            {auth.offline && !error && <p className="text-xs text-warn-text">Walang internet ngayon. Kailangan ng internet para mag-sign in.</p>}
            {info && (
              <p className="text-xs text-fg-muted" role="status" data-testid="account-info">
                {info}
              </p>
            )}
            {error && (
              <p role="alert" className="text-xs text-warn-text" data-testid="account-error">
                {error}
              </p>
            )}
            {/* 2026-11-18: plans and prices visible before logging in */}
            {available && <PlanSection plan="free" returned={null} onStart={signIn} startLabel="Mag-sign in para mag-subscribe" />}
          </div>
        )}
      </div>
      {adminOpen && <AdminModal onClose={() => setAdminOpen(false)} onChanged={() => void refreshAuth()} />}
    </div>,
    // 2026-11-18: portal to <body> — the frosted-glass backdrop-filter on .panel/header
    // (app background on) traps position:fixed inside the panel, so dialogs got squeezed.
    document.body,
  );
};
