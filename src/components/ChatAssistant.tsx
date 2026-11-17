import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send,
  Sparkles,
  User,
  RotateCcw,
  Copy,
  Check,
  PlayCircle,
  Volume2,
  Square,
  Tv,
  FileMusic,
  BookOpen,
  Monitor,
  Music2,
  ArrowUpDown,
  Guitar,
  Keyboard,
} from "lucide-react";
import { ChatMessage, EasyWorshipVersion, SupportedLanguage } from "../types";
import { answerHelpQuestion } from "../lib/helpSearch";

interface ChatAssistantProps {
  version: EasyWorshipVersion;
  language: SupportedLanguage;
  onOpenSimulator: () => void;
  onOpenGuides: (guideId?: string) => void;
}

// 2026-11-17 (Jarvis): Help chat without AI (Gemini removed). Topics for operators AND musicians;
// each text is phrased so lib/helpSearch.ts finds the right article / tool.
const PRESET_QUERIES = [
  { icon: FileMusic, tag: "Add Song", text: "Paano maglagay ng kanta sa schedule?", enText: "How do I add a song to the schedule?" },
  { icon: Music2, tag: "Chords", text: "Paano maglagay ng chords?", enText: "How do I add chords?" },
  { icon: Monitor, tag: "Stage Screen", text: "Paano buksan ang Stage screen?", enText: "How do I open the Stage screen?" },
  { icon: ArrowUpDown, tag: "Transpose", text: "Paano mag-transpose?", enText: "How do I transpose?" },
  { icon: Guitar, tag: "Capo", text: "Capo calculator", enText: "Capo calculator" },
  { icon: BookOpen, tag: "Bible", text: "Paano ipakita ang Juan 3:16?", enText: "How do I show John 3:16?" },
  { icon: Tv, tag: "Projector", text: "Paano ilabas sa projector?", enText: "How do I show it on the projector?" },
  { icon: Keyboard, tag: "Hotkeys", text: "Ano ang mga shortcut keys?", enText: "What are the shortcut keys?" },
];

// ---------- 2026-10-28 (Jarvis): welcome message, saved chat, voice ----------

const CHAT_KEY = "wtp-chat-v1";
const MAX_SAVED_MESSAGES = 80;
const nowTime = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// 2026-11-17 (Jarvis): no longer an AI assistant — offline Help for the media team and the band.
function welcomeText(version: EasyWorshipVersion, language: SupportedLanguage, reset: boolean): string {
  if (language === "English") {
    if (reset) return `Chat cleared. What do you need help with?`;
    return `### 👋 Hi! This is **WorshipTech-Pro Help**
Quick answers for the media team **and the band**, even with no internet.

- 🎵 **Songs, chords and the Schedule**
- 🖥️ **Projector, Stage screen and alerts**
- 🎸 **Transpose and capo**: type \`G to E\` or \`capo 3 G\`
- 📖 **Bible verses** and ⌨️ **hotkeys** (Page Down, Ctrl+B…)

Pick a topic below or type a short question!`;
  }
  if (language === "Taglish") {
    if (reset) return `Cleared na ang chat. Ano'ng kailangan mo?`;
    return `### 👋 Hi! Ito ang **WorshipTech-Pro Help**
Quick answers para sa media team **at sa banda**, kahit walang internet.

- 🎵 **Songs, chords at Schedule**
- 🖥️ **Projector, Stage screen at alerts**
- 🎸 **Transpose at capo**: i-type lang ang \`G to E\` o \`capo 3 G\`
- 📖 **Bible verse** at ⌨️ **hotkeys** (Page Down, Ctrl+B…)

Pili ka ng topic sa baba, o i-type ang maikling tanong!`;
  }
  if (reset) return `Bago na ulit ang usapan. Ano'ng kailangan mo?`;
  return `### 👋 Kumusta! Ito ang **WorshipTech-Pro Help**
Mabilis na sagot para sa media team **at sa banda**, kahit walang internet.

- 🎵 **Kanta, chords at Schedule**
- 🖥️ **Projector, Stage screen at alerts**
- 🎸 **Transpose at capo**: i-type lang ang \`G to E\` o \`capo 3 G\`
- 📖 **Bible verse** at ⌨️ **hotkeys** (Page Down, Ctrl+B…)

Pumili ka ng topic sa baba, o i-type ang maikling tanong!`;
}

function buildWelcome(version: EasyWorshipVersion, language: SupportedLanguage, reset = false): ChatMessage {
  return { id: reset ? "welcome-reset" : "welcome-1", role: "assistant", timestamp: nowTime(), content: welcomeText(version, language, reset) };
}

function loadChat(): ChatMessage[] | null {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const list = Array.isArray(data?.messages) ? data.messages : null;
    if (!list || list.length < 2) return null; // only the welcome → rebuild it fresh
    const clean = list
      .filter((m: any) => m && typeof m.id === "string" && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
      .map((m: any) => ({ id: m.id, role: m.role, content: m.content.slice(0, 20000), timestamp: typeof m.timestamp === "string" ? m.timestamp : "" }));
    return clean.length ? clean : null;
  } catch {
    return null;
  }
}

