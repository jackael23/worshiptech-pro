import React, { useState } from "react";
import {
  BookOpen,
  FileMusic,
  Radio,
  Monitor,
  CheckCircle,
  Sparkles,
  Play,
  ArrowRight,
  HelpCircle,
  Tv,
  Layers,
} from "lucide-react";
import { WorkflowGuide, SupportedLanguage, EasyWorshipVersion } from "../types";
import { WORKFLOW_GUIDES } from "../data/easyworshipData";

interface VisualGuidesDeckProps {
  language: SupportedLanguage;
  version: EasyWorshipVersion;
  onOpenSimulator: () => void;
  onAskAI: (query: string) => void;
}

export const VisualGuidesDeck: React.FC<VisualGuidesDeckProps> = ({
  language,
  version,
  onOpenSimulator,
  onAskAI,
}) => {
  const [selectedGuideId, setSelectedGuideId] = useState<string>(WORKFLOW_GUIDES[0].id);
  const [activeStepNumber, setActiveStepNumber] = useState<number>(1);

  const currentGuide =
    WORKFLOW_GUIDES.find((g) => g.id === selectedGuideId) || WORKFLOW_GUIDES[0];

  const getPanelBadgeColor = (panel: string) => {
    switch (panel) {
      // 2026-10-20 (Jarvis) D4: one accent (blue) for the main panel, red = LIVE (status), rest neutral.
      case "Media Library":
        return "bg-slate-100 text-slate-700 border-slate-200";
      case "Service Canvas":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "Preview Window":
        return "bg-slate-100 text-slate-700 border-slate-200";
      case "LIVE Output":
        return "bg-red-50 text-red-700 border-red-200";
      case "Options Menu":
        return "bg-slate-100 text-slate-700 border-slate-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="max-w-6xl mx-auto w-full space-y-6">
      {/* Category selector header */}
      <div className="bg-white border border-slate-200 p-4 sm:p-5 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <span>Interactive Visual Workflow Guides</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Minimalist step-by-step action guides with clear panel boxes and keyboard hotkeys.
          </p>
        </div>

        {/* Guide Selector Chips */}
        <div className="flex flex-wrap gap-2">
          {WORKFLOW_GUIDES.map((g) => {
            const isSelected = g.id === selectedGuideId;
            return (
              <button
                key={g.id}
                onClick={() => {
                  setSelectedGuideId(g.id);
                  setActiveStepNumber(1);
                }}
                className={`px-3 py-1.5 min-h-[44px] lg:min-h-0 rounded-lg text-xs font-semibold border transition-all ${
                  isSelected
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {language === "Tagalog" ? g.titleTl : g.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Guide Main Display Box */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        {/* Guide Overview Bar */}
        <div className="p-4 sm:p-6 bg-slate-50/70 border-b border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold uppercase tracking-wider">
                  Category: {currentGuide.category}
                </span>
                <span className="text-xs text-slate-500 font-medium">Target: {version}</span>
              </div>
              <h3 className="text-lg sm:text-xl font-extrabold text-slate-900">
                {language === "Tagalog" ? currentGuide.titleTl : currentGuide.title}
              </h3>
              <p className="text-sm text-slate-600 mt-1 max-w-3xl leading-relaxed">
                {language === "Tagalog" ? currentGuide.summaryTl : currentGuide.summary}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onOpenSimulator}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 min-h-[44px] lg:min-h-0 rounded-lg flex items-center gap-1.5 shadow-xs transition-all"
              >
                <Tv className="w-4 h-4" />
                <span>Practice in Simulator</span>
              </button>
              <button
                onClick={() =>
                  onAskAI(
                    language === "Tagalog"
                      ? `I-explain pa nang mas detalyado ang: ${currentGuide.titleTl}`
                      : `Explain further in detail: ${currentGuide.title}`
                  )
                }
                className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold px-3 py-2 min-h-[44px] lg:min-h-0 rounded-lg flex items-center gap-1.5 transition-all shadow-xs"
              >
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>Ask AI Details</span>
              </button>
            </div>
          </div>

          {/* Involved Panels Chips */}
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-200/80 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Panels Involved:</span>
            <div className="flex flex-wrap gap-1.5">
              {currentGuide.panelsInvolved.map((p, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 bg-white text-slate-700 rounded-md border border-slate-200 font-mono text-xs shadow-2xs"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Stepper Navigation Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-slate-200 bg-slate-50/50">
          {currentGuide.steps.map((step) => {
            const isActive = step.stepNumber === activeStepNumber;
            return (
              <button
                key={step.stepNumber}
                onClick={() => setActiveStepNumber(step.stepNumber)}
                className={`p-3 text-left border-r last:border-r-0 border-slate-200 transition-all ${
                  isActive
                    ? "bg-white border-b-2 border-b-blue-600 text-blue-700 font-semibold"
                    : "text-slate-600 hover:bg-slate-100/70"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                      isActive ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {step.stepNumber}
                  </span>
                  <span className="text-xs font-mono text-slate-400 uppercase">
                    Step {step.stepNumber} of 4
                  </span>
                </div>
                <div className="text-xs font-semibold truncate">
                  {language === "Tagalog" ? step.titleTl : step.title}
                </div>
              </button>
            );
          })}
        </div>

        {/* Step Detailed Visual Box */}
        <div className="p-6">
          {currentGuide.steps
            .filter((s) => s.stepNumber === activeStepNumber)
            .map((step) => (
              <div key={step.stepNumber} className="space-y-6">
                {/* Visual Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-blue-600 text-white font-extrabold text-lg flex items-center justify-center shadow-xs">
                      {step.stepNumber}
                    </span>
                    <div>
                      <h4 className="text-base sm:text-lg font-bold text-slate-900">
                        {language === "Tagalog" ? step.titleTl : step.title}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`text-xs px-2 py-0.5 rounded border font-semibold ${getPanelBadgeColor(
                            step.panel
                          )}`}
                        >
                          Target Panel: {step.panel}
                        </span>
                        {step.shortcut && (
                          <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 font-mono font-medium">
                            Hotkey: {step.shortcut}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Instruction Box */}
                <div className="bg-slate-50 p-4 sm:p-5 rounded-xl border border-slate-200 text-sm leading-relaxed text-slate-700">
                  <p className="text-base font-semibold text-slate-900 mb-2">
                    {language === "Tagalog" ? step.descriptionTl : step.description}
                  </p>
                  {language !== "Tagalog" && (
                    <p className="text-xs text-slate-500 italic">
                      Filipino summary: {step.descriptionTl}
                    </p>
                  )}
                </div>

                {/* Pro-Tip Box */}
                {step.proTip && (
                  <div className="bg-blue-50/80 border border-blue-200 p-3.5 rounded-lg flex items-start gap-2.5 text-xs text-blue-900">
                    <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold text-blue-950">AV Tech Pro-Tip: </strong>
                      <span>{step.proTip}</span>
                    </div>
                  </div>
                )}

                {/* Step navigation buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                  <button
                    disabled={activeStepNumber === 1}
                    onClick={() => setActiveStepNumber((prev) => Math.max(1, prev - 1))}
                    className="px-3.5 py-1.5 min-h-[44px] lg:min-h-0 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    &larr; Previous Step
                  </button>

                  <div className="flex items-center gap-2">
                    {activeStepNumber < 4 ? (
                      <button
                        onClick={() => setActiveStepNumber((prev) => Math.min(4, prev + 1))}
                        className="px-4 py-1.5 min-h-[44px] lg:min-h-0 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-xs transition-colors"
                      >
                        <span>Next Step</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={onOpenSimulator}
                        className="px-4 py-1.5 min-h-[44px] lg:min-h-0 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-xs transition-colors"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Done! Try in Simulator</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
