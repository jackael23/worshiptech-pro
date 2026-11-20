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
import { WorkflowGuide, SupportedLanguage, EasyWorshipVersion, versionLabel } from "../types";
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
        return "bg-surface-3 text-fg border-line";
      case "Service Canvas":
        return "bg-accent-soft text-accent-text border-accent/30";
      case "Preview Window":
        return "bg-surface-3 text-fg border-line";
      case "LIVE Output":
        return "bg-live-soft text-live-text border-live/40";
      case "Options Menu":
        return "bg-surface-3 text-fg border-line";
      default:
        return "bg-surface-3 text-fg border-line";
    }
  };

  return (
    <div className="max-w-6xl mx-auto w-full space-y-6">
      {/* Category selector header */}
      <div className="bg-surface border border-line p-4 sm:p-5 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg sm:text-xl font-medium tracking-tight text-fg flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-accent-text" />
            <span>Interactive Visual Workflow Guides</span>
          </h2>
          <p className="text-xs text-fg-muted mt-0.5">
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
                    ? "bg-accent text-on-accent border-accent shadow-xs"
                    : "bg-surface-2 text-fg border-line hover:bg-surface-3"
                }`}
              >
                {language === "Tagalog" ? g.titleTl : g.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Guide Main Display Box */}
      <div className="bg-surface border border-line rounded-xl overflow-hidden shadow-xs">
        {/* Guide Overview Bar */}
        <div className="p-4 sm:p-6 bg-surface-2 border-b border-line">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-2.5 py-0.5 rounded-full bg-accent-soft text-accent-text border border-accent/30 text-xs font-bold uppercase tracking-wider">
                  Category: {currentGuide.category}
                </span>
                <span className="text-xs text-fg-muted font-medium">Target: {versionLabel(version)}</span>
              </div>
              <h3 className="font-display text-xl sm:text-2xl font-medium tracking-tight text-fg">
                {language === "Tagalog" ? currentGuide.titleTl : currentGuide.title}
              </h3>
              <p className="text-sm text-fg-muted mt-1 max-w-3xl leading-relaxed">
                {language === "Tagalog" ? currentGuide.summaryTl : currentGuide.summary}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onOpenSimulator}
                className="bg-accent hover:bg-accent-hover text-on-accent text-xs font-bold px-3.5 py-2 min-h-[44px] lg:min-h-0 rounded-lg flex items-center gap-1.5 shadow-xs transition-all"
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
                // 2026-11-17 (Jarvis): no "Ask AI" on tablets / phones (Jack) — shown only on a wide screen with a mouse
                className="bg-surface hover:bg-surface-2 text-fg border border-line text-xs font-semibold px-3 py-2 min-h-[44px] lg:min-h-0 rounded-lg hidden lg:pointer-fine:flex items-center gap-1.5 transition-all shadow-xs"
                data-testid="ask-ai-guides"
              >
                <Sparkles className="w-4 h-4 text-accent-text" />
                <span>Ask AI Details</span>
              </button>
            </div>
          </div>

          {/* Involved Panels Chips */}
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-line text-xs text-fg-muted">
            <span className="font-semibold text-fg">Panels Involved:</span>
            <div className="flex flex-wrap gap-1.5">
              {currentGuide.panelsInvolved.map((p, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 bg-surface text-fg rounded-md border border-line font-mono text-xs shadow-2xs"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Stepper Navigation Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-line bg-surface-2">
          {currentGuide.steps.map((step) => {
            const isActive = step.stepNumber === activeStepNumber;
            return (
              <button
                key={step.stepNumber}
                onClick={() => setActiveStepNumber(step.stepNumber)}
                className={`p-3 text-left border-r last:border-r-0 border-line transition-all ${
                  isActive
                    ? "bg-surface border-b-2 border-b-accent text-accent-text font-semibold"
                    : "text-fg-muted hover:bg-surface-3"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                      isActive ? "bg-accent text-on-accent" : "bg-surface-3 text-fg-muted"
                    }`}
                  >
                    {step.stepNumber}
                  </span>
                  <span className="text-xs font-mono text-fg-subtle uppercase">
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
                    <span className="w-9 h-9 rounded-xl bg-accent text-on-accent font-extrabold text-lg flex items-center justify-center shadow-xs">
                      {step.stepNumber}
                    </span>
                    <div>
                      <h4 className="text-base sm:text-lg font-bold text-fg">
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
                          <span className="text-xs bg-surface-3 text-fg px-2 py-0.5 rounded border border-line font-mono font-medium">
                            Hotkey: {step.shortcut}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Instruction Box */}
                <div className="bg-surface-2 p-4 sm:p-5 rounded-xl border border-line text-sm leading-relaxed text-fg">
                  <p className="text-base font-semibold text-fg mb-2">
                    {language === "Tagalog" ? step.descriptionTl : step.description}
                  </p>
                  {language !== "Tagalog" && (
                    <p className="text-xs text-fg-muted italic">
                      Filipino summary: {step.descriptionTl}
                    </p>
                  )}
                </div>

                {/* Pro-Tip Box */}
                {step.proTip && (
                  <div className="bg-accent-soft border border-accent/30 p-3.5 rounded-lg flex items-start gap-2.5 text-xs text-accent-text">
                    <Sparkles className="w-4 h-4 text-accent-text shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold text-accent-text">AV Tech Pro-Tip: </strong>
                      <span>{step.proTip}</span>
                    </div>
                  </div>
                )}

                {/* Step navigation buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-line">
                  <button
                    disabled={activeStepNumber === 1}
                    onClick={() => setActiveStepNumber((prev) => Math.max(1, prev - 1))}
                    className="px-3.5 py-1.5 min-h-[44px] lg:min-h-0 rounded-lg text-xs font-semibold bg-surface-3 text-fg hover:bg-line disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    &larr; Previous Step
                  </button>

                  <div className="flex items-center gap-2">
                    {activeStepNumber < 4 ? (
                      <button
                        onClick={() => setActiveStepNumber((prev) => Math.min(4, prev + 1))}
                        className="px-4 py-1.5 min-h-[44px] lg:min-h-0 rounded-lg text-xs font-bold bg-accent hover:bg-accent-hover text-on-accent flex items-center gap-1.5 shadow-xs transition-colors"
                      >
                        <span>Next Step</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={onOpenSimulator}
                        className="px-4 py-1.5 min-h-[44px] lg:min-h-0 rounded-lg text-xs font-bold bg-accent hover:bg-accent-hover text-on-accent flex items-center gap-1.5 shadow-xs transition-colors"
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