function saveChat(messages: ChatMessage[]) {
  try {
    if (messages.length < 2) localStorage.removeItem(CHAT_KEY);
    else localStorage.setItem(CHAT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), messages: messages.slice(-MAX_SAVED_MESSAGES) }));
  } catch {
    /* storage blocked or full — chat still works, just not saved */
  }
}

function pickVoice(language: SupportedLanguage): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  if (language === "English") return voices.find((v) => /^en[-_]/i.test(v.lang)) || null;
  return voices.find((v) => /^(fil|tl)([-_]|$)/i.test(v.lang)) || voices.find((v) => /filipino|tagalog/i.test(v.name)) || null;
}

export const ChatAssistant: React.FC<ChatAssistantProps> = ({
  version,
  language,
  onOpenSimulator,
  onOpenGuides,
}) => {
  // 2026-10-28 (Jarvis): chat survives a reload (saved in this browser), and the welcome
  // message follows the chosen EasyWorship version + language until the first question.
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChat() || [buildWelcome(version, language)]);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  useEffect(() => {
    setMessages((prev) => (prev.length === 1 && prev[0].id.startsWith("welcome") ? [buildWelcome(version, language, prev[0].id === "welcome-reset")] : prev));
  }, [version, language]);

  useEffect(() => {
    saveChat(messages);
  }, [messages]);

  // stop reading aloud when leaving the Chat tab
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const [inputQuery, setInputQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 2026-11-17 (Jarvis): answered right here in the browser (lib/helpSearch.ts) — no server, no AI,
  // so it also works on the online (Firebase) version and with no internet.
  const handleSendMessage = (textToSend?: string) => {
    const query = (textToSend || inputQuery).trim().slice(0, 1000);
    if (!query) return;
    const time = nowTime();
    const stamp = Date.now();
    const answer = answerHelpQuestion(query, language);
    setMessages((prev) => [
      ...prev,
      { id: `user-${stamp}`, role: "user", content: query, timestamp: time },
      { id: `assistant-${stamp}`, role: "assistant", content: answer.text, timestamp: time },
    ]);
    setInputQuery("");
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 2026-10-28 (Jarvis): Listen ↔ Stop, and a Filipino voice for Tagalog/Taglish when the PC has one.
  const handleSpeak = (id: string, text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    if (speakingId === id) {
      setSpeakingId(null); // second click = Stop
      return;
    }
    const cleanText = text
      .replace(/[#*`_\[\]()>|]/g, "")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "") // emojis are read out loud otherwise
      .replace(/&rarr;|→/g, ", ");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    const voice = pickVoice(language);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else if (language !== "English") {
      utterance.lang = "fil-PH"; // lets the browser choose a Filipino voice if it has one
    }
    utterance.onend = utterance.onerror = () => setSpeakingId((cur) => (cur === id ? null : cur));
    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  };

  const handleResetChat = () => {
    window.speechSynthesis?.cancel();
    setSpeakingId(null);
    setMessages([buildWelcome(version, language, true)]);
  };

  return (
    <div className="flex flex-col h-full min-h-[26rem] max-w-5xl mx-auto w-full bg-surface rounded-xl border border-line shadow-sm overflow-hidden">
      {/* Chat Subheader */}
      <div className="px-6 py-3 bg-surface border-b border-line flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-ok" />
          <span className="text-xs font-semibold text-fg">WorshipTech-Pro Help</span>
          <span className="text-fg-subtle hidden sm:inline">•</span>
          <span className="text-xs text-fg-muted hidden sm:inline">
            {language === "English" ? "Offline · for the media team and the band" : "Offline · para sa media team at sa banda"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenSimulator}
            className="text-xs bg-accent-soft hover:bg-accent-soft text-accent-text border border-accent/30 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 font-medium"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            <span>Open Simulator</span>
          </button>
          <button
            onClick={() => onOpenGuides()}
            title="Guides"
            aria-label="Guides"
            className="tap-target text-xs text-fg-muted hover:text-fg border border-line px-3 py-1.5 rounded-lg hover:bg-surface-3 transition-colors flex items-center gap-1.5 font-medium"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Guides</span>
          </button>
          <button
            onClick={handleResetChat}
            title="Clear Chat History (naka-save ang chat sa browser na ito)"
            className="tap-target text-fg-muted hover:text-fg px-2 py-1.5 rounded-lg hover:bg-surface-3 transition-colors flex items-center gap-1 text-xs font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear chat</span>
          </button>
        </div>
      </div>

      {/* Preset Topics Quick Bar */}
      <div className="px-6 py-2.5 bg-surface-2 border-b border-line flex items-center gap-2 overflow-x-auto scrollbar-none">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider flex items-center gap-1 shrink-0">
          <Sparkles className="w-3 h-3 text-accent-text" />
          Quick Topics:
        </span>
        {PRESET_QUERIES.map((preset, idx) => {
          const Icon = preset.icon;
          return (
            <button
              key={idx}
              onClick={() => handleSendMessage(language === "English" ? preset.enText : preset.text)}
              className="tap-target shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-surface text-fg border border-line hover:border-line-strong hover:bg-surface-2 transition-all shadow-xs"
            >
              <Icon className="w-3.5 h-3.5 text-accent-text" />
              <span>{preset.tag}</span>
            </button>
          );
        })}
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-surface-2">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-3xl ${isUser ? "ml-auto flex-row-reverse" : "mr-auto"}`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-xs text-xs font-bold ${
                  isUser
                    ? "bg-surface-3 text-fg rounded-full"
                    : "bg-accent text-on-accent"
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <span>PRO</span>}
              </div>

              {/* Message Bubble */}
              <div
                className={`group relative px-5 py-4 text-sm leading-relaxed shadow-xs ${
                  isUser
                    ? "bg-surface-3 text-fg rounded-2xl rounded-tr-none border border-line max-w-lg"
                    : "bg-accent-soft text-fg border border-accent/30 rounded-2xl rounded-tl-none max-w-2xl"
                }`}
              >
                {/* Header tag */}
                <div className="flex items-center justify-between gap-4 mb-2 text-xs text-fg-muted font-medium">
                  <span className="font-semibold text-fg">
                    {isUser ? (language === "English" ? "You" : "Ikaw") : "WorshipTech-Pro Help"}
                  </span>
                  <span>{msg.timestamp}</span>
                </div>

                {/* Content — 2026-11-17 (Jarvis): list numbers/bullets, tables and `code` styled here (no prose plugin in the build) */}
                <div className="prose prose-sm max-w-none text-fg [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5 [&_h3]:text-base [&_h3]:font-bold [&_h3]:my-2 [&_hr]:my-3 [&_hr]:border-accent/30 [&_table]:my-2 [&_table]:border-collapse [&_th]:border [&_th]:border-line [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1 [&_code]:rounded [&_code]:bg-surface-3 [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs prose-p:my-1.5 prose-headings:text-fg prose-headings:font-bold prose-headings:my-2 prose-strong:text-fg prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>

                {/* Assistant message action toolbar */}
                {!isUser && (
                  <div className="mt-4 pt-3 border-t border-accent/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="tap-target text-fg-muted hover:text-fg px-2 py-2 lg:p-1 rounded-md hover:bg-accent-soft transition-colors flex items-center gap-1 text-xs"
                        title="Copy guide to clipboard"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-ok" />
                            <span className="text-ok font-medium">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleSpeak(msg.id, msg.content)}
                        className={`tap-target px-2 py-2 lg:p-1 rounded-md hover:bg-accent-soft transition-colors flex items-center gap-1 text-xs ${
                          speakingId === msg.id ? "text-live-text hover:text-live-text font-semibold" : "text-fg-muted hover:text-fg"
                        }`}
                        title={speakingId === msg.id ? "Stop reading" : "Read instructions aloud"}
                      >
                        {speakingId === msg.id ? (
                          <>
                            <Square className="w-3 h-3 fill-current" />
                            <span>Stop</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3 h-3" />
                            <span>Listen</span>
                          </>
                        )}
                      </button>
                    </div>

                    <button
                      onClick={onOpenSimulator}
                      className="tap-target inline-flex items-center gap-1.5 text-xs text-accent-text hover:text-accent-text font-semibold bg-surface hover:bg-accent-soft px-3 py-1 rounded-md border border-accent/30 shadow-xs transition-all"
                    >
                      <Tv className="w-3 h-3 text-accent-text" />
                      <span>Test on Live Simulator &rarr;</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-surface border-t border-line">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="relative flex items-center"
        >
          <input
            ref={inputRef}
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            maxLength={1000}
            placeholder={
              language === "English"
                ? "Ask a short question (e.g. chords, Stage screen, G to E, capo 3 G)"
                : "Magtanong nang maikli (hal. chords, Stage screen, G to E, capo 3 G)"
            }
            className="w-full px-4 py-3 bg-surface-2 border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/25 text-sm text-fg placeholder-fg-subtle transition-all pr-12"
          />

          <button
            type="submit"
            disabled={!inputQuery.trim()}
            className="tap-target absolute right-2 p-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent rounded-lg flex items-center justify-center transition-all shadow-xs active:scale-95 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-2.5 flex items-center justify-between text-xs text-fg-subtle px-1">
          <span>
            💡 Tip: black screen <strong className="text-fg-muted font-semibold">[Ctrl+B]</strong>, text on/off <strong className="text-fg-muted font-semibold">[Ctrl+C]</strong>.
          </span>
          <span className="hidden sm:inline">{language === "English" ? "Works offline · no AI" : "Gumagana kahit offline · walang AI"}</span>
        </div>
      </div>
    </div>
  );
};
