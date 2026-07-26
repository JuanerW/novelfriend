import { test } from "node:test";
import assert from "node:assert/strict";
import { LlmError, isTransient, withRetry, normalizeBaseUrl } from "./client";

test("normalizeBaseUrl 去掉尾斜杠和误填的路径", () => {
  assert.equal(normalizeBaseUrl("http://x/v1/"), "http://x/v1");
  assert.equal(normalizeBaseUrl("http://x/v1///"), "http://x/v1");
  assert.equal(normalizeBaseUrl("  http://x/v1  "), "http://x/v1");
  assert.equal(normalizeBaseUrl("http://x/v1/chat/completions"), "http://x/v1");
  assert.equal(normalizeBaseUrl("http://x/v1/embeddings"), "http://x/v1");
});

test("429 和 5xx 算瞬时错误", () => {
  assert.equal(isTransient(new LlmError("rate limit", 429)), true);
  assert.equal(isTransient(new LlmError("boom", 500)), true);
  assert.equal(isTransient(new LlmError("gateway", 503)), true);
});

test("网络层错误（无 status）也算瞬时", () => {
  assert.equal(isTransient(new LlmError("连不上")), true);
});

test("401 / 400 不重试——那是配置问题", () => {
  assert.equal(isTransient(new LlmError("bad key", 401)), false);
  assert.equal(isTransient(new LlmError("bad request", 400)), false);
  assert.equal(isTransient(new LlmError("not found", 404)), false);
});

test("非 LlmError 不重试", () => {
  assert.equal(isTransient(new Error("其它错误")), false);
});

test("withRetry 在瞬时错误后重试并最终成功", async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    if (calls < 3) throw new LlmError("rate limit", 429);
    return "ok";
  }, () => 0);

  assert.equal(result, "ok");
  assert.equal(calls, 3);
});

test("withRetry 对不可重试的错误立刻放弃", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(async () => {
        calls++;
        throw new LlmError("bad key", 401);
      }, () => 0),
    /bad key/,
  );
  assert.equal(calls, 1, "401 不应该重试");
});

test("withRetry 用尽次数后抛出最后一个错误", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(async () => {
        calls++;
        throw new LlmError("always 500", 500);
      }, () => 0),
    /always 500/,
  );
  assert.equal(calls, 4, "首次 + 3 次重试");
});

test("withRetry 首次成功就不重试", async () => {
  let calls = 0;
  const r = await withRetry(async () => {
    calls++;
    return 42;
  }, () => 0);
  assert.equal(r, 42);
  assert.equal(calls, 1);
});
