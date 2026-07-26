import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const chapterIndex = Number(body?.chapterIndex);

  if (!Number.isInteger(chapterIndex) || chapterIndex < 1) {
    return NextResponse.json({ error: "章节序号不合法。" }, { status: 400 });
  }

  // 校验书归属，同时拿到章节总数，防止把进度设到不存在的章节
  const { data: book } = await supabase
    .from("books")
    .select("id, chapter_count")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!book) return NextResponse.json({ error: "书籍不存在" }, { status: 404 });

  if (book.chapter_count > 0 && chapterIndex > book.chapter_count) {
    return NextResponse.json(
      { error: "章节序号超出范围。" },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("reading_progress").upsert(
    {
      user_id: user.id,
      book_id: id,
      chapter_index: chapterIndex,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,book_id" },
  );

  if (error) {
    return NextResponse.json({ error: "保存进度失败。" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, chapterIndex });
}
