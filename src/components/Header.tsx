/**
 * 2026-10-28 (Jarvis): redesigned app bar ("Pro Dark" design system).
 *  - One compact row: brand · nav · EW version · language · theme toggle.
 *  - Phones: nav moves to a bottom bar (MobileNav) with 44px+ targets.
 *  - The simulated output status moved into the Simulator itself (it isn't a real connection).
 * 2026-11-07 (Mira): the sun/moon toggle became an Appearance button (mode, accent, app background).
 * 2026-11-07 (b): Full screen button (like F11) — Esc or the same button exits.
 */
import React, { useEffect, useState } from "react";
import { EasyWorshipVersion, SupportedLanguage, versionLabel } from "../types";
import { BookOpen, Layers, Keyboard, MessageSquare, Palette, MonitorPlay, Maximize, Minimize, CircleUserRound } from "lucide-react";
import { AppearancePanel } from "./AppearancePanel";
import { AccountModal } from "./AccountModal";
import { onOpenAccount, useAuth } from "../lib/auth";
import { PLAN_LABEL, planFromRoles } from "../lib/entitlements";
import type { Appearance } from "../lib/appearance";

// 2026-11-16: back from PayMongo's checkout page (?billing=success|cancel), or a link straight to
// the Account window (?account): open it, and clean the address so a reload does not repeat it.
// Read once when the file loads (not in a component: React runs those twice in development).
const START = (() => {
  const q = new URLSearchParams(window.location.search);
  const b = q.get("billing");
  const returned: "success" | "cancel" | null = b === "success" || b === "cancel" ? b : null;
  const openAccount = !!returned || q.has("account");
  if (openAccount) {
    q.delete("billing");
    q.delete("account");
    const rest = q.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
  }
  return { returned, openAccount };
})();

export type AppTab = "chat" | "simulator" | "guides" | "shortcuts";
export type Theme = "dark" | "light";

export const NAV_ITEMS: { id: AppTab; label: string; icon: React.ElementType; hint: string }[] = [
  // 2026-10-29: Simulator first — it's the main screen now (opens by default)
  { id: "simulator", label: "Simulator", icon: Layers, hint: "Practice the live workflow" },
  { id: "chat", label: "Chat", icon: MessageSquare, hint: "AI chat" }, // 2026-10-29: was "Assistant" (sabi ni Jack)
  { id: "guides", label: "Guides", icon: BookOpen, hint: "Step-by-step workflow guides" },
  { id: "shortcuts", label: "Hotkeys", icon: Keyboard, hint: "Hotkeys cheat sheet" },
];

const VERSIONS: EasyWorshipVersion[] = ["EasyWorship 7", "EasyWorship 6", "EasyWorship 2009"];
const LANGUAGES: SupportedLanguage[] = ["Tagalog", "English", "Taglish"];

interface HeaderProps {
  version: EasyWorshipVersion;
  setVersion: (v: EasyWorshipVersion) => void;
  language: SupportedLanguage;
  setLanguage: (l: SupportedLanguage) => void;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  appearance: Appearance;
  onAppearanceChange: (a: Appearance) => void;
  /** 2026-11-15: simulated outputs (Simulator tab only) — moved here from the Simulator toolbar, like the mockup. */
  status?: { onAir: boolean; foldback: boolean; ndi: boolean } | null;
}

/** Small clock for the app bar (desktop, Simulator tab). */
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const StatusClock: React.FC = () => <span className="hidden font-mono text-xs tabular-nums text-fg-subtle xl:inline">{useClock()}</span>;

const chipCls = "inline-flex h-8 items-center gap-2 rounded-md border border-line px-3 text-xs font-medium text-fg-muted";

/** Full screen for the whole app (Fullscreen API). Hidden where the browser can't do it (e.g. iPhone Safari). */
function useFullscreen() {
  const supported = typeof document !== "undefined" && !!document.fullscreenEnabled && !!document.documentElement.requestFullscreen;
  const [on, setOn] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement);
  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };
  return { supported, on, toggle };
}

// 2026-11-15: same dropdown without its own box (sits inside the grouped box)
const groupSelectCls =
  "h-8 rounded-md border border-transparent bg-transparent pl-2.5 pr-7 text-xs font-medium text-fg hover:bg-surface-3 focus:outline-none focus:border-accent cursor-pointer appearance-none bg-no-repeat bg-[length:12px] bg-[right_0.5rem_center]";
// neutral gray chevron that reads in both themes
const chevron = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238b8b94' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
};

