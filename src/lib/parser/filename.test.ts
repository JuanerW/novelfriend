import { test } from "node:test";
import assert from "node:assert/strict";
import { toStorageName } from "./filename";

/** Supabase Storage 服务端对 key 的字符集限制，ASCII-only。 */
const STORAGE_KEY_OK = /^[A-Za-z0-9._\-/]+$/;

test("中文文件名清洗后可用作 storage key", () => {
  const name = toStorageName("三体I：地球往事.txt");
  assert.ok(STORAGE_KEY_OK.test(name), `含非法字符：${name}`);
  assert.ok(name.endsWith(".txt"));
});

test("清洗后只剩零碎字符时用兜底名，不产生 I.txt 这种", () => {
  assert.equal(toStorageName("三体I：地球往事.txt"), "novel.txt");
  assert.equal(toStorageName("第一部（上）.txt"), "novel.txt");
});

test("全角冒号这类标点被替换", () => {
  assert.ok(!toStorageName("书名：副标题.txt").includes("："));
});

test("纯中文名有兜底，不会只剩扩展名", () => {
  assert.equal(toStorageName("三体.txt"), "novel.txt");
});

test("ASCII 文件名基本保持原样", () => {
  assert.equal(toStorageName("three-body_1.txt"), "three-body_1.txt");
});

test("空格和括号被替换", () => {
  const n = toStorageName("Three Body (v2).txt");
  assert.ok(STORAGE_KEY_OK.test(n));
  assert.equal(n, "Three_Body_v2.txt");
});

test("没有扩展名时补 txt", () => {
  assert.equal(toStorageName("novel"), "novel.txt");
});

test("扩展名统一小写", () => {
  assert.equal(toStorageName("Book.TXT"), "Book.txt");
});

test("过长的名字被截断，扩展名保留", () => {
  const n = toStorageName("a".repeat(300) + ".txt");
  assert.ok(n.length <= 85, `太长：${n.length}`);
  assert.ok(n.endsWith(".txt"));
});

test("连续非法字符不会产生一串下划线", () => {
  assert.ok(!toStorageName("a———b.txt").includes("__"));
});

test("首尾的点和下划线被去掉，避免 .. 之类的路径问题", () => {
  const n = toStorageName("...危险....txt");
  assert.ok(!n.startsWith("."), n);
  assert.ok(STORAGE_KEY_OK.test(n));
});

test("路径分隔符不会被带进对象名里", () => {
  const n = toStorageName("../../etc/passwd.txt");
  assert.ok(!n.includes("/"), n);
  assert.ok(STORAGE_KEY_OK.test(n));
});
