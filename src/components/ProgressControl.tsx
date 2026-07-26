"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  bookId: string;
  /** 当前正在看的章节 */
  currentChapter: number;
  /** 数据库里保存的阅读进度 */
  savedProgress: number;
};

export default function ProgressControl({
  bookId,
  currentChapter,
  savedProgress,
}: Props) {
  const router = useRouter();
  const [progress, setProgress] = useState(savedProgress);
  const [busy, setBusy] = useState(false);

  const alreadyHere = progress === currentChapter;

  async function markHere() {
    setBusy(true);
    const res = await fetch(`/api/books/${bookId}/progress`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterIndex: currentChapter }),
    });
    if (res.ok) {
      setProgress(currentChapter);
      router.refresh();
    } else {
      alert("保存进度失败，请重试。");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 pb-3 dark:border-neutral-800">
      <button
        onClick={markHere}
        disabled={busy || alreadyHere}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {alreadyHere ? "已是当前进度" : busy ? "保存中…" : "我读到这里"}
      </button>

      <span className="text-xs text-neutral-500">
        阅读截止：第 {progress} 章 —— 提问只会检索这一章及之前的内容
      </span>
    </div>
  );
}
