import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send,
  Sparkles,
  Bot,
  User,
  RotateCcw,
  Copy,
  Check,
  PlayCircle,
  Volume2,
  Square,
  Tv,
  HelpCircle,
  FileMusic,
  BookOpen,
  Radio,
  Monitor,
  AlertTriangle,
  Flame,
} from "lucide-react";
import { ChatMessage, EasyWorshipVersion, SupportedLanguage } from "../types";

interface ChatAssistantProps {
  version: EasyWorshipVersion;
  language: SupportedLanguage;
  onOpenSimulator: () => void;
  onOpenGuides: (guideId?: string) => void;
}

const PRESET_QUERIES = [
  {
    icon: FileMusic,
    tag: "Adding Songs",
    text: "Paano ako magdadagdag ng kanta sa service schedule?",
    enText: "How do I add a song to the service schedule?",
  },
  {
    icon: BookOpen,
    tag: "Scripture",
    text: "Pastor wants to show John 3:16 instantly.",
    enText: "Pastor wants to show John 3:16 instantly on screen.",
  },
  {
    icon: Radio,
    tag: "NDI & OBS",
    text: "Paano ko isasama ang lyrics sa aming OBS live stream?",
    enText: "How to send lyrics to OBS live stream using NDI?",
  },
  {
    icon: Monitor,
    tag: "Foldback Stage",
    text: "Paano i-setup ang Foldback (Confidence Screen) para sa worship team?",
    enText: "How do I setup Foldback / Stage Display for singers & pastor?",
  },
  {
    icon: AlertTriangle,
    tag: "Nursery Alert",
    text: "Paano magpalabas ng Nursery Alert o emergency message ticker habang may preaching?",
    enText: "How to trigger a nursery alert ticker on screen during service?",
  },
  {
    icon: Flame,
    tag: "Video Backgrounds",
    text: "Paano mag-loop ng motion video background sa likod ng worship lyrics?",
    enText: "How do I loop motion video backgrounds behind worship lyrics?",
  },
];

// ---------- 2026-10-28 (Jarvis): welcome message, saved chat, voice ----------

