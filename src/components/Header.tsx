/**
 * 2026-10-28 (Jarvis): redesigned app bar ("Pro Dark" design system).
 *  - One compact row: brand · nav · EW version · language · theme toggle.
 *  - Phones: nav moves to a bottom bar (MobileNav) with 44px+ targets.
 *  - The simulated output status moved into the Simulator itself (it isn't a real connection).
 */
import React from "react";
import { EasyWorshipVersion, SupportedLanguage } from "../types";
import { BookOpen, Layers, Keyboard, MessageSquare, Moon, Sun, MonitorPlay } from "lucide-react";

export type AppTab = "chat" | "simulator" | "guides" | "shortcuts";
export type Theme = "dark" | "light";

export const NAV_ITEMS: { id: AppTab; label: string; icon: React.ElementType; hint: string }[] = [
  // 2026-10-29: Simulator first — it's the main screen now (opens by default)
  { id: "simulator", label: "Simulator", icon: Layers, hint: "Practice EasyWorship" },
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
  theme: Theme;
  onToggleTheme: () => void;
}

const selectCls =
  "h-8 rounded-md border border-line bg-surface-2 pl-2.5 pr-7 text-xs font-medium text-fg hover:border-line-strong focus:outline-none focus:border-accent cursor-pointer appearance-none bg-no-repeat bg-[length:12px] bg-[right_0.5rem_center]";
// neutral gray chevron that reads in both themes
const chevron = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238b8b94' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
};

export const Header: React.FC<HeaderProps> = ({ version, setVersion, language, setLanguage, activeTab, setActiveTab, theme, onToggleTheme }) => {
  return (
    <header className="z-50 shrink-0 border-b border-line bg-surface">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-3 sm:px-5">
        {/* Brand */}
        <div className="flex shrink-0 items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white shadow-sm">
            <MonitorPlay className="h-4 w-4" strokeWidth={2.25} />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-fg max-[419px]:sr-only">WorshipTech-Pro</div>
            <div className="hidden text-xs text-fg-subtle sm:block">EasyWorship companion</div>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="ml-3 hidden items-center gap-1 border-l border-line pl-4 lg:flex" aria-label="Main">
          {NAV_ITEMS.map(({ id, label, icon: Icon, hint }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                title={hint}
                aria-current={active ? "page" : undefined}
                className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${
                  active ? "bg-surface-3 text-fg ring-1 ring-line" : "text-fg-muted hover:bg-surface-3/60 hover:text-fg"
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? "text-accent" : ""}`} />
                {label}
              </button>
            );
          })}
        </nav>

        {/* Right controls */}
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <label className="sr-only" htmlFor="ew-version">
            EasyWorship version
          </label>
          <select id="ew-version" value={version} onChange={(e) => setVersion(e.target.value as EasyWorshipVersion)} className={selectCls} style={chevron} title="EasyWorship version">
            {VERSIONS.map((v) => (
              <option key={v} value={v}>
                {v.replace("EasyWorship ", "EW ")}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="ui-language">
            Language
          </label>
          <select id="ui-language" value={language} onChange={(e) => setLanguage(e.target.value as SupportedLanguage)} className={selectCls} style={chevron} title="Wika ng sagot / Language">
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <button
            onClick={onToggleTheme}
            className="btn btn-ghost btn-icon tap-target"
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
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
            active ? "text-accent" : "text-fg-subtle hover:text-fg"
          }`}
        >
          <Icon className="h-5 w-5" />
          {label}
        </button>
      );
    })}
  </nav>
);
