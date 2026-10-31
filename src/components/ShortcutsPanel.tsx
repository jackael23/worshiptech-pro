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
      <div className="bg-white border border-slate-200 p-4 sm:p-5 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-blue-600" />
            <span>EasyWorship Hotkeys & Version Comparison</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Official keyboard shortcuts for {HOTKEYS_VERIFIED_FOR} (
            <a href={HOTKEYS_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              EasyWorship support
            </a>
            ).
          </p>
          {!isVerifiedVersion && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mt-2">
              {version}: hindi pa na-verify ang listahang ito. I-check sa Help menu ng software bago gamitin sa live service.
            </p>
          )}
        </div>

        <button
          onClick={() => onAskAI("Ano ang pinakamahalagang shortcuts na dapat kabisaduhin ng media team?")}
          className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold px-3.5 py-2 min-h-[44px] lg:min-h-0 rounded-lg flex items-center gap-1.5 transition-all shadow-xs"
        >
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span>Ask AI Shortcut Tips</span>
        </button>
      </div>

      {/* 3 Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Emergency & Live Controls */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-red-600 font-bold text-xs uppercase tracking-wider border-b border-slate-100 pb-2">
            <Zap className="w-4 h-4" />
            <span>Emergency & Live Control</span>
          </div>

          <div className="space-y-2">
            {emergencyShortcuts.map((s, idx) => (
              <div
                key={idx}
                className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 flex items-center justify-between gap-2"
              >
                <span className="text-xs text-slate-700 font-medium">{s.action}</span>
                <kbd className="px-2 py-1 bg-white text-slate-800 font-mono text-xs font-bold rounded border border-slate-200 shadow-2xs shrink-0">
                  {s.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>

        {/* Slide Navigation */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-blue-600 font-bold text-xs uppercase tracking-wider border-b border-slate-100 pb-2">
            <Tv className="w-4 h-4" />
            <span>Slide & Verse Navigation</span>
          </div>

          <div className="space-y-2">
            {navigationShortcuts.map((s, idx) => (
              <div
                key={idx}
                className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 flex items-center justify-between gap-2"
              >
                <span className="text-xs text-slate-700 font-medium">{s.action}</span>
                <kbd className="px-2 py-1 bg-white text-slate-800 font-mono text-xs font-bold rounded border border-slate-200 shadow-2xs shrink-0">
                  {s.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>

        {/* Library & Schedule Management */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-slate-700 font-bold text-xs uppercase tracking-wider border-b border-slate-100 pb-2">
            <Layers className="w-4 h-4 text-blue-600" />
            <span>Schedule & Alerts</span>
          </div>

          <div className="space-y-2">
            {workflowShortcuts.map((s, idx) => (
              <div
                key={idx}
                className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 flex items-center justify-between gap-2"
              >
                <span className="text-xs text-slate-700 font-medium">{s.action}</span>
                <kbd className="px-2 py-1 bg-white text-slate-800 font-mono text-xs font-bold rounded border border-slate-200 shadow-2xs shrink-0">
                  {s.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* EasyWorship Version Feature Matrix */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span>EasyWorship Version Differences & Capabilities</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold">
                <th className="py-2.5 px-3">Feature Capability</th>
                <th className="py-2.5 px-3">EasyWorship 2009</th>
                <th className="py-2.5 px-3">EasyWorship 6</th>
                <th className="py-2.5 px-3 text-blue-700 font-bold">EasyWorship 7 / Modern</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600">
              <tr className="hover:bg-slate-50/50">
                <td className="py-2.5 px-3 font-semibold text-slate-800">NDI Live Streaming Output</td>
                <td className="py-2.5 px-3 text-red-600">❌ Not Supported</td>
                <td className="py-2.5 px-3 text-amber-600">⚠️ Limited (via plugin)</td>
                <td className="py-2.5 px-3 text-emerald-600 font-bold">✅ Native NDI 4/5 Output</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="py-2.5 px-3 font-semibold text-slate-800">Stage Foldback Confidence Screen</td>
                <td className="py-2.5 px-3 text-red-600">❌ Basic 2nd output only</td>
                <td className="py-2.5 px-3 text-emerald-600">✅ Foldback with Clock</td>
                <td className="py-2.5 px-3 text-emerald-600 font-bold">✅ Advanced Foldback + Next line</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="py-2.5 px-3 font-semibold text-slate-800">Transparent Alpha Channel / Lower Thirds</td>
                <td className="py-2.5 px-3 text-red-600">❌ Color keying required</td>
                <td className="py-2.5 px-3 text-amber-600">⚠️ Manual Black Key</td>
                <td className="py-2.5 px-3 text-emerald-600 font-bold">✅ Direct Alpha / Broadcast Key</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="py-2.5 px-3 font-semibold text-slate-800">Song Database & CCLI SongSelect</td>
                <td className="py-2.5 px-3 text-amber-600">Legacy CCLI Import</td>
                <td className="py-2.5 px-3 text-emerald-600">✅ Integrated SongSelect</td>
                <td className="py-2.5 px-3 text-emerald-600 font-bold">✅ Cloud Sync + SongSelect</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="py-2.5 px-3 font-semibold text-slate-800">Multi-Track Audio & Video Loops</td>
                <td className="py-2.5 px-3 text-slate-400">WMV / MPG only</td>
                <td className="py-2.5 px-3 text-emerald-600">MP4, MOV, Codec engine</td>
                <td className="py-2.5 px-3 text-emerald-600 font-bold">4K Hardware accelerated decode</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
