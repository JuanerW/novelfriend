"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Citation = { chapterIndex: number; chapterTitle: string };

type Message = {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  /** 提问时的阅读进度 */
  snapshot?: number;
};

type Props = {
  bookId: string;
  savedProgress: number;
  /** 索引是否已生成 */
  ready: boolean;
};

export default function ChatPanel({ bookId, savedProgress, ready }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const question = input.trim();
    if (!question || busy) return;

    setError(null);
    setInput("");
    setMessages((m) => [
      ...m,
      { role: "user", content: question, snapshot: savedProgress },
      { role: "assistant", content: "" },
    ]);
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          question,
          conversationId: conversationId.current,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "请求失败。");
        setMessages((m) => m.slice(0, -1));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const raw of lines) {
          if (!raw.trim()) continue;
          const event = JSON.parse(raw);

          if (event.type === "meta") {
            conversationId.current = event.conversationId;
            setMessages((m) => {
              const next = [...m];
              next[next.length - 1] = {
                ...next[next.length - 1],
                citations: event.citations,
                snapshot: event.maxChapter,
              };
              return next;
            });
          } else if (event.type === "delta") {
            setMessages((m) => {
              const next = [...m];
              const last = next[next.length - 1];
              next[next.length - 1] = {
                ...last,
                content: last.content + event.text,
              };
              return next;
            });
          } else if (event.type === "error") {
            setError(event.error);
          }
        }
      }
    } catch {
      setError("网络错误，请重试。");
      setMessages((m) => m.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h2 className="text-sm font-medium">提问</h2>
        <p className="mt-1 text-xs text-neutral-400">
          只检索第 {savedProgress} 章及之前的原文
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {!ready && (
          <p className="text-xs leading-6 text-amber-600">
            这本书还没生成索引，回到书架点「生成索引」之后才能提问。
          </p>
        )}

        {ready && messages.length === 0 && (
          <p className="text-xs leading-6 text-neutral-400">
            可以问人物、名词或前情，例如「叶文洁是谁」「红岸是什么」。
            <br />
            回答只会依据你已读到的内容。
          </p>
        )}

        {messages.map((m, i) => (
          <div key={i}>
            {m.role === "user" ? (
              <div className="rounded-md bg-neutral-100 px-3 py-2 text-xs dark:bg-neutral-800">
                {m.content}
              </div>
            ) : (
              <div className="text-xs leading-6">
                {m.content || (
                  <span className="text-neutral-400">思考中…</span>
                )}

                {m.citations && m.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.citations.map((c) => (
                      <Link
                        key={c.chapterIndex}
                        href={`/books/${bookId}?c=${c.chapterIndex}`}
                        className="rounded border border-neutral-200 px-1.5 py-0.5 text-[11px] text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-900 dark:border-neutral-700 dark:hover:text-neutral-200"
                        title={c.chapterTitle}
                      >
                        {c.chapterTitle}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={!ready || busy}
          rows={2}
          placeholder={ready ? "问点什么…（Enter 发送）" : "索引未生成"}
          className="w-full resize-none rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:focus:border-neutral-300"
        />
        <button
          onClick={send}
          disabled={!ready || busy || !input.trim()}
          className="mt-2 w-full rounded-md bg-neutral-900 px-3 py-1.5 text-xs text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {busy ? "回答中…" : "发送"}
        </button>
      </div>
    </div>
  );
}
