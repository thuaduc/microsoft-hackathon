"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ChatThread.module.css";

interface Message {
  role: "user" | "assistant";
  content: string;
}

type Status = "idle" | "sending" | "error";

const SUGGESTIONS = ["What's in progress right now?", "Summarize the open bugs", "What's blocked?"];

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Network request failed.";
}

function SendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 13V3M8 3L3.5 7.5M8 3L12.5 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ChatThread() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | undefined>();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, status]);

  async function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || status === "sending") return;

    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    setInput("");
    setStatus("sending");
    setError(undefined);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Request failed.");
        setStatus("error");
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      setStatus("idle");
    } catch (err) {
      setError(message(err));
      setStatus("error");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  const isEmpty = messages.length === 0;

  const inputPill = (
    <form className={styles.inputPill} onSubmit={handleSubmit}>
      <input
        className={styles.input}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask anything"
        disabled={status === "sending"}
        autoFocus={isEmpty}
      />
      <button
        type="submit"
        className={styles.sendButton}
        disabled={status === "sending" || !input.trim()}
        aria-label="Send"
      >
        <SendIcon />
      </button>
    </form>
  );

  if (isEmpty) {
    return (
      <div className={styles.hero}>
        <h1 className={styles.heroHeadline}>Ask anything</h1>
        {inputPill}
        <div className={styles.suggestions}>
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className={styles.suggestion} onClick={() => sendMessage(s)}>
              {s}
            </button>
          ))}
        </div>
        {error && <p className={styles.errorText}>{error}</p>}
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.messages} aria-live="polite">
        <div className={styles.thread}>
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? styles.userRow : styles.assistantRow}>
              {m.role === "user" ? (
                <span className={styles.userBubble}>{m.content}</span>
              ) : (
                <span className={styles.assistantText}>{m.content}</span>
              )}
            </div>
          ))}
          {status === "sending" && (
            <div className={styles.assistantRow}>
              <span className={styles.assistantText}>Thinking…</span>
            </div>
          )}
          {error && <p className={styles.errorText}>{error}</p>}
          <div ref={endRef} />
        </div>
      </div>
      <div className={styles.inputBar}>{inputPill}</div>
    </div>
  );
}
