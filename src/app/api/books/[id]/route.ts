import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { data: book } = await supabase
    .from("books")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!book) return NextResponse.json({ error: "书籍不存在" }, { status: 404 });

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, chapter_index, title")
    .eq("book_id", id)
    .eq("user_id", user.id)
    .order("chapter_index");

  const { data: progress } = await supabase
    .from("reading_progress")
    .select("chapter_index")
    .eq("book_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    book,
    chapters: chapters ?? [],
    progress: progress?.chapter_index ?? 1,
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  // 先确认归属，再删
  const { data: book } = await supabase
    .from("books")
    .select("id, file_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!book) return NextResponse.json({ error: "书籍不存在" }, { status: 404 });

  // 删掉整个 {user_id}/{book_id}/ 目录下的文件
  const prefix = `${user.id}/${book.id}`;
  const { data: files } = await supabase.storage.from("novels").list(prefix);
  if (files?.length) {
    await supabase.storage
      .from("novels")
      .remove(files.map((f) => `${prefix}/${f.name}`));
  }

  // chapters / chunks / reading_progress / conversations 都是 on delete cascade
  const { error } = await supabase
    .from("books")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "删除失败。" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
