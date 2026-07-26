"use client";

import { useState } from "react";

type Saved = {
  base_url: string;
  chat_model: string;
  embedding_model: string;
} | null;

type TestResult = {
  ok: boolean;
  chatOk: boolean;
  embeddingOk: boolean;
  embeddingDimensions?: number;
  dimensionWarning?: string;
  error?: string;
};

const FIELD =
  "w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-300";

export default function SettingsForm({ saved }: { saved: Saved }) {
  const [baseUrl, setBaseUrl] = useState(saved?.base_url ?? "https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [chatModel, setChatModel] = useState(saved?.chat_model ?? "gpt-4o-mini");
  const [embeddingModel, setEmbeddingModel] = useState(
    saved?.embedding_model ?? "text-embedding-3-small",
  );

  const [hasSavedKey, setHasSavedKey] = useState(Boolean(saved));
  const [busy, setBusy] = useState<"save" | "test" | "delete" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);

  const payload = () => ({ baseUrl, apiKey, chatModel, embeddingModel });

  function reset() {
    setMessage(null);
    setError(null);
  }

  async function handleSave() {
    reset();
    setBusy("save");
    try {
      const res = await fetch("/api/provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "保存失败。");
      else {
        setMessage("已保存。");
        setHasSavedKey(true);
        setApiKey("");
      }
    } catch {
      setError("网络错误。");
    } finally {
      setBusy(null);
    }
  }

  async function handleTest() {
    reset();
    setTest(null);
    setBusy("test");
    try {
      const res = await fetch("/api/provider/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "测试失败。");
      else setTest(data);
    } catch {
      setError("网络错误。");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!confirm("删除已保存的 API Key 和模型配置？")) return;
    reset();
    setBusy("delete");
    try {
      const res = await fetch("/api/provider", { method: "DELETE" });
      if (res.ok) {
        setMessage("已删除。");
        setHasSavedKey(false);
        setApiKey("");
        setTest(null);
      } else setError("删除失败。");
    } catch {
      setError("网络错误。");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1 block text-sm">API Base URL</label>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
          className={FIELD}
        />
        <p className="mt-1 text-xs text-neutral-400">
          填到 /v1 为止，不用带 /chat/completions。
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm">API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={hasSavedKey ? "已保存，留空则不修改" : "sk-…"}
          autoComplete="off"
          className={FIELD}
        />
        <p className="mt-1 text-xs text-neutral-400">
          加密后存库，只在服务端解密，接口永远不会把它返回给浏览器。
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm">Chat Model</label>
          <input
            value={chatModel}
            onChange={(e) => setChatModel(e.target.value)}
            className={FIELD}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm">Embedding Model</label>
          <input
            value={embeddingModel}
            onChange={(e) => setEmbeddingModel(e.target.value)}
            className={FIELD}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleSave}
          disabled={busy !== null}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {busy === "save" ? "保存中…" : "保存"}
        </button>

        <button
          onClick={handleTest}
          disabled={busy !== null}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          {busy === "test" ? "测试中…" : "测试连接"}
        </button>

        {hasSavedKey && (
          <button
            onClick={handleDelete}
            disabled={busy !== null}
            className="ml-auto text-sm text-neutral-400 transition hover:text-red-600 disabled:opacity-50"
          >
            删除配置
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          {message}
        </p>
      )}

      {test && (
        <div className="space-y-1 rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
          <p>Embedding 模型：{test.embeddingOk ? "✅ 可用" : "❌ 不可用"}
            {test.embeddingDimensions ? `（${test.embeddingDimensions} 维）` : ""}
          </p>
          <p>Chat 模型：{test.chatOk ? "✅ 可用" : "❌ 不可用"}</p>
          {test.error && <p className="text-red-600">{test.error}</p>}
          {test.dimensionWarning && (
            <p className="text-amber-600">{test.dimensionWarning}</p>
          )}
        </div>
      )}
    </div>
  );
}
