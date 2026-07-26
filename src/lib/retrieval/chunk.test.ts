import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseChapters } from "../parser/chapters";
import {
  chunkChapter,
  chunkChapters,
  estimateTokens,
  MAX_TOKENS,
} from "./chunk";

test("空章节不产生 chunk", () => {
  assert.equal(chunkChapter(1, "   \n\n ").length, 0);
});

test("短章节只产生一个 chunk", () => {
  const chunks = chunkChapter(7, "很短的一章。");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].chapterIndex, 7);
  assert.equal(chunks[0].chunkIndex, 0);
});

test("chunk 不跨章节", () => {
  const chunks = chunkChapters([
    { chapterIndex: 1, content: "第一章的内容。".repeat(200) },
    { chapterIndex: 2, content: "第二章的内容。".repeat(200) },
  ]);
  for (const c of chunks) {
    const marker = c.chapterIndex === 1 ? "第一章" : "第二章";
    const other = c.chapterIndex === 1 ? "第二章" : "第一章";
    assert.ok(c.content.includes(marker));
    assert.ok(!c.content.includes(other), "chunk 里混进了别的章节");
  }
});

test("chunkIndex 在章节内从 0 开始且连续", () => {
  const chunks = chunkChapter(3, "一段内容。".repeat(500));
  assert.ok(chunks.length > 1);
  chunks.forEach((c, i) => assert.equal(c.chunkIndex, i));
});

test("没有 chunk 超过 MAX_TOKENS", () => {
  const raw = readFileSync("fixtures/test-novel.txt", "utf8");
  const { chapters } = parseChapters(raw);
  const chunks = chunkChapters(
    chapters.map((c) => ({ chapterIndex: c.chapterIndex, content: c.content })),
  );
  for (const c of chunks) {
    assert.ok(
      estimateTokens(c.content) <= MAX_TOKENS,
      `chunk 超长：${estimateTokens(c.content)} tokens`,
    );
  }
});

test("相邻 chunk 有重叠", () => {
  const paragraphs: string[] = [];
  for (let i = 0; i < 40; i++) {
    paragraphs.push(`这是第${i}段内容，用来把章节撑到需要切分的长度。`.repeat(3));
  }
  const chunks = chunkChapter(1, paragraphs.join("\n"));
  assert.ok(chunks.length > 1, "应该切成多块");

  const tail = chunks[0].content.slice(-20).replace(/\s/g, "");
  assert.ok(
    chunks[1].content.replace(/\s/g, "").includes(tail.slice(-10)),
    "相邻 chunk 应有重叠",
  );
});

test("超长单段落会被按句子切开", () => {
  const long = "这是一个句子。".repeat(600);
  const chunks = chunkChapter(1, long);
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    assert.ok(estimateTokens(c.content) <= MAX_TOKENS);
  }
});

test("token 估算：中文约 1 字 1 token，英文约 4 字符 1 token", () => {
  assert.equal(estimateTokens("中文十个字符测试用"), 9);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens(""), 0);
});
