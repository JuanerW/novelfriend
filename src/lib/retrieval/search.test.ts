import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseChapters } from "../parser/chapters";
import { chunkChapters } from "./chunk";
import {
  searchWithinProgress,
  buildContext,
  buildCitations,
  type RetrievedChunk,
} from "./search";
import type { ProviderConfig } from "../llm/client";

/**
 * CLAUDE.md「测试重点」的落地。
 *
 * 这里不连真库，而是用一个假的 rpc 复刻 match_chunks 的语义：
 * 先按 chapter_index <= p_max_chapter 过滤，再排相似度。
 * 真正被测的是 searchWithinProgress 的越界断言和上下文组装。
 */

const CONFIG: ProviderConfig = {
  baseUrl: "http://x/v1",
  apiKey: "k",
  chatModel: "c",
  embeddingModel: "e",
};

const fakeEmbed = async () => [[0.1, 0.2]];

const chapters = parseChapters(
  readFileSync("fixtures/test-novel.txt", "utf8"),
).chapters;

const allChunks = chunkChapters(
  chapters.map((c) => ({ chapterIndex: c.chapterIndex, content: c.content })),
);

/** 正确实现：章节过滤在排序之前。 */
function makeSupabase(
  behavior: "correct" | "leaky" = "correct",
): SupabaseClient {
  return {
    rpc: async (_name: string, params: Record<string, unknown>) => {
      const max = params.p_max_chapter as number;
      const count = params.p_match_count as number;

      const pool =
        behavior === "correct"
          ? allChunks.filter((c) => c.chapterIndex <= max)
          : allChunks; // 故意不过滤，模拟 SQL 被改坏

      const data: RetrievedChunk[] = pool.slice(0, count).map((c, i) => ({
        id: `${c.chapterIndex}-${c.chunkIndex}`,
        chapter_index: c.chapterIndex,
        chunk_index: c.chunkIndex,
        content: c.content,
        similarity: 1 - i * 0.01,
      }));

      return { data, error: null };
    },
  } as unknown as SupabaseClient;
}

async function search(maxChapter: number, behavior: "correct" | "leaky" = "correct") {
  return searchWithinProgress(
    makeSupabase(behavior),
    CONFIG,
    { bookId: "b", maxChapter, question: "黑衣人是谁？" },
    fakeEmbed,
  );
}

test("读到第 2 章时，检索不到第 3、4 章的内容", async () => {
  const chunks = await search(2);
  assert.ok(chunks.length > 0, "应该有召回");
  assert.ok(
    chunks.every((c) => c.chapter_index <= 2),
    "召回了阅读进度之后的章节",
  );

  const text = chunks.map((c) => c.content).join("");
  assert.ok(!text.includes("乙"), "第 2 章的检索结果泄露了第 4 章的答案");
  assert.ok(!text.includes("老周"), "第 2 章的检索结果泄露了第 3 章的内容");
});

test("读到第 3 章时，只能看到「有人猜测是甲」，看不到乙", async () => {
  const chunks = await search(3);
  const text = chunks.map((c) => c.content).join("");
  assert.ok(chunks.some((c) => c.chapter_index === 3), "应召回第 3 章");
  assert.ok(text.includes("甲"), "第 3 章的猜测内容应该能被检索到");
  assert.ok(!text.includes("摘下面罩"), "不应泄露第 4 章的揭晓");
});

test("读到第 4 章后，才能检索到真相", async () => {
  const chunks = await search(4);
  const text = chunks.map((c) => c.content).join("");
  assert.ok(chunks.some((c) => c.chapter_index === 4));
  assert.ok(text.includes("乙"), "第 4 章之后应该能看到答案");
});

test("进度为第 1 章时只召回第 1 章", async () => {
  const chunks = await search(1);
  assert.ok(chunks.every((c) => c.chapter_index === 1));
});

test("检索层有越界兜底：SQL 被改坏时抛错而不是把后文喂给模型", async () => {
  await assert.rejects(
    () => search(2, "leaky"),
    /检索结果越界/,
    "过滤失效时必须抛错",
  );
});

test("buildContext 按章节和位置排序", () => {
  const chunks: RetrievedChunk[] = [
    { id: "c", chapter_index: 3, chunk_index: 0, content: "丙", similarity: 0.9 },
    { id: "a", chapter_index: 1, chunk_index: 1, content: "乙", similarity: 0.8 },
    { id: "b", chapter_index: 1, chunk_index: 0, content: "甲", similarity: 0.7 },
  ];
  const ctx = buildContext(chunks);
  assert.ok(ctx.indexOf("甲") < ctx.indexOf("乙"));
  assert.ok(ctx.indexOf("乙") < ctx.indexOf("丙"));
  assert.ok(ctx.includes("【第 1 章】"));
});

test("buildCitations 去重并带上章节标题", () => {
  const chunks: RetrievedChunk[] = [
    { id: "a", chapter_index: 2, chunk_index: 0, content: "", similarity: 1 },
    { id: "b", chapter_index: 2, chunk_index: 1, content: "", similarity: 1 },
    { id: "c", chapter_index: 1, chunk_index: 0, content: "", similarity: 1 },
  ];
  const titles = new Map([
    [1, "第一章 主角登场"],
    [2, "第二章 黑衣人"],
  ]);
  const citations = buildCitations(chunks, titles);
  assert.deepEqual(citations, [
    { chapterIndex: 1, chapterTitle: "第一章 主角登场" },
    { chapterIndex: 2, chapterTitle: "第二章 黑衣人" },
  ]);
});

test("没有召回时返回空数组，交给上层给固定回答", async () => {
  const empty = {
    rpc: async () => ({ data: [], error: null }),
  } as unknown as SupabaseClient;

  const chunks = await searchWithinProgress(
    empty,
    CONFIG,
    { bookId: "b", maxChapter: 1, question: "?" },
    fakeEmbed,
  );
  assert.deepEqual(chunks, []);
});
