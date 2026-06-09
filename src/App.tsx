import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import {
  MessageSquare,
  Send,
  Search,
  Image as ImageIcon,
  Trash2,
  Settings,
  RefreshCw,
  AlertCircle,
  Check,
  Copy,
  Sparkles,
  X,
  Globe,
  Info,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "model";
  text: string;
  image?: {
    mimeType: string;
    data: string; // base64
    name?: string;
  } | null;
  sources?: Array<{ title: string; url: string }>;
  timestamp: string;
}

interface ApiStatus {
  status: string;
  hasApiKey: boolean;
  message: string;
}

const TEMPLATE_PROMPTS = [
  {
    title: "Insho va ijodiy matn",
    prompt: "Yashil energetika va uning insoniyat kelajagidagi o'rni haqida insho yozib ber.",
    icon: "✍️",
  },
  {
    title: "Dasturlash sirlari",
    prompt: "JavaScript-dagi asinxronlik (Promise, async/await) tushunchalarini sodda tilda misollar bilan tushuntir.",
    icon: "💻",
  },
  {
    title: "Sayohat rejasi",
    prompt: "Toshkent va uning atrofidagi qiziqarli joylarni ziyorat qilish uchun 3 kunlik batafsil reja tayyorla.",
    icon: "🗺️",
  },
  {
    title: "Salomatlik maslahatlari",
    prompt: "Sog'lom hayot tarzi uchun kunlik ovqatlanish va jismoniy mashqlar bo'yicha tavsiyalar ber.",
    icon: "🍏",
  },
];

