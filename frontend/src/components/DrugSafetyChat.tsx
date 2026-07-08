"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, ShieldCheck, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

type Message = { role: "user" | "assistant"; text: string };

export default function DrugSafetyChat({ genericId = null }: { genericId?: number | null }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  const send = useCallback(() => {
    const question = input.trim();
    if (!question || streaming) return;
    setInput("");
    setStreaming(true);
    setMessages((prev) => [...prev, { role: "user", text: question }, { role: "assistant", text: "" }]);

    api.streamChatbot(
      question,
      genericId,
      (chunk) => {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", text: next[next.length - 1].text + chunk };
          return next;
        });
      },
      () => setStreaming(false),
      () => {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "assistant",
            text: next[next.length - 1].text || "Sorry, something went wrong. Please try again.",
          };
          return next;
        });
        setStreaming(false);
      }
    );
  }, [input, streaming, genericId]);

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Drug Safety Assistant"
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-linear-to-br from-[#5AA6E8] to-[#3A78C4] text-white flex items-center justify-center shadow-[0_6px_24px_rgba(58,120,196,0.45)] hover:scale-105 transition-transform"
        >
          <MessageCircle size={22} />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-90 max-w-[calc(100vw-2rem)] h-130 max-h-[calc(100vh-3rem)] bg-white rounded-[22px] border border-[rgba(215,225,245,0.70)] shadow-[0_12px_48px_rgba(140,158,205,0.30)] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-linear-to-br from-[#5AA6E8] to-[#3A78C4] text-white shrink-0">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} />
              <div>
                <p className="text-[13.5px] font-semibold leading-tight">Drug Safety Assistant</p>
                <p className="text-[10.5px] text-white/80 leading-tight">Answers grounded in official leaflets</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 bg-[#F7F9FD]">
            {messages.length === 0 && (
              <div className="text-center text-[12px] text-[#9DAABF] mt-6 px-4 leading-relaxed">
                Ask about side effects, interactions, dosage, or safety — e.g. &ldquo;Can I take this with alcohol?&rdquo;
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[12.5px] leading-relaxed ${
                  m.role === "user"
                    ? "self-end bg-[#4D8ED6] text-white rounded-br-md"
                    : "self-start bg-white border border-[#E6ECF7] text-[#1B2A4A] rounded-bl-md"
                }`}
              >
                {m.text || (streaming && i === messages.length - 1 ? (
                  <Loader2 size={14} className="animate-spin text-[#9DAABF]" />
                ) : null)}
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-[#E6ECF7] flex items-center gap-2 shrink-0">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder="Ask a drug safety question…"
              className="flex-1 h-10 px-3 bg-[#F3F5FB] border border-[#E6ECF7] rounded-xl text-[12.5px] text-[#1B2A4A] placeholder:text-[#9DAABF] focus:outline-none focus:border-[#4D8ED6] focus:bg-white transition-all"
            />
            <button
              onClick={send}
              disabled={streaming || input.trim().length === 0}
              className="w-10 h-10 rounded-xl bg-[#4D8ED6] text-white flex items-center justify-center hover:bg-[#3A78C4] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {streaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
