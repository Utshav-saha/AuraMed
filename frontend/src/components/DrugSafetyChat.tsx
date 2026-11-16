"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText, X, Send, ArrowUpRight, Square } from "lucide-react";
import { api, type ChatTurn } from "@/lib/api";
import { useChat } from "./ChatContext";

interface Msg extends ChatTurn {
  route?: string;
  sources?: string[];
}

const STARTERS = [
  "What are the side effects of Napa?",
  "Can I take Omeprazole before food?",
  "Find pharmacy for Seclo",
  "Book an appointment",
];

// **bold**, "- " bullets, newlines. beshi kichu na
function renderMd(text: string) {
  const blocks = text.split(/\n{2,}/);
  return blocks.map((b, i) => {
    const lines = b.split("\n");
    const isList = lines.every((l) => /^\s*[-*•]\s+/.test(l) || !l.trim());
    const inline = (s: string) =>
      s.split(/(\*\*[^*]+\*\*)/g).map((p, j) => (p.startsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : p));
    if (isList) {
      return (
        <ul key={i}>
          {lines.filter((l) => l.trim()).map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>)}
        </ul>
      );
    }
    return (
      <p key={i}>
        {lines.map((l, j) => (
          <span key={j}>
            {inline(l)}
            {j < lines.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  });
}

export default function DrugSafetyChat() {
  const router = useRouter();
  const chat = useChat();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, chat.open]);

  // details page theke "ask about this" asle
  useEffect(() => {
    if (!chat.open || !chat.pendingQuestion) return;
    const q = chat.consumePending();
    if (q) void send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.open, chat.pendingQuestion]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    const history = msgs.slice(-6).map(({ role, text }) => ({ role, text }));
    setMsgs((m) => [...m, { role: "user", text: q }, { role: "assistant", text: "" }]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      for await (const ev of api.chat({ user_question: q, generic_id: chat.genericId, history }, ctrl.signal)) {
        setMsgs((m) => {
          const last = { ...m[m.length - 1] };
          if (ev.t) last.text += ev.t;
          if (ev.route) last.route = ev.route;
          if (ev.sources) last.sources = ev.sources;
          return [...m.slice(0, -1), last];
        });
        if (ev.route) setTimeout(() => router.push(ev.route!), 600);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setMsgs((m) => [...m.slice(0, -1), { role: "assistant", text: "Could not reach the assistant. Try again in a moment." }]);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  return (
    <>
      {!chat.open && (
        <button
          onClick={() => chat.setOpen(true)}
          className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 h-12 px-4 rounded-full bg-ink text-paper flex items-center gap-2 text-sm font-medium shadow-lg hover:bg-green transition-colors"
          aria-label="Open assistant"
        >
          <MessageSquareText size={18} />
          <span className="hidden sm:inline">Ask</span>
        </button>
      )}

      {chat.open && (
        <div className="fixed inset-x-0 bottom-0 md:inset-auto md:bottom-6 md:right-6 z-50 md:w-[380px] h-[70vh] md:h-[560px] sheet shadow-2xl flex flex-col overflow-hidden rounded-b-none md:rounded-b-lg">
          <header className="flex items-center justify-between px-4 h-12 border-b border-line bg-paper">
            <div className="min-w-0">
              <div className="text-sm font-medium">Medicine assistant</div>
              <div className="text-[11px] text-ink-3 truncate">
                {chat.genericName ? `Context: ${chat.genericName}` : "Answers from official leaflets only"}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {chat.genericId && (
                <button onClick={() => chat.setGeneric(null)} className="text-[11px] text-ink-3 hover:text-ink px-2">
                  clear
                </button>
              )}
              <button onClick={() => chat.setOpen(false)} className="btn-ghost h-8 w-8 p-0" aria-label="Close">
                <X size={16} />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <p className="text-ink-2">
                  Ask about a medicine&apos;s dose, side effects or interactions. You can also say things like
                  &ldquo;open my cart&rdquo; or &ldquo;find pharmacy for Napa&rdquo;.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STARTERS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="text-xs px-2.5 h-7 rounded-full border border-line bg-sheet hover:border-green hover:text-green">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] bg-ink text-paper px-3 py-2 rounded-lg rounded-br-sm"
                      : "max-w-[90%] bg-paper px-3 py-2 rounded-lg rounded-bl-sm border border-line"
                  }
                >
                  {m.role === "assistant" ? (
                    <div className="chat-md">
                      {m.text ? renderMd(m.text) : <span className="inline-block w-2 h-4 bg-ink-3/60 animate-pulse" />}
                      {m.route && (
                        <button onClick={() => router.push(m.route!)} className="mt-1 inline-flex items-center gap-1 text-green font-medium text-xs">
                          Go <ArrowUpRight size={12} />
                        </button>
                      )}
                      {m.sources && m.sources.length > 0 && (
                        <div className="mt-1.5 text-[10px] uppercase tracking-wider text-ink-3">Source: {m.sources.join(", ")}</div>
                      )}
                    </div>
                  ) : (
                    m.text
                  )}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="border-t border-line p-2 flex gap-2 bg-sheet"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about a medicine…"
              className="input h-10 flex-1"
              disabled={busy}
            />
            {busy ? (
              <button type="button" onClick={() => abortRef.current?.abort()} className="btn-outline h-10 w-10 p-0" aria-label="Stop">
                <Square size={14} />
              </button>
            ) : (
              <button type="submit" className="btn-primary h-10 w-10 p-0" aria-label="Send" disabled={!input.trim()}>
                <Send size={15} />
              </button>
            )}
          </form>
          <p className="text-[10px] text-ink-3 text-center pb-1.5 bg-sheet">Not medical advice. Confirm with your doctor or pharmacist.</p>
        </div>
      )}
    </>
  );
}
