"use client";

import { useEffect, useRef, useState } from "react";

import { Loader2, MessageSquare, Send } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChatItem {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Which UTRs settled on 14 Aug?",
  "How many settlements are recorded?",
  "What is the average settlement lag?",
];

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5" aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-muted-foreground/70"
          animate={{ opacity: [0.35, 1, 0.35], y: [0, -2, 0] }}
          transition={{ duration: 0.9, repeat: Number.POSITIVE_INFINITY, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

export function SettlementChat() {
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi, I'm your settlement analyst. Ask me about UTRs, settlement lag, or daily totals over the settled ledger.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState<"openai" | "fallback" | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional - scroll on every new message / stream tick
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setInput("");

    const userMsg: ChatItem = { id: newId(), role: "user", content: trimmed };
    const assistantId = newId();
    const history = [...messages, userMsg];
    setMessages([...history, { id: assistantId, role: "assistant", content: "" }]);

    const payload = { messages: history.map(({ role, content }) => ({ role, content })) };
    try {
      const res = await fetch("/api/close/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("chat failed");

      setEngine(res.headers.get("x-close-engine") === "openai" ? "openai" : "fallback");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          const snapshot = acc;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: snapshot } : m)),
          );
        }
      }

      if (!acc.trim()) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: "I couldn't produce an answer for that. Try rephrasing, or ask about UTRs, lag, or totals.",
                }
              : m,
          ),
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Sorry, I couldn't reach the settlement engine." }
            : m,
        ),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {messages.map((m) => {
              const isStreamingEmpty = busy && m.role === "assistant" && !m.content;
              return (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[min(80%,36rem)] rounded-xl px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap ${
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                  >
                    {isStreamingEmpty ? <TypingDots /> : m.content}
                    {busy && m.role === "assistant" && m.content && m.id === messages[messages.length - 1]?.id ? (
                      <motion.span
                        className="ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 bg-foreground/60"
                        animate={{ opacity: [1, 0.2, 1] }}
                        transition={{ duration: 0.8, repeat: Number.POSITIVE_INFINITY }}
                      />
                    ) : null}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t p-3">
        <div className="flex flex-wrap items-center gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => void send(s)}
              className="rounded-full border px-3 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            >
              {s}
            </button>
          ))}
          {busy && (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
              <Loader2 className="size-3 animate-spin" />
              Replying…
            </span>
          )}
          {engine === "openai" && !busy && <Badge className="self-center">OpenAI</Badge>}
          {engine === "fallback" && !busy && (
            <Badge variant="outline" className="self-center">
              engine fallback (no API key)
            </Badge>
          )}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={busy ? "Wait for the current reply…" : "Ask about the settled ledger…"}
            className="flex-1"
            disabled={busy}
            aria-busy={busy}
          />
          <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send message">
            {busy ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </form>
      </div>
    </div>
  );
}
