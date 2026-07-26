import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createEmbeddings, type ProviderConfig } from "@/lib/llm/client";

export type RetrievedChunk = {
  id: string;
  chapter_index: number;
  chunk_index: number;
  content: string;
  similarity: number;
};

export const DEFAULT_MATCH_COUNT = 8;

/**
 * 无剧透检索。
 *
 * maxChapter 必须来自数据库里的 reading_progress，绝不能用客户端传的值。
 * 章节过滤在 match_chunks 的 WHERE 里完成——先截断再排序，
 * 不是「检索全书再删后文」。
 */
export async function searchWithinProgress(
  supabase: SupabaseClient,
  config: ProviderConfig,
  args: {
    bookId: string;
    maxChapter: number;
    question: string;
    matchCount?: number;
  },
  /** 测试时可以注入假的 embedding 实现，避免真调 API。 */
  embed: typeof createEmbeddings = createEmbeddings,
): Promise<RetrievedChunk[]> {
  const [queryEmbedding] = await embed(config, [args.question]);

  const { data, error } = await supabase.rpc("match_chunks", {
    p_book_id: args.bookId,
    p_max_chapter: args.maxChapter,
    p_query_embedding: queryEmbedding,
    p_match_count: args.matchCount ?? DEFAULT_MATCH_COUNT,
  });

  if (error) throw new Error(`检索失败：${error.message}`);

  const chunks = (data ?? []) as RetrievedChunk[];

  // 兜底断言：万一有人把 SQL 改坏了，这里要炸而不是把后文喂给模型
  const leaked = chunks.filter((c) => c.chapter_index > args.maxChapter);
  if (leaked.length > 0) {
    throw new Error(
      `检索结果越界：返回了第 ${leaked
        .map((c) => c.chapter_index)
        .join("、")} 章的内容，而阅读进度是第 ${args.maxChapter} 章。`,
    );
  }

  return chunks;
}

/** 按章节和位置整理成给模型看的上下文。 */
export function buildContext(chunks: RetrievedChunk[]): string {
  const ordered = [...chunks].sort(
    (a, b) =>
      a.chapter_index - b.chapter_index || a.chunk_index - b.chunk_index,
  );

  return ordered
    .map((c) => `【第 ${c.chapter_index} 章】\n${c.content}`)
    .join("\n\n");
}

export type Citation = {
  chapterIndex: number;
  chapterTitle: string;
};

/** 去重后的引用章节列表。 */
export function buildCitations(
  chunks: RetrievedChunk[],
  chapterTitles: Map<number, string>,
): Citation[] {
  const seen = new Set<number>();
  const citations: Citation[] = [];

  for (const c of [...chunks].sort(
    (a, b) => a.chapter_index - b.chapter_index,
  )) {
    if (seen.has(c.chapter_index)) continue;
    seen.add(c.chapter_index);
    citations.push({
      chapterIndex: c.chapter_index,
      chapterTitle: chapterTitles.get(c.chapter_index) ?? `第 ${c.chapter_index} 章`,
    });
  }

  return citations;
}
