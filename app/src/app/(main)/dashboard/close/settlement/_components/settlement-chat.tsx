"use client";

import { useEffect, useRef, useState } from "react";

import { MessageSquare, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChatItem {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Which UTRs settled on 14 Aug?",
  "How many settlements are recorded?",
  "What is the average settlement lag?",
];

export function SettlementChat() {
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      role: "assistant",
      content:
        "Hi, I'm your settlement analyst. Ask me about UTRs, settlement lag, or daily totals over the settled ledger.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState<"openai" | "fallback" | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional - scroll on every new message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    const next: ChatItem[] = [...messages, { role: "user", content: trimmed }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setBusy(true);

    const payload = { messages: next.map(({ role, content }) => ({ role, content })) };
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
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = {
              role: "assistant",
              content: copy[copy.length - 1].content + acc.slice(copy[copy.length - 1].content.length),
            };
            return copy;
          });
        }
      } else {
        acc = "No response stream.";
      }
    } catch {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: "Sorry, I couldn't reach the settlement engine." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {busy && <p className="text-muted-foreground text-xs">thinking…</p>}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t p-3">
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="rounded-full border px-3 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted"
            >
              {s}
            </button>
          ))}
          {engine === "openai" && <Badge className="self-center">OpenAI</Badge>}
          {engine === "fallback" && (
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
          <MessageSquare className="size-4 text-muted-foreground" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about the settled ledger…"
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={busy || !input.trim()}>
            <Send />
          </Button>
        </form>
      </div>
    </div>
  );
}
