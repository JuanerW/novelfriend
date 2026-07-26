import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseChapters, guessTitleFromFilename } from "./chapters";

test("识别「第X章」和中文数字", () => {
  const { chapters, fallback } = parseChapters(
    ["第一章 开始", "正文一", "第二章 继续", "正文二", "第十二章 跳跃", "正文三"].join("\n"),
  );
  assert.equal(fallback, false);
  assert.equal(chapters.length, 3);
  assert.deepEqual(
    chapters.map((c) => c.title),
    ["第一章 开始", "第二章 继续", "第十二章 跳跃"],
  );
});

test("识别「N.标题」格式", () => {
  const { chapters } = parseChapters(
    ["1.疯狂年代", "正文", "2.寂静的春天", "正文", "3.红岸之一", "正文"].join("\n"),
  );
  assert.equal(chapters.length, 3);
});

test("正文里的顿号提纲不算章节", () => {
  const { chapters } = parseChapters(
    ["第一章 报告", "他写道：", "1、物理学", "2、生物学", "第二章 后续", "内容"].join("\n"),
  );
  assert.equal(chapters.length, 2);
});

test("编号倒退的候选被丢弃", () => {
  const { chapters } = parseChapters(
    ["1.开始", "正文", "2.继续", "正文", "1.这是正文里的列表", "正文", "3.结束", "正文"].join("\n"),
  );
  assert.deepEqual(
    chapters.map((c) => c.title),
    ["1.开始", "2.继续", "3.结束"],
  );
});

test("日期不会被当成章节号", () => {
  const { chapters } = parseChapters(
    ["1.开始", "正文", "2.继续", "1989.03.21", "日记内容", "3.结束", "正文"].join("\n"),
  );
  assert.equal(chapters.length, 3);
  assert.ok(chapters[1].content.includes("1989.03.21"), "日期应留在正文里");
});

test("重复出现的短行按水印清除", () => {
  const lines: string[] = [];
  for (let i = 1; i <= 6; i++) {
    lines.push("《某书》 作者：某人", `${i}.第${i}节`, `这是第${i}节的正文。`);
  }
  const { chapters } = parseChapters(lines.join("\n"));
  assert.equal(chapters.length, 6);
  assert.ok(
    chapters.every((c) => !c.content.includes("《某书》")),
    "水印应被清除",
  );
});

test("没有章节标题时整本作为一章", () => {
  const { chapters, fallback } = parseChapters("就是一段文字。\n第二段。");
  assert.equal(fallback, true);
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].title, "全文");
});

test("只有一个候选标题时也走 fallback", () => {
  const { fallback } = parseChapters(["第一章 唯一", "正文内容"].join("\n"));
  assert.equal(fallback, true);
});

test("chapter_index 从 1 开始且连续", () => {
  const raw = readFileSync("fixtures/test-novel.txt", "utf8");
  const { chapters } = parseChapters(raw);
  assert.equal(chapters.length, 4);
  assert.deepEqual(
    chapters.map((c) => c.chapterIndex),
    [1, 2, 3, 4],
  );
});

test("测试小说的剧透分布符合预期", () => {
  const raw = readFileSync("fixtures/test-novel.txt", "utf8");
  const { chapters } = parseChapters(raw);
  // 第 4 章之前不能出现「是乙」这个答案
  assert.ok(!chapters[1].content.includes("乙"), "第 2 章不应提到乙");
  assert.ok(chapters[2].content.includes("甲"), "第 3 章应有人猜测是甲");
  assert.ok(!chapters[2].content.includes("乙"), "第 3 章不应提到乙");
  assert.ok(chapters[3].content.includes("乙"), "第 4 章才揭晓是乙");
});

test("从文件名猜书名", () => {
  assert.equal(guessTitleFromFilename("三体.txt"), "三体");
  assert.equal(guessTitleFromFilename("三体（校对版）.txt"), "三体");
  assert.equal(guessTitleFromFilename(".txt"), "未命名");
});
