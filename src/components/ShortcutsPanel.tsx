import React from "react";
import { Keyboard, Zap, Sparkles, AlertTriangle, Layers, Tv, HelpCircle } from "lucide-react";
import { EASYWORSHIP_SHORTCUTS, HOTKEYS_SOURCE_URL, HOTKEYS_VERIFIED_FOR } from "../data/easyworshipData";
import { EasyWorshipVersion } from "../types";

interface ShortcutsPanelProps {
  version: EasyWorshipVersion;
  onAskAI: (query: string) => void;
}

export const ShortcutsPanel: React.FC<ShortcutsPanelProps> = ({ version, onAskAI }) => {
  const emergencyShortcuts = EASYWORSHIP_SHORTCUTS.filter((s) => s.category === "Emergency" || s.category === "Output");
  const navigationShortcuts = EASYWORSHIP_SHORTCUTS.filter((s) => s.category === "Navigation");
  const workflowShortcuts = EASYWORSHIP_SHORTCUTS.filter((s) => s.category === "Schedule");
  const isVerifiedVersion = version === HOTKEYS_VERIFIED_FOR;

  return (
    <div className="max-w-6xl mx-auto w-full space-y-6">
      {/* Top Banner */}
      <div className="bg-surface border border-line p-4 sm:p-5 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg sm:text-xl font-medium tracking-tight text-fg flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-accent-text" />
            <span>EasyWorship Hotkeys & Version Comparison</span>
          </h2>
          <p className="text-xs text-fg-muted mt-0.5">
            Official keyboard shortcuts for {HOTKEYS_VERIFIED_FOR} (
            <a href={HOTKEYS_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">
              EasyWorship support
            </a>
            ).
          </p>
          {!isVerifiedVersion && (
            <p className="text-xs text-warn-text bg-warn-soft border border-warn/40 rounded-md px-2 py-1 mt-2">
              {version}: hindi pa na-verify ang listahang ito. I-check sa Help menu ng software bago gamitin sa live service.
            </p>
          )}
        </div>

        <button
          onClick={() => onAskAI("Ano ang pinakamahalagang shortcuts na dapat kabisaduhin ng media team?")}
          className="bg-surface hover:bg-surface-2 text-fg border border-line text-xs font-semibold px-3.5 py-2 min-h-[44px] lg:min-h-0 rounded-lg flex items-center gap-1.5 transition-all shadow-xs"
        >
          <Sparkles className="w-4 h-4 text-accent-text" />
          <span>Ask AI Shortcut Tips</span>
        </button>
      </div>

      {/* 3 Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Emergency & Live Controls */}
        <div className="bg-surface border border-line rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-live-text font-bold text-xs uppercase tracking-wider border-b border-line pb-2">
            <Zap className="w-4 h-4" />
            <span>Emergency & Live Control</span>
          </div>

          <div className="space-y-2">
            {emergencyShortcuts.map((s, idx) => (
              <div
                key={idx}
                className="bg-surface-2 p-2.5 rounded-lg border border-line flex items-center justify-between gap-2"
              >
                <span className="text-xs text-fg font-medium">{s.action}</span>
                <kbd className="px-2 py-1 bg-surface text-fg font-mono text-xs font-bold rounded border border-line shadow-2xs shrink-0">
                  {s.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>

        {/* Slide Navigation */}
        <div className="bg-surface border border-line rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-accent-text font-bold text-xs uppercase tracking-wider border-b border-line pb-2">
            <Tv className="w-4 h-4" />
            <span>Slide & Verse Navigation</span>
          </div>

          <div className="space-y-2">
            {navigationShortcuts.map((s, idx) => (
              <div
                key={idx}
                className="bg-surface-2 p-2.5 rounded-lg border border-line flex items-center justify-between gap-2"
              >
                <span className="text-xs text-fg font-medium">{s.action}</span>
                <kbd className="px-2 py-1 bg-surface text-fg font-mono text-xs font-bold rounded border border-line shadow-2xs shrink-0">
                  {s.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>

        {/* Library & Schedule Management */}
        <div className="bg-surface border border-line rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-fg font-bold text-xs uppercase tracking-wider border-b border-line pb-2">
            <Layers className="w-4 h-4 text-accent-text" />
            <span>Schedule & Alerts</span>
          </div>

          <div className="space-y-2">
            {workflowShortcuts.map((s, idx) => (
              <div
                key={idx}
                className="bg-surface-2 p-2.5 rounded-lg border border-line flex items-center justify-between gap-2"
              >
                <span className="text-xs text-fg font-medium">{s.action}</span>
                <kbd className="px-2 py-1 bg-surface text-fg font-mono text-xs font-bold rounded border border-line shadow-2xs shrink-0">
                  {s.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* EasyWorship Version Feature Matrix */}
      <div className="bg-surface border border-line rounded-xl p-5 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-fg uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent-text" />
          <span>EasyWorship Version Differences & Capabilities</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-fg-muted font-semibold">
                <th className="py-2.5 px-3">Feature Capability</th>
                <th className="py-2.5 px-3">EasyWorship 2009</th>
                <th className="py-2.5 px-3">EasyWorship 6</th>
                <th className="py-2.5 px-3 text-accent-text font-bold">EasyWorship 7 / Modern</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-fg-muted">
              <tr className="hover:bg-surface-2">
                <td className="py-2.5 px-3 font-semibold text-fg">NDI Live Streaming Output</td>
                <td className="py-2.5 px-3 text-live-text">❌ Not Supported</td>
                <td className="py-2.5 px-3 text-warn-text">⚠️ Limited (via plugin)</td>
                <td className="py-2.5 px-3 text-ok font-bold">✅ Native NDI 4/5 Output</td>
              </tr>
              <tr className="hover:bg-surface-2">
                <td className="py-2.5 px-3 font-semibold text-fg">Stage Foldback Confidence Screen</td>
                <td className="py-2.5 px-3 text-live-text">❌ Basic 2nd output only</td>
                <td className="py-2.5 px-3 text-ok">✅ Foldback with Clock</td>
                <td className="py-2.5 px-3 text-ok font-bold">✅ Advanced Foldback + Next line</td>
              </tr>
              <tr className="hover:bg-surface-2">
                <td className="py-2.5 px-3 font-semibold text-fg">Transparent Alpha Channel / Lower Thirds</td>
                <td className="py-2.5 px-3 text-live-text">❌ Color keying required</td>
                <td className="py-2.5 px-3 text-warn-text">⚠️ Manual Black Key</td>
                <td className="py-2.5 px-3 text-ok font-bold">✅ Direct Alpha / Broadcast Key</td>
              </tr>
              <tr className="hover:bg-surface-2">
                <td className="py-2.5 px-3 font-semibold text-fg">Song Database & CCLI SongSelect</td>
                <td className="py-2.5 px-3 text-warn-text">Legacy CCLI Import</td>
                <td className="py-2.5 px-3 text-ok">✅ Integrated SongSelect</td>
                <td className="py-2.5 px-3 text-ok font-bold">✅ Cloud Sync + SongSelect</td>
              </tr>
              <tr className="hover:bg-surface-2">
                <td className="py-2.5 px-3 font-semibold text-fg">Multi-Track Audio & Video Loops</td>
                <td className="py-2.5 px-3 text-fg-subtle">WMV / MPG only</td>
                <td className="py-2.5 px-3 text-ok">MP4, MOV, Codec engine</td>
                <td className="py-2.5 px-3 text-ok font-bold">4K Hardware accelerated decode</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