export const Header: React.FC<HeaderProps> = ({ version, setVersion, language, setLanguage, activeTab, setActiveTab, appearance, onAppearanceChange, status }) => {
  const [showAppearance, setShowAppearance] = useState(false);
  const fs = useFullscreen();
  // 2026-11-16: account (optional login; the plan unlocks paid features — lib/auth.ts)
  const [showAccount, setShowAccount] = useState(START.openAccount);
  const auth = useAuth();
  useEffect(() => onOpenAccount(() => setShowAccount(true)), []);
  const accountTitle = auth.status === "user" ? `Account: ${auth.name} · ${PLAN_LABEL[planFromRoles(auth.roles)]}` : "Account: mag-login o gumawa ng account";
  return (
    // 2026-11-15 (Sanctuary mockup): desktop app bar sits on the canvas (no bar color), controls are grouped boxes
    <header className="relative z-50 shrink-0 border-b border-line bg-surface lg:border-transparent lg:bg-transparent">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-3 sm:px-5 lg:h-16 lg:px-4">
        {/* Brand */}
        <div className="flex shrink-0 items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-on-accent shadow-sm">
            <MonitorPlay className="h-4 w-4" strokeWidth={2.25} />
          </div>
          <div className="leading-tight">
            <div className="font-display text-base font-medium tracking-tight text-fg max-[419px]:sr-only">WorshipTech-Pro</div>
            <div className="hidden text-xs text-fg-subtle sm:block">Church presentation companion</div>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="ml-4 hidden items-center gap-1 rounded-lg border border-line bg-surface-2 p-1 lg:flex" aria-label="Main">
          {NAV_ITEMS.map(({ id, label, icon: Icon, hint }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                title={hint}
                aria-current={active ? "page" : undefined}
                className={`inline-flex h-8 items-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors ${
                  active ? "bg-fg text-canvas shadow-sm" : "text-fg-muted hover:bg-surface-3 hover:text-fg"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </nav>

        {/* Right controls */}
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {status && (
            <div className="hidden items-center gap-2 lg:flex" title="Simulated outputs (hindi totoong koneksyon)">
              <span className={chipCls}>
                <span className={`h-2 w-2 rounded-full ${status.onAir ? "bg-live shadow-[0_0_0_3px_color-mix(in_srgb,var(--c-live)_25%,transparent)]" : "bg-fg-subtle"}`} />
                Main
              </span>
              <span className={chipCls}>
                <span className={`h-2 w-2 rounded-full ${status.foldback || status.ndi ? "bg-ok" : "bg-fg-subtle"}`} />
                Foldback · NDI
              </span>
              <StatusClock />
            </div>
          )}
          {/* EW version + language in one box (two real dropdowns) */}
          <div className="flex items-center rounded-md border border-line bg-surface-2">
          <label className="sr-only" htmlFor="ew-version">
            Software version
          </label>
          <select id="ew-version" value={version} onChange={(e) => setVersion(e.target.value as EasyWorshipVersion)} className={groupSelectCls} style={chevron} title="Software version">
            {VERSIONS.map((v) => (
              <option key={v} value={v}>
                {versionLabel(v)}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="ui-language">
            Language
          </label>
          <span className="h-4 w-px bg-line" aria-hidden />
          <select id="ui-language" value={language} onChange={(e) => setLanguage(e.target.value as SupportedLanguage)} className={groupSelectCls} style={chevron} title="Wika ng sagot / Language">
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          </div>
          {fs.supported && (
            <button
              type="button"
              onClick={fs.toggle}
              className="btn btn-ghost btn-icon tap-target lg:border-line"
              title={fs.on ? "Lumabas sa full screen (Esc)" : "Full screen (parang F11)"}
              aria-label={fs.on ? "Exit full screen" : "Full screen"}
              aria-pressed={fs.on}
            >
              {fs.on ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAppearance((v) => !v)}
            data-appearance-toggle
            className="btn btn-ghost btn-icon tap-target lg:border-line"
            title="Appearance: mode, kulay, background"
            aria-label="Appearance"
            aria-expanded={showAppearance}
          >
            <Palette className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowAccount(true)}
            className="btn btn-ghost btn-icon tap-target relative lg:border-line"
            title={accountTitle}
            aria-label={accountTitle}
            data-testid="account-button"
          >
            <CircleUserRound className="h-4 w-4" />
            {auth.status === "user" && <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ${auth.offline ? "bg-warn" : "bg-ok"}`} aria-hidden />}
          </button>
        </div>
      </div>
      {showAppearance && <AppearancePanel value={appearance} onChange={onAppearanceChange} onClose={() => setShowAppearance(false)} />}
      {showAccount && <AccountModal auth={auth} returned={START.returned} onClose={() => setShowAccount(false)} />}
    </header>
  );
};

/** Phones / tablets: bottom navigation (hidden from lg up). */
export const MobileNav: React.FC<{ activeTab: AppTab; setActiveTab: (t: AppTab) => void }> = ({ activeTab, setActiveTab }) => (
  <nav className="grid shrink-0 grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Main mobile">
    {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
      const active = activeTab === id;
      return (
        <button
          key={id}
          onClick={() => setActiveTab(id)}
          aria-current={active ? "page" : undefined}
          className={`flex min-h-[56px] flex-col items-center justify-center gap-1 text-xs font-medium transition-colors ${
            // 2026-11-07: accent-text (not accent) so the 12px label stays readable with every accent color
            active ? "text-accent-text" : "text-fg-subtle hover:text-fg"
          }`}
        >
          <Icon className="h-5 w-5" />
          {label}
        </button>
      );
    })}
  </nav>
);