export default function App() {
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem("uz_ai_chat_messages");
    return saved ? JSON.parse(saved) : [];
  });
  const [inputText, setInputText] = useState("");
  const [attachedImage, setAttachedImage] = useState<{
    mimeType: string;
    data: string;
    name: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [enableSearch, setEnableSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
  const [systemInstruction, setSystemInstruction] = useState(() => {
    return (
      localStorage.getItem("uz_ai_chat_system_instruction") ||
      "Siz aqlli, yordamchi va madaniyatli o'zbek tilidagi sun'iy intellekt yordamchisiz. Foydalanuvchining barcha savollariga o'zbek tilida, aniq va chuqur asoslangan holda javob bering."
    );
  });

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Save messages and instructions to localStorage
  useEffect(() => {
    localStorage.setItem("uz_ai_chat_messages", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem("uz_ai_chat_system_instruction", systemInstruction);
  }, [systemInstruction]);

  // Check backend server & Gemini API status on mount
  useEffect(() => {
    fetchStatus();
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      setApiStatus(data);
    } catch (err) {
      console.error("Status check failed:", err);
      setApiStatus({
        status: "error",
        hasApiKey: false,
        message: "Server bilan bog'lanib bo'lmadi. Server yuklanayotgan bo'lishi mumkin.",
      });
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Iltimos, faqat rasm faylini yuklang.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64String = (reader.result as string).split(",")[1];
      setAttachedImage({
        mimeType: file.type,
        data: base64String,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
    // Reset file input value
    if (e.target) e.target.value = "";
  };

  const handleSend = async (textToSend?: string) => {
    const contentText = textToSend !== undefined ? textToSend : inputText;
    if (!contentText.trim() && !attachedImage) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: contentText,
      image: attachedImage,
      timestamp: new Date().toLocaleTimeString("uz-UZ", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputText("");
    setAttachedImage(null);
    setIsLoading(true);

    try {
      // Build past history (up to current message) for context
      const payloadMessages = updatedMessages.map((msg) => ({
        role: msg.role,
        text: msg.text,
        image: msg.image ? { mimeType: msg.image.mimeType, data: msg.image.data } : undefined,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: payloadMessages,
          systemInstruction,
          enableSearch,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Server javob berishda xatolikka yo'l qo'ydi.");
      }

      const modelMessage: Message = {
        id: crypto.randomUUID(),
        role: "model",
        text: data.text,
        sources: data.sources,
        timestamp: new Date().toLocaleTimeString("uz-UZ", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setMessages((prev) => [...prev, modelMessage]);
    } catch (err: any) {
      console.error("Chat error:", err);
      const systemErrorMessage: Message = {
        id: crypto.randomUUID(),
        role: "model",
        text: `⚠️ **Xatolik yuz berdi:** ${err.message || "Ulanish muvaffaqiyatsiz tugadi."}\n\nIltimos, qaytadan urinib ko'ring yoki API kalit sozlamalarini tekshiring.`,
        timestamp: new Date().toLocaleTimeString("uz-UZ", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => [...prev, systemErrorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const clearChat = () => {
    if (window.confirm("Haqiqatan ham barcha suhbatlar tarixini o'chirmoqchimisiz?")) {
      setMessages([]);
    }
  };

  const resetInstructions = () => {
    setSystemInstruction(
      "Siz aqlli, yordamchi va madaniyatli o'zbek tilidagi sun'iy intellekt yordamchisiz. Foydalanuvchining barcha savollariga o'zbek tilida, aniq va chuqur asoslangan holda javob bering."
    );
  };

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-[#e0e0e0] font-sans">
      {/* HEADER SECTION */}
      <header className="sticky top-0 z-10 bg-[#0c0c0c]/85 backdrop-blur-md border-b border-[#1a1a1a] shadow-xs" id="app-header">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1a1a1a] to-[#050505] border border-[#d4af37]/45 flex items-center justify-center text-[#d4af37] shadow-lg shadow-[#d4af37]/5">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="font-serif italic text-lg text-white tracking-tight flex items-center gap-2">
                Uzbek AI Chat
                <span className="text-[10px] font-sans font-normal text-[#d4af37] bg-[#d4af37]/10 border border-[#d4af37]/20 px-2 py-0.5 rounded-full">
                  Gemini 3.5
                </span>
              </h1>
              <p className="text-[11px] text-gray-400 font-sans tracking-wide">Aqlli virtual yordamchi</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* API Connection Indicator */}
            <div className="hidden sm:flex items-center">
              {apiStatus === null ? (
                <div className="flex items-center gap-2 text-xs text-gray-400 bg-[#161616] px-3 py-1.5 rounded-lg border border-[#1a1a1a]">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#d4af37]" />
                  Ulanmoqda...
                </div>
              ) : apiStatus.hasApiKey ? (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-[#0c2a1c]/45 border border-emerald-900/50 px-3 py-1.5 rounded-lg">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  API Faol
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-[#d4af37] bg-[#d4af37]/5 border border-[#d4af37]/20 px-3 py-1.5 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Kalit yo'q
                </div>
              )}
            </div>

            {/* Settings trigger */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-lg border transition-all ${
                showSettings
                  ? "bg-[#d4af37]/15 border-[#d4af37]/45 text-[#d4af37] shadow-xs"
                  : "bg-[#111] border-[#1a1a1a] text-gray-400 hover:text-white hover:bg-[#1a1a1a]"
              }`}
              title="Sozlamalar"
              id="settings-toggle-btn"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Clear Button */}
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="p-2 rounded-lg border border-[#1a1a1a] bg-[#111] text-rose-400 hover:bg-rose-950/30 hover:border-rose-900/50 hover:text-rose-300 transition-colors"
                title="Tarixni tozalash"
                id="clear-history-btn"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* SYSTEM INSTRUCT & SETTINGS EXPANDER */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-t border-[#1a1a1a] bg-[#0c0c0c]/90 overflow-hidden"
              id="settings-panel"
            >
              <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
                <div className="bg-[#111] p-4 rounded-xl border border-[#1a1a1a] space-y-3 shadow-lg shadow-black/45">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-serif italic text-[#d4af37] flex items-center gap-1.5">
                      AI Rol / Yo'riqnomasi (System Instruction)
                    </label>
                    <button
                      onClick={resetInstructions}
                      className="text-xs text-[#d4af37]/75 hover:text-[#d4af37] hover:underline"
                    >
                      Asliy holatga qaytarish
                    </button>
                  </div>
                  <textarea
                    value={systemInstruction}
                    onChange={(e) => setSystemInstruction(e.target.value)}
                    rows={3}
                    className="w-full text-sm p-3 rounded-lg border border-[#222222] focus:outline-hidden focus:border-[#d4af37]/50 focus:ring-1 focus:ring-[#d4af37]/45 bg-[#050505] text-[#e0e0e0] resize-none"
                    placeholder="Yo'riqnomalarni kiriting..."
                  />
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Ushbu yo'riqnoma AI o'zini qanday tutishi, qaysi sohaga e'tibor qaratishi va qaysi tilda gaplashishini boshqaradi.
                  </p>
                </div>

                {/* API Key info bar for user */}
                {apiStatus && !apiStatus.hasApiKey && (
                  <div className="bg-amber-950/25 border border-amber-900/40 p-3.5 rounded-xl flex gap-3 text-amber-300">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-500" />
                    <div className="text-sm">
                      <p className="font-semibold">Gemini API kaliti aniqlanmadi</p>
                      <p className="text-xs opacity-90 mt-0.5">
                        Iltimos, ushbu ilovaning o'ng tepadagi <strong>Settings &gt; Secrets</strong> bo'limiga o'tib, <strong>GEMINI_API_KEY</strong> qiymatini kiriting.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* CHAT MESSAGES PANEL */}
      <main className="flex-1 overflow-y-auto" id="messages-container">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {messages.length === 0 ? (
            /* EMPTY STARTER COMPONENT */
            <div className="pt-8 pb-12 flex flex-col items-center text-center space-y-8" id="empty-state">
              <div className="max-w-md space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-[#0c0c0c] flex items-center justify-center mx-auto text-[#d4af37] shadow-lg border border-[#1a1a1a]">
                  <MessageSquare className="w-7 h-7" />
                </div>
                <h2 className="text-2xl font-serif italic text-white tracking-tight">
                  Tizim tayyor. Qanday yordam bera olaman?
                </h2>
                <p className="text-sm text-gray-400 leading-relaxed">
                  Istalgan mavzuda savol bering. Google Gemini 3.5 modeli yordamida tezkor, aniq va ishonchli javob taqdim etiladi.
                </p>
              </div>

              {/* Grid of Templates */}
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl px-2">
                {TEMPLATE_PROMPTS.map((item, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setInputText(item.prompt);
                      handleSend(item.prompt);
                    }}
                    className="p-4 rounded-xl border border-[#1a1a1a] bg-[#0c0c0c] hover:border-[#d4af37]/45 hover:shadow-lg hover:shadow-[#d4af37]/5 transition-all text-left group flex gap-3.5"
                  >
                    <span className="text-2xl select-none">{item.icon}</span>
                    <div className="space-y-1">
                      <h4 className="font-serif italic text-sm text-white group-hover:text-[#d4af37] transition-colors">
                        {item.title}
                      </h4>
                      <p className="text-xs text-gray-500 line-clamp-2">
                        {item.prompt}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Status Alert for mobile */}
              {apiStatus && !apiStatus.hasApiKey && (
                <div className="sm:hidden w-full max-w-lg bg-amber-950/20 border border-amber-900/30 p-4 rounded-xl text-left text-amber-300 flex gap-3 text-sm">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-500" />
                  <div>
                    <p className="font-bold">Diqqat: API kalit topilmadi</p>
                    <p className="text-xs mt-0.5">Settings &gt; Secrets menyusi orqali GEMINI_API_KEY o'rnating.</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* CONVERSATION LIST */
            <div className="space-y-6" id="messages-list">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3.5 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {/* Model Avatar on Left */}
                  {message.role === "model" && (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1a1a1a] to-[#050505] border border-[#d4af37]/45 flex items-center justify-center text-[#d4af37] text-xs font-serif italic shadow-xs flex-shrink-0 mt-0.5">
                      AI
                    </div>
                  )}

                  {/* Message Bubble Wrapper */}
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-xs relative group min-w-[120px] ${
                      message.role === "user"
                        ? "bg-[#1a1a1a] border border-[#d4af37]/35 text-[#e0e0e0] rounded-tr-none"
                        : "bg-[#111] border border-[#1a1a1a] text-[#e0e0e0] rounded-tl-none"
                    }`}
                  >
                    {/* User attached image */}
                    {message.image && (
                      <div className="mb-2 max-w-xs rounded-lg overflow-hidden border border-[#1a1a1a]/80">
                        <img
                          src={`data:${message.image.mimeType};base64,${message.image.data}`}
                          alt="Yuklangan rasm"
                          className="w-full h-auto max-h-60 object-cover"
                        />
                      </div>
                    )}

                    {/* Text Render */}
                    <div className="text-sm leading-relaxed overflow-wrap break-word markdown-body">
                      {message.role === "model" ? (
                        <ReactMarkdown>{message.text}</ReactMarkdown>
                      ) : (
                        <p className="whitespace-pre-line text-white">{message.text}</p>
                      )}
                    </div>

                    {/* Search Grounding Sources UI */}
                    {message.role === "model" && message.sources && message.sources.length > 0 && (
                      <div className="mt-3.5 pt-3 border-t border-[#1a1a1a] space-y-1.5 bg-[#0c0c0c] p-2.5 rounded-lg">
                        <p className="text-[11px] font-semibold text-[#d4af37]/85 uppercase tracking-wider flex items-center gap-1">
                          <Globe className="w-3 h-3 text-[#d4af37]" /> Google Qidiruv Manbalari:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {message.sources.map((source, i) => (
                            <a
                              key={i}
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#d4af37] bg-[#d4af37]/10 hover:bg-[#d4af37]/20 border border-[#d4af37]/15 rounded-md transition-all"
                            >
                              <span className="max-w-[150px] truncate">{source.title}</span>
                              <ExternalLink className="w-3 h-3 text-[#d4af37]/80" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action Panel & Meta Area inside bubble (staggered display) */}
                    <div className="mt-1.5 flex items-center justify-between gap-6 text-[10px] text-gray-500">
                      <span>{message.timestamp}</span>

                      <div className="flex items-center gap-1.5 bg-transparent opacity-0 group-hover:opacity-100 transition-opacity absolute right-4 bottom-2.5">
                        <button
                          onClick={() => handleCopy(message.id, message.text)}
                          className={`p-1.5 rounded-md hover:bg-[#1a1a1a] transition-colors ${
                            message.role === "user"
                              ? "text-gray-300 hover:bg-slate-800 hover:text-white"
                              : "text-gray-400 hover:text-[#d4af37]"
                          }`}
                          title="Nusxa olish"
                        >
                          {copiedId === message.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* User Avatar on Right */}
                  {message.role === "user" && (
                    <div className="w-8 h-8 rounded-lg bg-[#222222] border border-gray-800 flex items-center justify-center text-gray-300 text-xs font-semibold flex-shrink-0 mt-0.5">
                      Siz
                    </div>
                  )}
                </div>
              ))}

              {/* LOADING INDICATOR BUBBLE */}
              {isLoading && (
                <div className="flex gap-3.5 justify-start">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1a1a1a] to-[#050505] border border-[#d4af37]/45 flex items-center justify-center text-[#d4af37] text-xs font-serif italic shadow-sm flex-shrink-0">
                    AI
                  </div>
                  <div className="bg-[#111] border border-[#1a1a1a] rounded-2xl rounded-tl-none px-5 py-4 shadow-xs flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#d4af37] animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-2 h-2 rounded-full bg-[#d4af37] animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-2 h-2 rounded-full bg-[#d4af37] animate-bounce"></span>
                    <span className="text-xs text-gray-500 ml-2">Yozmoqda...</span>
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </main>

      {/* INPUT BAR PANEL */}
      <footer className="bg-[#0c0c0c] border-t border-[#1a1a1a] py-3 px-4 shadow-lg" id="chat-input-panel">
        <div className="max-w-4xl mx-auto space-y-3">
          {/* File input */}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleImageUpload}
            id="file-attachment-input"
          />

          {/* Attached Image Preview bar */}
          {attachedImage && (
            <div className="flex items-center gap-3 p-2 bg-[#111] border border-[#1a1a1a] rounded-xl max-w-sm shadow-md">
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-900 flex-shrink-0 border border-gray-800">
                <img
                  src={`data:${attachedImage.mimeType};base64,${attachedImage.data}`}
                  alt="Rasm"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-200 truncate">{attachedImage.name}</p>
                <p className="text-[10px] text-[#d4af37]/80 font-serif italic">Tasvir yuklandi (Gemini tahlili)</p>
              </div>
              <button
                onClick={() => setAttachedImage(null)}
                className="p-1 rounded-md text-gray-400 hover:text-rose-400 hover:bg-rose-950/20 transition-colors"
                title="Rasm faylini o'chirish"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Input control elements */}
          <div className="flex items-center gap-3 bg-[#111] border border-[#1a1a1a] focus-within:border-[#d4af37]/50 focus-within:ring-1 focus-within:ring-[#d4af37]/35 rounded-full px-5 py-2 transition-all">
            {/* Attachment Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 -ml-1 text-gray-400 hover:text-[#d4af37] hover:bg-white/5 rounded-full transition-colors"
              title="Rasm yuklash"
              id="upload-image-btn"
            >
              <ImageIcon className="w-5 h-5" />
            </button>

            {/* Input Element */}
            <textarea
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Xabar yozing (Tasvir yuklasangiz uni ham tushuna olaman)..."
              className="flex-1 text-sm bg-transparent border-0 focus:outline-hidden focus:ring-0 text-white placeholder-gray-500 resize-none max-h-24 min-h-[36px] py-2"
              style={{ overflowY: "auto" }}
            />

            {/* Google Search grounding Switch */}
            <button
              onClick={() => setEnableSearch(!enableSearch)}
              className={`p-2 rounded-full transition-colors ${
                enableSearch
                  ? "bg-[#d4af37]/15 text-[#d4af37] border border-[#d4af37]/25"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
              title={enableSearch ? "Google qidiruv faol" : "Google qidiruvni yoqish"}
              id="google-search-toggle"
            >
              <Globe className="w-5 h-5" />
            </button>

            {/* Send Button */}
            <button
              onClick={() => handleSend()}
              disabled={isLoading || (!inputText.trim() && !attachedImage)}
              className={`p-2.5 rounded-full transition-all ${
                isLoading || (!inputText.trim() && !attachedImage)
                  ? "bg-[#1a1a1a] text-gray-650 border border-gray-800 cursor-not-allowed"
                  : "bg-[#d4af37] text-slate-900 font-serif italic text-xs tracking-wider shadow-md hover:bg-[#e4be47] active:scale-95"
              }`}
              id="send-message-btn"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                "YUBORISH"
              )}
            </button>
          </div>

          {/* Prompt footer info */}
          <div className="flex items-center justify-between px-2 text-[10px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-[#d4af37]/70" />
              Suhbatni boshlash uchun enter bosing. Qator qoldirish uchun Shift+Enter tugmasidan foydalaning.
            </span>
            <span className="hidden sm:flex items-center gap-1 bg-[#0c0c0c] border border-[#1a1a1a] rounded px-1.5 py-0.5 text-gray-400">
              Tizim: <strong>Gemini Flash v3.5</strong>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