const CHAT_KEY = "wtp-chat-v1";
const MAX_SAVED_MESSAGES = 80;
const nowTime = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function welcomeText(version: EasyWorshipVersion, language: SupportedLanguage, reset: boolean): string {
  const keys = "[Page Down] Go Live, [Ctrl+B] Black, [Ctrl+C] Text, [Ctrl+L] Logo";
  if (language === "English") {
    if (reset) return `Chat cleared. How can I help you with **${version}** today?`;
    return `### 👋 Hi! I'm **WorshipTech-Pro**
Your AI assistant for **${version}** church presentation software.

I can give clear, **step-by-step guidance** for your church AV & media team:
- 🎵 **Adding & formatting songs** in the Service Schedule
- 📖 **Quick Scripture / Bible projection** during the live service
- 📡 **NDI live stream setup** to OBS / vMix (transparent lower-thirds)
- 🖥️ **Stage Foldback Display** for singers and the pastor
- ⚡ **Emergency controls & hotkeys** (${keys})

Pick a quick topic below or type your question!`;
  }
  if (language === "Taglish") {
    if (reset) return `Cleared na ang chat. Ano'ng maitutulong ko sa **${version}** today?`;
    return `### 👋 Hi! Ako si **WorshipTech-Pro**
Your AI assistant para sa **${version}**.

Tutulungan kita step-by-step, para sa buong media team:
- 🎵 **Pag-add at pag-format ng songs** sa Service Schedule
- 📖 **Bible verse sa screen**, mabilis, kahit live na
- 📡 **NDI setup** papunta sa OBS / vMix (transparent lower-thirds)
- 🖥️ **Stage Foldback Display** para sa singers at kay Pastor
- ⚡ **Emergency controls at hotkeys** (${keys})

Pili ka lang ng topic sa baba, o i-type mo na 'yung tanong mo!`;
  }
  if (reset) return `Bago na ulit ang usapan. Ano'ng maitutulong ko sa **${version}** ngayon?`;
  return `### 👋 Kumusta! Ako si **WorshipTech-Pro**
Katulong mo ako sa **${version}**.

Ituturo ko sa 'yo nang sunud-sunod, para sa buong media team:
- 🎵 **Paglalagay ng kanta** sa Service Schedule
- 📖 **Pagpapakita ng Bible verse**, mabilis, kahit nasa gitna na ng service
- 📡 **NDI papunta sa OBS / vMix**, para may lyrics din sa live stream
- 🖥️ **Foldback sa stage**, para sa singers at kay Pastor
- ⚡ **Mga shortcut kapag emergency** (${keys})

Pumili ka lang ng topic sa baba, o i-type mo na 'yung tanong mo!`;
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

  // 2026-10-28 (Jarvis): the online version (Firebase Hosting, static files only) has no server
  // for Gemini. Ask /api/health once; if it doesn't answer with JSON, chat is turned off with a note.
  const [aiStatus, setAiStatus] = useState<"checking" | "online" | "offline">("checking");
  useEffect(() => {
    let alive = true;
    fetch("/api/health", { cache: "no-store" })
      .then(async (r) => {
        const isJson = (r.headers.get("content-type") || "").includes("application/json");
        const data = r.ok && isJson ? await r.json().catch(() => null) : null;
        if (alive) setAiStatus(data?.status === "ok" ? "online" : "offline");
      })
      .catch(() => alive && setAiStatus("offline"));
    return () => {
      alive = false;
    };
  }, []);
  const chatOff = aiStatus !== "online";

  const [inputQuery, setInputQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputQuery).trim();
    if (!query || isLoading || chatOff) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          userMessage: query,
          version,
          language,
        }),
      });

      if (!response.ok) {
        // 2026-10-20 (Jarvis): show the server's friendly message (rate limit, too long, etc.).
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `Server returned status ${response.status}`);
      }

      const data = await response.json();
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.text || "Walang tugon mula sa server.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `⚠️ Hindi makakonekta sa assistant. Subukang muli o buksan ang aming built-in Step-by-Step Guides. (${err.message})`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
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
          <div className={`w-2.5 h-2.5 rounded-full ${aiStatus === "online" ? "bg-ok animate-pulse" : aiStatus === "offline" ? "bg-fg-subtle" : "bg-warn"}`} />
          <span className="text-xs font-semibold text-fg">
            {aiStatus === "offline" ? "AI chat offline" : "WorshipTech-Pro Agent Active"} ({version})
          </span>
          <span className="text-fg-subtle hidden sm:inline">•</span>
          <span className="text-xs text-fg-muted hidden sm:inline">
            Trained on EasyWorship Workflows & Hotkeys
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
            onClick={handleResetChat}
            title="Clear Chat History (naka-save ang chat sa browser na ito)"
            className="tap-target text-fg-muted hover:text-fg px-2 py-1.5 rounded-lg hover:bg-surface-3 transition-colors flex items-center gap-1 text-xs font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear chat</span>
          </button>
        </div>
      </div>

      {aiStatus === "offline" && (
        <div role="status" className="px-6 py-3 bg-warn-soft border-b border-warn/40 text-xs text-warn-text flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex-1 min-w-[16rem]">
            {language === "English" ? (
              <>
                <strong>AI chat isn't available in the online version yet.</strong> For now, use the step-by-step Guides, the Hotkeys list and the Simulator.
              </>
            ) : (
              <>
                <strong>Wala pang AI chat sa online version.</strong> Sa ngayon, gamitin muna ang step-by-step Guides, ang listahan ng Hotkeys at ang Simulator.
              </>
            )}
          </span>
          <span className="flex gap-1.5 shrink-0">
            <button onClick={() => onOpenGuides()} className="tap-target px-3 py-1.5 rounded-md bg-surface border border-warn/40 font-semibold hover:bg-warn-soft">
              Guides
            </button>
            <button onClick={onOpenSimulator} className="tap-target px-3 py-1.5 rounded-md bg-surface border border-warn/40 font-semibold hover:bg-warn-soft">
              Simulator
            </button>
          </span>
        </div>
      )}

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
              disabled={chatOff}
              className="tap-target disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-surface text-fg border border-line hover:border-line-strong hover:bg-surface-2 transition-all shadow-xs"
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
                    {isUser ? "You (Media Volunteer)" : "WorshipTech-Pro Assistant"}
                  </span>
                  <span>{msg.timestamp}</span>
                </div>

                {/* Content */}
                <div className="prose prose-sm max-w-none text-fg prose-p:my-1.5 prose-headings:text-fg prose-headings:font-bold prose-headings:my-2 prose-strong:text-fg prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5">
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

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex gap-3 max-w-md mr-auto">
            <div className="w-8 h-8 rounded-lg bg-accent text-on-accent font-bold flex items-center justify-center shrink-0 shadow-xs text-xs">
              PRO
            </div>
            <div className="bg-accent-soft border border-accent/30 rounded-2xl rounded-tl-none px-4 py-3 text-sm text-fg flex items-center gap-2 shadow-xs">
              <div className="flex space-x-1.5">
                <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="text-xs text-fg-muted ml-1">WorshipTech-Pro is crafting steps...</span>
            </div>
          </div>
        )}

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
            disabled={chatOff}
            placeholder={
              aiStatus === "offline"
                ? language === "English"
                  ? "AI chat isn't available in the online version"
                  : "Wala pang AI chat sa online version"
                : language === "Tagalog"
                ? "Magtanong tungkol sa EasyWorship (hal. Paano mag-setup ng NDI sa OBS?)"
                : language === "English"
                ? "Ask anything about EasyWorship (e.g. How to project John 3:16 instantly?)"
                : "Magtanong sa Taglish (hal. Paano mag-add ng song sa service schedule?)"
            }
            className="w-full px-4 py-3 bg-surface-2 border border-line rounded-xl disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-accent/25 text-sm text-fg placeholder-fg-subtle transition-all pr-12"
          />

          <button
            type="submit"
            disabled={!inputQuery.trim() || isLoading || chatOff}
            className="tap-target absolute right-2 p-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent rounded-lg flex items-center justify-center transition-all shadow-xs active:scale-95 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-2.5 flex items-center justify-between text-xs text-fg-subtle px-1">
          <span>
            💡 Pro-Tip: EasyWorship 7: black screen <strong className="text-fg-muted font-semibold">[Ctrl+B]</strong>, text on/off <strong className="text-fg-muted font-semibold">[Ctrl+C]</strong>.
          </span>
          <span className="hidden sm:inline">Powered by Gemini 3.7 Flash</span>
        </div>
      </div>
    </div>
  );
};
