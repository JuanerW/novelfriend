import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadProviderConfig } from "@/lib/llm/provider";
import { createEmbeddings } from "@/lib/llm/client";
import { chunkChapter } from "@/lib/retrieval/chunk";

export const runtime = "nodejs";
export const maxDuration = 300;

/** 一次请求送多少条文本去做 embedding。 */
const EMBED_BATCH = 64;
/** 一次往库里写多少行。 */
const INSERT_BATCH = 100;
/** 数据库里 chunks.embedding 的维度。 */
const EXPECTED_DIMENSIONS = 1536;

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { data: book } = await supabase
    .from("books")
    .select("id, title, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!book) return NextResponse.json({ error: "书籍不存在" }, { status: 404 });

  let config;
  try {
    config = await loadProviderConfig(user.id);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "读取 LLM 配置失败。" },
      { status: 500 },
    );
  }

  if (!config) {
    return NextResponse.json(
      { error: "请先到设置页填写 LLM API 配置。" },
      { status: 400 },
    );
  }

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, chapter_index, content")
    .eq("book_id", id)
    .eq("user_id", user.id)
    .order("chapter_index");

  if (!chapters?.length) {
    return NextResponse.json({ error: "这本书没有章节。" }, { status: 400 });
  }

  await supabase
    .from("books")
    .update({ status: "processing", error_message: null })
    .eq("id", id);

  async function fail(message: string, status = 500) {
    await supabase
      .from("books")
      .update({ status: "failed", error_message: message })
      .eq("id", id);
    return NextResponse.json({ error: message }, { status });
  }

  try {
    // 重新索引前先清掉旧的，避免重复
    await supabase
      .from("chunks")
      .delete()
      .eq("book_id", id)
      .eq("user_id", user.id);

    // 切分。chunkChapter 保证不跨章节。
    const pending = chapters.flatMap((ch) =>
      chunkChapter(ch.chapter_index, ch.content).map((c) => ({
        book_id: id,
        chapter_id: ch.id,
        user_id: user!.id,
        chapter_index: c.chapterIndex,
        chunk_index: c.chunkIndex,
        content: c.content,
      })),
    );

    if (pending.length === 0) {
      return await fail("切分后没有任何内容。", 400);
    }

    let inserted = 0;
    const buffer: (typeof pending[number] & { embedding: number[] })[] = [];

    for (let i = 0; i < pending.length; i += EMBED_BATCH) {
      const batch = pending.slice(i, i + EMBED_BATCH);

      const vectors = await createEmbeddings(
        config,
        batch.map((c) => c.content),
      );

      if (vectors[0]?.length !== EXPECTED_DIMENSIONS) {
        return await fail(
          `Embedding 维度是 ${vectors[0]?.length}，但数据库的 chunks.embedding 是 ` +
            `vector(${EXPECTED_DIMENSIONS})。请换一个 ${EXPECTED_DIMENSIONS} 维的模型，` +
            `或修改 migration 里的维度后重建索引。`,
          400,
        );
      }

      batch.forEach((c, j) => buffer.push({ ...c, embedding: vectors[j] }));

      // 攒够一批就落库，别把整本书的向量都堆在内存里
      while (buffer.length >= INSERT_BATCH) {
        const rows = buffer.splice(0, INSERT_BATCH);
        const { error } = await supabase.from("chunks").insert(rows);
        if (error) return await fail(`写入向量失败：${error.message}`);
        inserted += rows.length;
      }
    }

    if (buffer.length) {
      const { error } = await supabase.from("chunks").insert(buffer);
      if (error) return await fail(`写入向量失败：${error.message}`);
      inserted += buffer.length;
    }

    await supabase
      .from("books")
      .update({ status: "ready", error_message: null })
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      chapterCount: chapters.length,
      chunkCount: inserted,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return await fail(`生成索引失败：${message}`);
  }
}
