import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProgressControl from "@/components/ProgressControl";
import ChatPanel from "@/components/ChatPanel";
import type { ChapterSummary } from "@/types/db";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ c?: string }>;
};

export default async function BookPage({ params, searchParams }: Props) {
  const { bookId } = await params;
  const { c } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: book } = await supabase
    .from("books")
    .select("id, title, chapter_count, status")
    .eq("id", bookId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!book) notFound();

  const { data: toc } = await supabase
    .from("chapters")
    .select("id, chapter_index, title")
    .eq("book_id", bookId)
    .eq("user_id", user.id)
    .order("chapter_index");

  const chapters = (toc ?? []) as ChapterSummary[];
  if (chapters.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold">{book.title}</h1>
        <p className="mt-3 text-sm text-neutral-500">
          这本书还没有章节内容（状态：{book.status}）。
        </p>
        <Link href="/library" className="mt-6 inline-block text-sm underline">
          返回书架
        </Link>
      </main>
    );
  }

  // 当前查看的章节，默认第 1 章
  const requested = Number(c);
  const currentIndex =
    Number.isInteger(requested) &&
    chapters.some((ch) => ch.chapter_index === requested)
      ? requested
      : chapters[0].chapter_index;

  const { data: chapter } = await supabase
    .from("chapters")
    .select("chapter_index, title, content")
    .eq("book_id", bookId)
    .eq("user_id", user.id)
    .eq("chapter_index", currentIndex)
    .maybeSingle();

  const { data: progressRow } = await supabase
    .from("reading_progress")
    .select("chapter_index")
    .eq("book_id", bookId)
    .eq("user_id", user.id)
    .maybeSingle();

  const savedProgress = progressRow?.chapter_index ?? 1;

  const position = chapters.findIndex((ch) => ch.chapter_index === currentIndex);
  const prev = position > 0 ? chapters[position - 1] : null;
  const next =
    position < chapters.length - 1 ? chapters[position + 1] : null;

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
      {/* 左：目录 */}
      <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
        <Link
          href="/library"
          className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200"
        >
          ← 书架
        </Link>
        <h2 className="mt-2 mb-3 truncate text-sm font-semibold">
          {book.title}
        </h2>

        <nav className="space-y-0.5">
          {chapters.map((ch) => {
            const active = ch.chapter_index === currentIndex;
            const read = ch.chapter_index <= savedProgress;
            return (
              <Link
                key={ch.id}
                href={`/books/${bookId}?c=${ch.chapter_index}`}
                className={`block truncate rounded px-2 py-1 text-xs transition ${
                  active
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : read
                      ? "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                      : "text-neutral-400 hover:bg-neutral-100 dark:text-neutral-600 dark:hover:bg-neutral-800"
                }`}
                title={ch.title}
              >
                {ch.title}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* 中：正文 */}
      <article className="min-w-0">
        <ProgressControl
          bookId={bookId}
          currentChapter={currentIndex}
          savedProgress={savedProgress}
        />

        <h1 className="mt-6 mb-4 text-xl font-semibold">{chapter?.title}</h1>

        <div className="space-y-4 text-[15px] leading-8 text-neutral-800 dark:text-neutral-200">
          {String(chapter?.content ?? "")
            .split("\n")
            .map((line: string) => line.trim())
            .filter(Boolean)
            .map((line: string, i: number) => (
              <p key={i}>{line}</p>
            ))}
        </div>

        <div className="mt-10 flex justify-between border-t border-neutral-200 pt-4 text-sm dark:border-neutral-800">
          {prev ? (
            <Link
              href={`/books/${bookId}?c=${prev.chapter_index}`}
              className="truncate text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200"
            >
              ← {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/books/${bookId}?c=${next.chapter_index}`}
              className="truncate text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200"
            >
              {next.title} →
            </Link>
          ) : (
            <span />
          )}
        </div>
      </article>

      {/* 右：无剧透问答 */}
      <aside className="lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
        <ChatPanel
          bookId={bookId}
          savedProgress={savedProgress}
          ready={book.status === "ready"}
        />
      </aside>
    </div>
  );
}
