import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decodeNovel } from "@/lib/parser/decode";
import { guessTitleFromFilename, parseChapters } from "@/lib/parser/chapters";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const CHAPTER_INSERT_BATCH = 100;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const confirmed = form.get("confirmed");

  if (confirmed !== "true") {
    return NextResponse.json(
      { error: "请先确认你有权处理该文件。" },
      { status: 400 },
    );
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "没有收到文件。" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".txt")) {
    return NextResponse.json(
      { error: "第一版只支持 TXT 文件。" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `文件太大，上限 ${MAX_BYTES / 1024 / 1024}MB。` },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "文件是空的。" }, { status: 400 });
  }

  const title = guessTitleFromFilename(file.name);

  // 1) 先建书，拿到 book id 才能定 storage 路径
  const { data: book, error: insertError } = await supabase
    .from("books")
    .insert({ user_id: user.id, title, status: "processing" })
    .select()
    .single();

  if (insertError || !book) {
    // 把数据库的原始报错带出来。最常见的就是迁移没执行，
    // 这时候 Postgres 会说 relation "public.books" does not exist，
    // 吞掉它只会让人无从下手。
    const detail = insertError?.message ?? "没有返回记录";
    const hint = /does not exist|schema cache/i.test(detail)
      ? "看起来数据库迁移还没执行，请先在 Supabase 的 SQL Editor 里跑 supabase/migrations 下的两个脚本。"
      : undefined;

    return NextResponse.json(
      {
        error: `创建书籍记录失败：${detail}`,
        hint,
      },
      { status: 500 },
    );
  }

  /** 处理失败时把书标成 failed，把原因带回前端。 */
  async function fail(message: string, status = 500) {
    await supabase
      .from("books")
      .update({ status: "failed", error_message: message })
      .eq("id", book!.id);
    return NextResponse.json({ error: message, bookId: book!.id }, { status });
  }

  try {
    const buffer = await file.arrayBuffer();

    // 2) 存原文件，路径 {user_id}/{book_id}/原文件名
    const filePath = `${user.id}/${book.id}/${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("novels")
      .upload(filePath, buffer, {
        contentType: "text/plain; charset=utf-8",
        upsert: true,
      });

    if (uploadError) {
      return await fail(`文件存储失败：${uploadError.message}`);
    }

    // 3) 解码 + 切章
    const { text, encoding } = decodeNovel(buffer);
    const { chapters, fallback } = parseChapters(text);

    if (chapters.length === 0) {
      return await fail("文件里没有可读的正文内容。", 400);
    }

    // 4) 批量写入章节
    for (let i = 0; i < chapters.length; i += CHAPTER_INSERT_BATCH) {
      const batch = chapters.slice(i, i + CHAPTER_INSERT_BATCH).map((c) => ({
        book_id: book.id,
        user_id: user.id,
        chapter_index: c.chapterIndex,
        title: c.title,
        content: c.content,
      }));

      const { error: chapterError } = await supabase
        .from("chapters")
        .insert(batch);

      if (chapterError) {
        return await fail(`章节保存失败：${chapterError.message}`);
      }
    }

    // 5) 初始化阅读进度到第 1 章
    await supabase
      .from("reading_progress")
      .upsert(
        { user_id: user.id, book_id: book.id, chapter_index: 1 },
        { onConflict: "user_id,book_id" },
      );

    // 章节就绪即可开始阅读；status 留在 uploaded，
    // 等 /process 生成完向量才转 ready。
    await supabase
      .from("books")
      .update({
        status: "uploaded",
        file_path: filePath,
        chapter_count: chapters.length,
        error_message: null,
      })
      .eq("id", book.id);

    return NextResponse.json({
      bookId: book.id,
      title,
      chapterCount: chapters.length,
      encoding,
      // 没识别出章节标题时提示用户检查文件格式
      fallback,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return await fail(`处理失败：${message}`);
  }
}
