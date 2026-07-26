"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export default function UploadForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const file = fileRef.current?.files?.[0];
    if (!file) return setError("请选择一个 TXT 文件。");
    if (!confirmed) return setError("请先勾选授权确认。");

    const body = new FormData();
    body.append("file", file);
    body.append("confirmed", "true");

    setBusy(true);
    try {
      const res = await fetch("/api/books/upload", { method: "POST", body });
      const data = await res.json();

      if (!res.ok) {
        setError([data.error, data.hint].filter(Boolean).join(" ") || "上传失败。");
        return;
      }

      setMessage(
        data.fallback
          ? `已导入《${data.title}》，但没识别出章节标题，整本作为一章。可以检查一下文件格式。`
          : `已导入《${data.title}》，共 ${data.chapterCount} 章。`,
      );
      if (fileRef.current) fileRef.current.value = "";
      setConfirmed(false);
      router.refresh();
    } catch {
      setError("网络错误，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <h2 className="mb-3 text-sm font-medium">上传小说</h2>

      <input
        ref={fileRef}
        type="file"
        accept=".txt,text/plain"
        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-sm file:text-white dark:file:bg-white dark:file:text-neutral-900"
      />

      <label className="mt-3 flex items-start gap-2 text-xs text-neutral-500">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5"
        />
        <span>我确认拥有处理该文件的合法权利，仅用于个人阅读。</span>
      </label>

      <button
        type="submit"
        disabled={busy}
        className="mt-3 rounded-md bg-neutral-900 px-4 py-2 text-sm text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {busy ? "处理中…" : "上传并解析"}
      </button>

      <p className="mt-2 text-xs text-neutral-400">
        仅支持 TXT，最大 5MB。UTF-8 和 GBK 都可以。
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-3 text-sm text-green-700">{message}</p>}
    </form>
  );
}
