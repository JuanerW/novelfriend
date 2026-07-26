import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/auth/actions";
import UploadForm from "@/components/UploadForm";
import BookCard from "@/components/BookCard";
import type { Book } from "@/types/db";

export const metadata = { title: "书架 · 无剧透小说助手" };
export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: books } = await supabase
    .from("books")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const list = (books ?? []) as Book[];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">书架</h1>
          <p className="mt-1 text-sm text-neutral-500">{user.email}</p>
        </div>
        <form action={logout}>
          <button className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200">
            退出
          </button>
        </form>
      </header>

      <UploadForm />

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-neutral-500">
          我的小说（{list.length}）
        </h2>

        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-400 dark:border-neutral-700">
            还没有小说，先上传一本 TXT。
          </p>
        ) : (
          <div className="space-y-2">
            {list.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
