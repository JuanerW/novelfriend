"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Book } from "@/types/db";

const STATUS_LABEL: Record<Book["status"], string> = {
  uploaded: "待处理",
  processing: "处理中",
  ready: "就绪",
  failed: "失败",
};

const STATUS_CLASS: Record<Book["status"], string> = {
  uploaded: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  processing: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  ready: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export default function BookCard({ book }: { book: Book }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`删除《${book.title}》？章节、向量和对话都会一起删除。`)) return;
    setDeleting(true);
    const res = await fetch(`/api/books/${book.id}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    } else {
      alert("删除失败，请重试。");
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <div className="min-w-0">
        <Link
          href={`/books/${book.id}`}
          className="block truncate font-medium hover:underline underline-offset-4"
        >
          {book.title}
        </Link>
        <div className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
          <span
            className={`rounded px-1.5 py-0.5 ${STATUS_CLASS[book.status]}`}
          >
            {STATUS_LABEL[book.status]}
          </span>
          {book.chapter_count > 0 && <span>{book.chapter_count} 章</span>}
        </div>
        {book.status === "failed" && book.error_message && (
          <p className="mt-1 text-xs text-red-600">{book.error_message}</p>
        )}
      </div>

      <button
        onClick={handleDelete}
        disabled={deleting}
        className="shrink-0 text-xs text-neutral-400 transition hover:text-red-600 disabled:opacity-50"
      >
        {deleting ? "删除中…" : "删除"}
      </button>
    </div>
  );
}
