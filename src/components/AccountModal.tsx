/**
 * 2026-11-16: Account — login / gumawa ng account / logout (opened from the app bar).
 * Login is optional: songs, Bible and projection work without it. See lib/auth.ts.
 */
import React, { useEffect, useState } from "react";
import { LogIn, LogOut, UserPlus, WifiOff, X } from "lucide-react";
import { AuthState, PASSWORD_MIN, getAuthConfig, login, logout, signup } from "../lib/auth";
import { PLAN_LABEL, planFromRoles } from "../lib/entitlements";

interface Props {
  auth: AuthState;
  onClose: () => void;
}

const inputCls =
  "w-full bg-canvas text-fg placeholder:text-fg-subtle px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";
const labelCls = "text-xs font-semibold text-fg";

export const AccountModal: React.FC<Props> = ({ auth, onClose }) => {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [canSignup, setCanSignup] = useState(false);
  const [church, setChurch] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getAuthConfig().then((c) => alive && setCanSignup(c.signup));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!name.trim() || !password) return setError(mode === "signup" ? "Ilagay ang email at password." : "Ilagay ang email (o username) at password.");
    if (mode === "signup" && password.length < PASSWORD_MIN) return setError(`Dapat hindi bababa sa ${PASSWORD_MIN} characters ang password.`);
    setBusy(true);
    setError(null);
    const r = mode === "signup" ? await signup({ church, email: name, password }) : await login(name, password);
    setBusy(false);
    setPassword("");
    if (!r.ok) setError(r.error || "Hindi naka-login.");
  };

  const doLogout = async () => {
    setBusy(true);
    await logout();
    setBusy(false);
  };

  const switchMode = (m: "login" | "signup") => {
    setMode(m);
    setError(null);
  };

  const plan = planFromRoles(auth.roles);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Account">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-surface w-full sm:max-w-sm flex flex-col rounded-t-xl sm:rounded-xl shadow-lg border border-line" data-testid="account-modal">
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
            <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2">
              <span className="text-xs text-fg-muted">Plan</span>
              <span className="text-sm font-semibold text-fg" data-testid="account-plan">{PLAN_LABEL[plan]}</span>
            </div>
            {auth.offline && (
              <p className="notice-warn text-xs flex gap-1.5">
                <WifiOff className="w-4 h-4 shrink-0" />
                Hindi maabot ang account server ngayon. Ang huling alam na plan ang ginagamit hanggang bumalik ang koneksyon.
              </p>
            )}
            <button type="button" onClick={doLogout} disabled={busy} className="btn btn-secondary w-full" data-testid="account-logout">
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-4 space-y-3">
            {canSignup && (
              <div className="seg grid grid-cols-2" role="group" aria-label="Login o bagong account">
                <button type="button" onClick={() => switchMode("login")} aria-pressed={mode === "login"} className="seg-item tap-target">
                  Login
                </button>
                <button type="button" onClick={() => switchMode("signup")} aria-pressed={mode === "signup"} className="seg-item tap-target" data-testid="account-mode-signup">
                  Gumawa ng account
                </button>
              </div>
            )}
            <p className="text-xs text-fg-subtle">
              Hindi kailangan ng account para sa songs, Bible at projection. Ang account ay para sa mga paid feature (phone remote, lineup schedule, cloud sync).
            </p>
            {mode === "signup" && (
              <label className="block">
                <span className={labelCls}>Pangalan ng simbahan</span>
                <input className={inputCls} value={church} onChange={(e) => setChurch(e.target.value)} maxLength={80} autoComplete="organization" data-testid="account-church" />
              </label>
            )}
            <label className="block">
              <span className={labelCls}>{mode === "signup" ? "Email" : "Email o username"}</span>
              <input
                className={inputCls}
                type={mode === "signup" ? "email" : "text"}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                data-testid="account-email"
              />
            </label>
            <label className="block">
              <span className={labelCls}>Password {mode === "signup" ? `(hindi bababa sa ${PASSWORD_MIN} characters)` : "(hindi sine-save)"}</span>
              <input
                className={inputCls}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={128}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                data-testid="account-password"
              />
            </label>
            {auth.offline && !error && <p className="text-xs text-warn-text">Hindi maabot ang account server ngayon (walang internet, o nakasara ang CouchDB).</p>}
            {error && <p role="alert" className="text-xs text-warn-text" data-testid="account-error">{error}</p>}
            <button type="submit" disabled={busy || auth.status === "loading"} className="btn btn-primary w-full" data-testid="account-submit">
              {mode === "signup" ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
              {busy ? "Sandali…" : mode === "signup" ? "Gumawa ng account" : "Login"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
